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

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

function getEncryptionKey(): Buffer {
  const keyHex = CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY;
  if (keyHex && HEX_64_RE.test(keyHex)) {
    return Buffer.from(keyHex, 'hex');
  }

  // AUDIT-FIX CON-12: fail closed outside development. A per-process random key
  // silently produces ciphertext that a sibling serverless instance — or this
  // instance after a restart — cannot decrypt. That surfaces as intermittent,
  // unreproducible connector auth failures instead of as a configuration error,
  // and every stored ciphertext becomes permanently unreadable after a redeploy.
  // A misconfigured production deploy must not look healthy.
  //
  // Note the check is now a hex-shape test, not a length test: a 64-character
  // non-hex value previously reached Buffer.from(_, 'hex'), which silently
  // truncates and yields a short key.
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY is missing or malformed (expected 64 hex characters). ' +
        'Custom connector bearer tokens cannot be encrypted or decrypted without it.',
    );
  }

  // Development-only fallback, cached so encrypt/decrypt agree within a process.
  if (!_devFallbackKey) {
    _devFallbackKey = randomBytes(32);
  }
  return _devFallbackKey;
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
