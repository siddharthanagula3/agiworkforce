/**
 * @file api-key-service.ts
 *
 * # Client injection contract (WEB-RLS-BYPASS mitigation)
 *
 * USER-CONTEXT methods (`createApiKey`, `listApiKeys`, `revokeApiKey`) accept a
 *   `db: DatabaseAdapter` parameter. Callers pass `getNeonDb()` bound to the
 *   authenticated user via `db.withUser(jwt)`.
 *
 * SERVICE-CONTEXT methods:
 *   `verifyKey()` - receives only a raw API key (no user JWT). Must use the
 *   service-level db adapter to look up the key across all users. Once verified,
 *   downstream callers should use `getNeonDb().withUser(jwt)` for subsequent
 *   user-scoped operations.
 *
 * Never add direct DB client construction here. See lib/services/README.md.
 */
import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { randomBytes } from 'crypto';
import type { ApiKeyRow } from '@/lib/server/neon-types';
import argon2 from 'argon2';

// Argon2id options (OWASP recommended)
// See: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

// RT-02 fix: API key format embeds a key_id prefix so verifyKey can do a
// single-row DB lookup instead of scanning all active keys.
// Format: sk_live_<keyId16hex>_<secret48hex>
// - keyId: 8 random bytes → 16 hex chars. Stored as `key_prefix` column.
// - secret: 24 random bytes → 48 hex chars. Only the Argon2id hash is stored.
//
// Both segments are hex (never base64url) so they can never contain a
// character outside VALID_KEY_PATTERN's `[A-Za-z0-9_]` class below — a
// base64url secret can contain `-`, which would fail that pattern's `$`
// anchor and reject a real, just-issued key.
//
// `key_prefix` is `NOT NULL` at the schema level (0005_api_keys.sql), so
// every row always has one: there is no legacy "no prefix" format to scan
// for, and no slow-path fallback is needed.
export const KEY_ID_REGEX = /^sk_live_([0-9a-f]{16})_[A-Za-z0-9]{1,}/;

/**
 * Generate a new API key and derive a secure hash using Argon2id.
 * Argon2id is the recommended algorithm for password/key hashing (OWASP).
 * The hash is self-describing and includes salt, parameters, and the derived key.
 *
 * RT-02: New keys embed a keyId prefix so verification can be O(1) DB lookup.
 */
async function generateKey(): Promise<{ raw: string; hash: string; keyId: string }> {
  // keyId: 8 bytes → 16 hex chars (stored in DB, used as lookup index)
  const keyId = randomBytes(8).toString('hex');
  // secret: 24 bytes → 48 hex chars (never stored; only the hash is stored).
  // Hex, not base64url — see the VALID_KEY_PATTERN note above KEY_ID_REGEX.
  const secret = randomBytes(24).toString('hex');
  // Full raw key embeds the keyId so verifyKey can extract it for single-row lookup
  const raw = `sk_live_${keyId}_${secret}`;

  // Derive the hash using Argon2id (memory-hard KDF, resistant to GPU attacks)
  const hash = await argon2.hash(raw, ARGON2_OPTIONS);

  return { raw, hash, keyId };
}

/**
 * Verify a raw API key against its stored Argon2id hash.
 * Every key created by `generateKey()` is Argon2id-hashed, so this is the
 * only format this service ever needs to check (timing-safe internally).
 */
async function verifyKeyHash(rawKey: string, storedHash: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, rawKey);
  } catch (error) {
    logger.error({ error }, 'Error verifying API key hash');
    return false;
  }
}

export class ApiKeyService {
  /**
   * Create a new API Key.
   * USER-CONTEXT: caller passes a DatabaseAdapter bound to the authenticated user
   * so inserts are scoped to the authenticated user's rows.
   * RETURNS THE RAW KEY ONLY ONCE.
   *
   * RT-02: Stores `key_prefix` (the keyId segment) for O(1) verification lookup.
   */
  static async createApiKey(
    db: DatabaseAdapter,
    userId: string,
    name: string,
    scopes: string[] = [],
  ): Promise<{ apiKey: ApiKeyRow; rawKey: string }> {
    const { raw, hash, keyId } = await generateKey();

    const rows = await db.query<ApiKeyRow>(
      `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, NULL)
       RETURNING *`,
      [userId, name, hash, keyId, scopes],
    );

    if (!rows[0]) {
      const err = new Error('Failed to create API key: no row returned');
      logger.error({ userId }, err.message);
      throw err;
    }

    return { apiKey: rows[0], rawKey: raw };
  }

