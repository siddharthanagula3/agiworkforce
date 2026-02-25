import 'server-only';

import crypto from 'node:crypto';

const { createCipheriv, createDecipheriv, randomBytes, hkdfSync } = crypto;

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Derives a 32-byte AES-256 key for device token encryption.
 *
 * Prefers `DEVICE_TOKEN_ENCRYPTION_KEY` (hex-encoded 32-byte key).
 * In production, DEVICE_TOKEN_ENCRYPTION_KEY is REQUIRED.
 * In development, falls back to HKDF derivation from SUPABASE_SERVICE_ROLE_KEY.
 *
 * BREAKING CHANGE (2026-02-24): The development fallback was changed from
 * SHA-256(SUPABASE_SERVICE_ROLE_KEY) to HKDF-SHA256. Any device tokens
 * encrypted with the old SHA-256 fallback will fail to decrypt. This only
 * affects development environments; production must use DEVICE_TOKEN_ENCRYPTION_KEY.
 */
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.DEVICE_TOKEN_ENCRYPTION_KEY;
  if (keyEnv) {
    if (keyEnv.length !== 64) {
      throw new Error('DEVICE_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(keyEnv)) {
      throw new Error('DEVICE_TOKEN_ENCRYPTION_KEY must contain only hexadecimal characters');
    }
    return Buffer.from(keyEnv, 'hex');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DEVICE_TOKEN_ENCRYPTION_KEY must be set in production. ' +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  // Development fallback: HKDF from SUPABASE_SERVICE_ROLE_KEY
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    throw new Error('Neither DEVICE_TOKEN_ENCRYPTION_KEY nor SUPABASE_SERVICE_ROLE_KEY is set');
  }
  const salt = Buffer.from('device-token-salt-v1');
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(serviceRole), salt, 'device-token-encryption', 32),
  );
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
