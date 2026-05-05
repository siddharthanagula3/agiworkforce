/**
 * @file api-key-service.ts
 *
 * # Client injection contract (WEB-RLS-BYPASS mitigation)
 *
 * USER-CONTEXT methods (`createApiKey`, `listApiKeys`, `revokeApiKey`) accept a
 *   `client: SupabaseClient` parameter. Callers pass `getUserClient(jwt)`.
 *
 * SERVICE-CONTEXT methods:
 *   `verifyKey()` - receives only a raw API key (no user JWT). Must use service-role
 *   to look up the key across all users. Once verified, downstream callers should
 *   construct a `getUserClient(jwt)` for subsequent user-scoped operations.
 *
 * Never add a private `getSupabaseClient()` here. See lib/services/README.md.
 */
import 'server-only';

import { type SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'crypto';
import { ApiKey } from '@/types/saas';
import argon2 from 'argon2';

// Scrypt parameters for secure key derivation (legacy)
// These provide a good balance of security and performance
const SCRYPT_KEY_LEN = 64; // Output key length in bytes

// Argon2id options (OWASP recommended)
// See: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

// Hash format detection
type HashFormat = 'argon2id' | 'scrypt' | 'sha256';

function detectHashFormat(storedHash: string): HashFormat {
  if (storedHash.startsWith('$argon2id$')) {
    return 'argon2id';
  }
  // Scrypt format: salt$hash (32 hex chars for salt, 128 hex chars for hash)
  const parts = storedHash.split('$');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return 'scrypt';
  }
  // Legacy SHA-256: 64 hex characters, no separator
  return 'sha256';
}

/**
 * Promisified scrypt wrapper with proper typing
 */
function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// RT-02 fix: API key format now embeds a key_id prefix so verifyKey can do a
// single-row DB lookup instead of scanning all active keys.
// Format: sk_live_<keyId16hex>_<secret48hex>
// - keyId: 8 random bytes → 16 hex chars. Stored as `key_prefix` column.
// - secret: 24 random bytes → 48 hex chars. Only the Argon2id hash is stored.
//
// Backward compat: old keys (no underscore after sk_live_ prefix beyond the
// 8-char prefix segment) fall through to the legacy slow-scan path, which is
// rate-limited per IP at 5/min by callers.
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
  // secret: 24 bytes → 48 hex chars (never stored; only the hash is stored)
  const secret = randomBytes(24).toString('base64url');
  // Full raw key embeds the keyId so verifyKey can extract it for single-row lookup
  const raw = `sk_live_${keyId}_${secret}`;

  // Derive the hash using Argon2id (memory-hard KDF, resistant to GPU attacks)
  const hash = await argon2.hash(raw, ARGON2_OPTIONS);

  return { raw, hash, keyId };
}

/**
 * Rehash a raw key with Argon2id.
 * Used for migrating legacy keys on successful authentication.
 */
async function rehashWithArgon2(rawKey: string): Promise<string> {
  return argon2.hash(rawKey, ARGON2_OPTIONS);
}

/**
 * Result of key verification including whether rehashing is needed
 */
interface VerifyResult {
  valid: boolean;
  format: HashFormat;
  needsRehash: boolean;
}

/**
 * Verify a raw API key against a stored hash.
 * Supports three hash formats:
 * 1. Argon2id (primary, starts with $argon2id$)
 * 2. scrypt (legacy, format: salt$hash)
 * 3. SHA-256 (legacy unsalted, 64 hex chars)
 *
 * Uses timing-safe comparison where applicable to prevent timing attacks.
 */
