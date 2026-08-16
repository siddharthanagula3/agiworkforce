import 'server-only';

import crypto from 'node:crypto';

const { createCipheriv, createDecipheriv, randomBytes } = crypto;

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyEnv = process.env['DEVICE_TOKEN_ENCRYPTION_KEY'];
  if (keyEnv) {
    if (keyEnv.length !== 64) {
      throw new Error('DEVICE_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(keyEnv)) {
      throw new Error('DEVICE_TOKEN_ENCRYPTION_KEY must contain only hexadecimal characters');
    }
    return Buffer.from(keyEnv, 'hex');
  }

  throw new Error(
    'DEVICE_TOKEN_ENCRYPTION_KEY must be set. ' +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

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
