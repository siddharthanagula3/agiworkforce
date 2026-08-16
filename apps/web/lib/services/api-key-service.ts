import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { randomBytes } from 'crypto';
import type { ApiKeyRow } from '@/lib/server/neon-types';
import argon2 from 'argon2';
import { API_KEY_SCOPE_VALUES, type ApiKeyScope } from '@/lib/api-key-scopes';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

export const KEY_ID_REGEX = /^sk_live_([0-9a-f]{16})_[A-Za-z0-9]{1,}/;

async function generateKey(): Promise<{ raw: string; hash: string; keyId: string }> {
  const keyId = randomBytes(8).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const raw = `sk_live_${keyId}_${secret}`;

  const hash = await argon2.hash(raw, ARGON2_OPTIONS);

  return { raw, hash, keyId };
}

async function verifyKeyHash(rawKey: string, storedHash: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, rawKey);
  } catch (error) {
    logger.error({ error }, 'Error verifying API key hash');
    return false;
  }
}

export class ApiKeyService {
  static async createApiKey(
    db: DatabaseAdapter,
    userId: string,
    name: string,
    scopes: ApiKeyScope[],
  ): Promise<{ apiKey: ApiKeyRow; rawKey: string }> {
    const uniqueScopes = new Set(scopes);
    if (
      scopes.length === 0 ||
      uniqueScopes.size !== scopes.length ||
      scopes.some((scope) => !API_KEY_SCOPE_VALUES.includes(scope))
    ) {
      throw new Error('At least one unique, supported API key scope is required');
    }

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

  static async revokeApiKey(db: DatabaseAdapter, id: string, userId: string): Promise<void> {
    await db.execute(
      'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
      [id, userId],
    );
  }

  static async verifyKey(
    rawKey: string,
  ): Promise<Omit<ApiKeyRow, 'key_hash' | 'key_prefix'> | null> {
    const db = getNeonDb();

    const VALID_KEY_PATTERN = /^sk_(?:live|test)_[A-Za-z0-9_]{20,}$/;
    if (!VALID_KEY_PATTERN.test(rawKey)) {
      return null;
    }

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

    const key = keys[0]!;
    const valid = await verifyKeyHash(rawKey, key.key_hash);
    if (!valid) return null;

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
