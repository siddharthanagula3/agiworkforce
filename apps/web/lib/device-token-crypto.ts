import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Derives a 32-byte AES-256 key for device token encryption.
 *
 * Prefers `DEVICE_TOKEN_ENCRYPTION_KEY` (hex-encoded 32-byte key).
 * Falls back to SHA-256 of `SUPABASE_SERVICE_ROLE_KEY` (deterministic but
 * unique per deployment).
 */
function getEncryptionKey(): Buffer {
  const explicit = process.env.DEVICE_TOKEN_ENCRYPTION_KEY;
  if (explicit) {
    const buf = Buffer.from(explicit, 'hex');
    if (buf.length !== 32) {
      throw new Error('DEVICE_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    return buf;
  }

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    throw new Error('Neither DEVICE_TOKEN_ENCRYPTION_KEY nor SUPABASE_SERVICE_ROLE_KEY is set');
  }

  // Derive a deterministic 32-byte key from the service role key
  return createHash('sha256').update(serviceRole).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * Returns a base64-encoded string containing: IV || ciphertext || authTag
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: IV (12) + ciphertext (variable) + authTag (16)
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

/**
 * Decrypts a token previously encrypted with `encryptToken`.
 *
 * Expects a base64-encoded string containing: IV || ciphertext || authTag
 */
export function decryptToken(encoded: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encoded, 'base64');

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted token: too short');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