  /**
   * List user's API Keys.
   * USER-CONTEXT: caller passes a DatabaseAdapter bound to the authenticated user
   * so only the requesting user's keys are returned.
   *
   * PERFORMANCE OPTIMIZATION: Select only required columns instead of '*'
   * to reduce data transfer and improve query performance.
   */
  static async listApiKeys(
    db: DatabaseAdapter,
    userId: string,
  ): Promise<
    Array<
      Pick<
        ApiKeyRow,
        'id' | 'user_id' | 'name' | 'scopes' | 'created_at' | 'expires_at' | 'last_used_at'
      >
    >
  > {
    return db.query<ApiKeyRow>(
      `SELECT id, user_id, name, scopes, created_at, expires_at, last_used_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
  }

  /**
   * Revoke an API Key (soft-delete via `revoked_at`, preserving the audit
   * trail — see 0023_api_keys.sql). USER-CONTEXT: caller passes a
   * DatabaseAdapter bound to the authenticated user to enforce ownership in
   * addition to the explicit user_id check. Idempotent: revoking an
   * already-revoked key is a no-op.
   */
  static async revokeApiKey(db: DatabaseAdapter, id: string, userId: string): Promise<void> {
    await db.execute(
      'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
      [id, userId],
    );
  }

  /**
   * Verify an API Key (for external API usage).
   * SERVICE-CONTEXT: this method receives a raw API key with no user JWT.
   * It must use the service-level db adapter to look up the key by prefix
   * across all users. Once a key is verified and user_id is returned, downstream
   * callers should use getNeonDb().withUser(jwt) for any further user-scoped ops.
   *
   * RT-02 FIX: single-row lookup instead of an Argon2 scan fan-out:
   * parse the keyId out of `sk_live_<keyId16>_<secret>`, do one DB lookup by
   * `key_prefix = keyId`, run exactly one Argon2id call.
   *
   * PARSE-TIME REJECTION: Any key not matching `^sk_(live|test)_[A-Za-z0-9_]{20,}$`
   * — or that doesn't carry an embedded keyId — is rejected immediately with
   * no DB or Argon2 work. There is no legacy scan fallback: `key_prefix` is
   * `NOT NULL` at the schema level, so a keyless lookup could never match a
   * row anyway.
   */
  static async verifyKey(
    rawKey: string,
  ): Promise<Omit<ApiKeyRow, 'key_hash' | 'key_prefix'> | null> {
    // SERVICE-CONTEXT: service-level db (no user JWT) to look up across all users.
    const db = getNeonDb();

    // Parse-time rejection: reject keys that don't even look like API keys.
    const VALID_KEY_PATTERN = /^sk_(?:live|test)_[A-Za-z0-9_]{20,}$/;
    if (!VALID_KEY_PATTERN.test(rawKey)) {
      // No DB or Argon2 work · immediate rejection
      return null;
    }

    // Extract the embedded keyId: sk_live_<16hex>_<rest>
    const keyIdMatch = KEY_ID_REGEX.exec(rawKey);
    if (!keyIdMatch?.[1]) {
      return null;
    }
    const keyId = keyIdMatch[1];

    const keys = await db.query<ApiKeyRow>(
      `SELECT id, user_id, name, key_hash, key_prefix, scopes, created_at, expires_at, last_used_at
       FROM api_keys
       WHERE key_prefix = $1
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())
       LIMIT 2`,
      [keyId],
    );

    if (!keys || keys.length === 0) {
      return null;
    }

    // Run Argon2 exactly once
    const key = keys[0]!;
    const valid = await verifyKeyHash(rawKey, key.key_hash);
    if (!valid) return null;

    // Fire-and-forget: update last_used_at
    db.execute('UPDATE api_keys SET last_used_at = $1 WHERE id = $2', [
      new Date().toISOString(),
      key.id,
    ]).catch((updateError: unknown) => {
      logger.error({ error: updateError }, 'Failed to update last_used_at');
    });

    const { key_hash: _h, key_prefix: _p, ...keyWithoutSecrets } = key;
    void _h;
    void _p;
    return keyWithoutSecrets;
  }
}