async function verifyKeyHash(rawKey: string, storedHash: string): Promise<VerifyResult> {
  try {
    const format = detectHashFormat(storedHash);

    switch (format) {
      case 'argon2id': {
        // Argon2id verification (timing-safe internally)
        const valid = await argon2.verify(storedHash, rawKey);
        return { valid, format, needsRehash: false };
      }

      case 'scrypt': {
        // Legacy scrypt format: salt$hash
        const [salt, expectedHash] = storedHash.split('$');
        if (!salt || !expectedHash) {
          return { valid: false, format, needsRehash: false };
        }

        const derivedKey = await scryptAsync(rawKey, salt, SCRYPT_KEY_LEN);
        const expectedBuffer = Buffer.from(expectedHash, 'hex');
        const valid = timingSafeEqual(derivedKey, expectedBuffer);

        if (valid) {
          logger.info('API key with scrypt hash verified, will rehash to Argon2id');
        }
        return { valid, format, needsRehash: valid };
      }

      case 'sha256': {
        // Legacy unsalted SHA-256 (64 hex characters)
        logger.warn('Encountered API key with legacy hash format (unsalted SHA-256)');
        const legacyHash = createHash('sha256').update(rawKey).digest('hex');

        // Use timing-safe comparison for legacy hashes too
        const valid =
          legacyHash.length === storedHash.length &&
          timingSafeEqual(Buffer.from(legacyHash), Buffer.from(storedHash));

        if (valid) {
          logger.info('API key with SHA-256 hash verified, will rehash to Argon2id');
        }
        return { valid, format, needsRehash: valid };
      }

      default: {
        // Exhaustive check
        const _exhaustive: never = format;
        return { valid: false, format: _exhaustive, needsRehash: false };
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error verifying API key hash');
    return { valid: false, format: 'sha256', needsRehash: false };
  }
}

/**
 * Update the key hash in the database (for rehashing on auth)
 */
async function updateKeyHash(
  supabase: SupabaseClient,
  keyId: string,
  newHash: string,
): Promise<void> {
  const { error } = await supabase.from('api_keys').update({ key_hash: newHash }).eq('id', keyId);

  if (error) {
    logger.error({ error, keyId }, 'Failed to update API key hash during rehash');
    // Don't throw - rehashing failure shouldn't block authentication
  } else {
    logger.info({ keyId }, 'Successfully rehashed API key to Argon2id');
  }
}

export class ApiKeyService {
  /**
   * Create a new API Key.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so inserts are
   * scoped to the authenticated user's rows.
   * RETURNS THE RAW KEY ONLY ONCE.
   *
   * RT-02: Stores `key_prefix` (the keyId segment) for O(1) verification lookup.
   */
  static async createApiKey(
    client: SupabaseClient,
    userId: string,
    name: string,
    scopes: string[] = [],
  ): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const { raw, hash, keyId } = await generateKey();

    const { data, error } = await client
      .from('api_keys')
      .insert({
        user_id: userId,
        name,
        key_hash: hash,
        // RT-02: key_prefix stores the keyId for fast single-row lookup in verifyKey.
        // Column must exist in DB; migration adds it as nullable for backward compat.
        key_prefix: keyId,
        scopes,
        expires_at: null, // customizable
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, userId }, 'Failed to create API key');
      throw error;
    }

    return { apiKey: data as ApiKey, rawKey: raw };
  }

  /**
   * List user's API Keys.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so only the
   * requesting user's keys are returned.
   *
   * PERFORMANCE OPTIMIZATION: Select only required columns instead of '*'
   * to reduce data transfer and improve query performance.
   */
  static async listApiKeys(client: SupabaseClient, userId: string): Promise<ApiKey[]> {
    const { data, error } = await client
      .from('api_keys')
      .select('id, user_id, name, scopes, created_at, expires_at, last_used_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, userId }, 'Failed to list API keys');
      throw error;
    }

    return data as ApiKey[];
  }

  /**
   * Revoke/Delete API Key.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient to enforce
   * ownership via RLS in addition to the explicit .eq('user_id', userId).
   */
  static async revokeApiKey(client: SupabaseClient, id: string, userId: string): Promise<void> {
    const { error } = await client.from('api_keys').delete().eq('id', id).eq('user_id', userId); // Ensure ownership

    if (error) {
      logger.error({ error, id }, 'Failed to revoke API key');
      throw error;
    }
  }

  /**
   * Verify an API Key (for external API usage).
   * SERVICE-CONTEXT: this method receives a raw API key with no user JWT.
   * It must use service-role to look up the key by prefix across all users.
   * Once a key is verified and user_id is returned, downstream callers should
   * construct a getUserClient(jwt) for any further user-scoped operations.
   *
   * RT-02 FIX: Two-path verification to prevent DoS via Argon2 fan-out:
   *
   * FAST PATH (new keys): Parse keyId from `sk_live_<keyId16>_<secret>` format,
   * do a single DB lookup by `key_prefix = keyId`, run exactly one Argon2id call.
   *
   * LEGACY PATH (old format): Fall back to per-user scan if the key doesn't
   * match the new format. This path MUST only be exercised after per-IP rate
   * limiting (5/min) by the caller to prevent DoS.
   *
   * PARSE-TIME REJECTION: Any key not matching `^sk_(live|test)_[A-Za-z0-9_]{20,}$`
   * is rejected immediately with no Argon2 work.
   */
  static async verifyKey(rawKey: string): Promise<ApiKey | null> {
    // SECURITY: service-role required because verifyKey receives only a raw API key
    // (no user JWT). It must look up the key across all users to identify the owner.
    const supabase = getServiceClient();

    // Parse-time rejection: reject keys that don't even look like API keys.
    // Regex allows both new format (with embedded keyId) and old format (no underscore separator).
    const VALID_KEY_PATTERN = /^sk_(?:live|test)_[A-Za-z0-9_]{20,}$/;
    if (!VALID_KEY_PATTERN.test(rawKey)) {
      // No Argon2 work — immediate rejection
      return null;
    }

    // Try to extract keyId from new format: sk_live_<16hex>_<rest>
    const keyIdMatch = KEY_ID_REGEX.exec(rawKey);

    if (keyIdMatch?.[1]) {
      // FAST PATH: Single DB lookup by key_prefix
      const keyId = keyIdMatch[1];
      const { data: keys, error } = await supabase
        .from('api_keys')
        .select(
          'id, user_id, name, key_hash, key_prefix, scopes, created_at, expires_at, last_used_at',
        )
        .eq('key_prefix', keyId)
        .or('expires_at.is.null,expires_at.gt.now()')
        .limit(2); // Expect exactly 1; limit(2) detects collision

      if (error || !keys || keys.length === 0) {
        return null;
      }

      // Run Argon2 exactly once
      const key = keys[0]!;
      const result = await verifyKeyHash(rawKey, key.key_hash);
      if (!result.valid) return null;

      void supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', key.id)
        .then(({ error: updateError }) => {
          if (updateError) logger.error({ error: updateError }, 'Failed to update last_used_at');
        });

      if (result.needsRehash) {
        void (async () => {
          try {
            const newHash = await rehashWithArgon2(rawKey);
            await updateKeyHash(supabase, key.id, newHash);
          } catch (rehashError) {
            logger.error({ error: rehashError, keyId: key.id }, 'Failed to rehash API key');
          }
        })();
      }

      const { key_hash: _h, key_prefix: _p, ...keyWithoutSecrets } = key;
      void _h;
      void _p;
      return keyWithoutSecrets as ApiKey;
    }

    // LEGACY PATH: Old key format — no key_id prefix. Scan user's keys only.
    // Caller MUST enforce per-IP rate limiting (5/min) before reaching this path.
    logger.warn({ keyPrefix: rawKey.slice(0, 12) }, 'RT-02: legacy key format — slow Argon2 path');

    // Fetch only required columns for verification to reduce data transfer
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select(
        'id, user_id, name, key_hash, key_prefix, scopes, created_at, expires_at, last_used_at',
      )
      .is('key_prefix', null) // Only old-format keys lack a key_prefix
      .or('expires_at.is.null,expires_at.gt.now()')
      .limit(1000); // Safety limit

    if (error || !keys || keys.length === 0) {
      return null;
    }

    for (const key of keys) {
      const result = await verifyKeyHash(rawKey, key.key_hash);
      if (result.valid) {
        void supabase
          .from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', key.id)
          .then(({ error: updateError }) => {
            if (updateError) logger.error({ error: updateError }, 'Failed to update last_used_at');
          });

        if (result.needsRehash) {
          void (async () => {
            try {
              const newHash = await rehashWithArgon2(rawKey);
              await updateKeyHash(supabase, key.id, newHash);
            } catch (rehashError) {
              logger.error(
                { error: rehashError, keyId: key.id, fromFormat: result.format },
                'Failed to rehash API key to Argon2id',
              );
            }
          })();
        }

        const { key_hash: _keyHash, key_prefix: _kp, ...keyWithoutHash } = key;
        void _keyHash;
        void _kp;
        return keyWithoutHash as ApiKey;
      }
    }

    return null;
  }
}

// Export hash format detection for audit scripts
export { detectHashFormat, type HashFormat };
