import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'crypto';
import { ApiKey } from '@/types/saas';

// Scrypt parameters for secure key derivation
// These provide a good balance of security and performance
const SCRYPT_KEY_LEN = 64; // Output key length in bytes

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
 * Generate a new API key with a random salt and derive a secure hash using scrypt.
 * The salt is stored alongside the hash in the format: salt$hash
 * This protects against rainbow table attacks and ensures each key has a unique hash.
 */
async function generateKey(): Promise<{ raw: string; hash: string }> {
  // Generate the raw API key
  const raw = 'sk_live_' + randomBytes(24).toString('hex');

  // Generate a random salt (16 bytes = 128 bits)
  const salt = randomBytes(16).toString('hex');

  // Derive the hash using scrypt (a memory-hard KDF)
  const derivedKey = await scryptAsync(raw, salt, SCRYPT_KEY_LEN);

  // Store salt and hash together, separated by $
  // Format: salt$hash (both in hex)
  const hash = `${salt}$${derivedKey.toString('hex')}`;

  return { raw, hash };
}

/**
 * Verify a raw API key against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
async function verifyKeyHash(rawKey: string, storedHash: string): Promise<boolean> {
  try {
    // Parse the stored hash format: salt$hash
    const [salt, expectedHash] = storedHash.split('$');

    if (!salt || !expectedHash) {
      // Invalid hash format - might be an old unsalted hash
      // For backward compatibility, fall back to simple SHA256 comparison
      // TODO: Remove this fallback after migrating all existing keys
      logger.warn('Encountered API key with legacy hash format (unsalted)');
      const legacyHash = createHash('sha256').update(rawKey).digest('hex');
      return legacyHash === storedHash;
    }

    // Derive the hash from the provided key using the stored salt
    const derivedKey = await scryptAsync(rawKey, salt, SCRYPT_KEY_LEN);

    // Use timing-safe comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    return timingSafeEqual(derivedKey, expectedBuffer);
  } catch (error) {
    logger.error({ error }, 'Error verifying API key hash');
    return false;
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
   * Supports both new salted hashes and legacy unsalted hashes for backward compatibility.
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
      const isValid = await verifyKeyHash(rawKey, key.key_hash);
      if (isValid) {
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

        // Return key without the hash for security
        const { key_hash: _keyHash, ...keyWithoutHash } = key;
        void _keyHash; // Intentionally discarded for security
        return keyWithoutHash as ApiKey;
      }
    }

    return null;
  }
}
