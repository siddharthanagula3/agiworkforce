import 'server-only';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
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

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
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

/**
 * Generate a new API key and derive a secure hash using Argon2id.
 * Argon2id is the recommended algorithm for password/key hashing (OWASP).
 * The hash is self-describing and includes salt, parameters, and the derived key.
 */
async function generateKey(): Promise<{ raw: string; hash: string }> {
  // Generate the raw API key
  const raw = 'sk_live_' + randomBytes(24).toString('hex');

  // Derive the hash using Argon2id (memory-hard KDF, resistant to GPU attacks)
  const hash = await argon2.hash(raw, ARGON2_OPTIONS);

  return { raw, hash };
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
   * RETURNS THE RAW KEY ONLY ONCE.
   */
  static async createApiKey(
    userId: string,
    name: string,
    scopes: string[] = [],
  ): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const supabase = getSupabaseClient();
    const { raw, hash } = await generateKey();

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        name,
        key_hash: hash,
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
   * List user's API Keys
   * PERFORMANCE OPTIMIZATION: Select only required columns instead of '*'
   * to reduce data transfer and improve query performance.
   */
  static async listApiKeys(userId: string): Promise<ApiKey[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
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
   * Revoke/Delete API Key
   */
  static async revokeApiKey(id: string, userId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('api_keys').delete().eq('id', id).eq('user_id', userId); // Ensure ownership

    if (error) {
      logger.error({ error, id }, 'Failed to revoke API key');
      throw error;
    }
  }

  /**
   * Verify an API Key (for external API usage)
   * Supports three hash formats for backward compatibility:
   * 1. Argon2id (primary) - new keys use this
   * 2. scrypt (legacy) - migrated on successful auth
   * 3. SHA-256 unsalted (legacy) - migrated on successful auth
   *
   * SECURITY: Legacy keys are automatically rehashed to Argon2id on successful verification.
   *
   * PERFORMANCE OPTIMIZATION:
   * - Select only required columns for verification (id, key_hash, user_id, scopes, expires_at)
   * - Use early return for invalid key format
   * - Fire-and-forget update for last_used_at to avoid blocking
   * - Consider implementing Redis caching for verified keys in high-traffic scenarios
   */
  static async verifyKey(rawKey: string): Promise<ApiKey | null> {
    const supabase = getSupabaseClient();

    // Early return for invalid key format
    // The raw key format is: sk_live_<48 hex chars>
    if (!rawKey.startsWith('sk_live_')) {
      return null;
    }

    // Fetch only required columns for verification to reduce data transfer
    // key_hash is needed for verification, other fields are returned if valid
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, user_id, name, key_hash, scopes, created_at, expires_at, last_used_at')
      .or('expires_at.is.null,expires_at.gt.now()')
      .limit(1000); // Safety limit

    if (error || !keys || keys.length === 0) {
      return null;
    }

    // Verify against each key's hash
    for (const key of keys) {
      const result = await verifyKeyHash(rawKey, key.key_hash);
      if (result.valid) {
        // Update last used (fire and forget - don't await)
        void supabase
          .from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', key.id)
          .then(({ error: updateError }) => {
            if (updateError) {
              logger.error({ error: updateError }, 'Failed to update last_used_at');
            }
          });

        // Rehash legacy keys to Argon2id (fire and forget - don't await)
        // This provides transparent migration to the stronger hash algorithm
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
              // Don't throw - rehashing failure shouldn't affect authentication
            }
          })();
        }

        // Return key without the hash for security
        const { key_hash: _keyHash, ...keyWithoutHash } = key;
        void _keyHash; // Intentionally discarded for security
        return keyWithoutHash as ApiKey;
      }
    }

    return null;
  }
}

// Export hash format detection for audit scripts
export { detectHashFormat, type HashFormat };
