import 'server-only';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

/**
 * AES-256-GCM encryption for user-supplied custom MCP connector bearer
 * tokens (`user_custom_connectors.auth_header_enc`).
 *
 * Mirrors the encryptToken/decryptToken pattern in lib/github-app.ts, but
 * uses its own dedicated key so a compromise of one secret domain (GitHub
 * App installation tokens vs. user-supplied MCP bearer tokens) does not
 * expose the other.
 */

const CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY = process.env['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY'];

// Cache the dev fallback key so encrypt/decrypt agree within a process.
let _devFallbackKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  const keyHex = CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    // Dev-only fallback — in production CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY
    // must be set, or encrypted tokens become unreadable across restarts.
    if (!_devFallbackKey) {
      _devFallbackKey = randomBytes(32);
    }
    return _devFallbackKey;
  }
  return Buffer.from(keyHex, 'hex');
}

export function encryptConnectorToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decryptConnectorToken(encryptedValue: string): string {
  const key = getEncryptionKey();
  const [ivHex, dataHex, tagHex] = encryptedValue.split(':');
  if (!ivHex || !dataHex || !tagHex) throw new Error('Invalid encrypted token format');
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
