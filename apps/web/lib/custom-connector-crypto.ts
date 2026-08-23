import 'server-only';
import { randomBytes } from 'crypto';

import { loadKeyRing, openEnvelope, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';

const CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY = process.env['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY'];

let _devFallbackRing: KeyRing | null = null;

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

export const CONNECTOR_SECRET_PURPOSES = [
  'custom-connector-auth-header',
  'oauth-client-secret',
  'oauth-code-verifier',
  'oauth-access-token',
  'oauth-refresh-token',
] as const;

export type ConnectorSecretPurpose = (typeof CONNECTOR_SECRET_PURPOSES)[number];

function getKeyRing(): KeyRing {
  const keyHex = CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY;
  if (keyHex && HEX_64_RE.test(keyHex)) {
    return loadKeyRing('CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY');
  }

  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY is missing or malformed (expected 64 hex characters). ' +
        'Custom connector bearer tokens cannot be encrypted or decrypted without it.',
    );
  }

  if (!_devFallbackRing) {
    _devFallbackRing = { active: { id: '1', material: randomBytes(32) }, retired: [] };
  }
  return _devFallbackRing;
}

// The purpose is bound into the authentication tag, so a ciphertext lifted from one column
// or row cannot be opened as another secret class by the server on an attacker's behalf.
export function encryptConnectorToken(token: string, purpose: ConnectorSecretPurpose): string {
  return sealEnvelope(getKeyRing(), token, 'hex-triple', purpose);
}

export function decryptConnectorToken(
  encryptedValue: string,
  purpose: ConnectorSecretPurpose,
): string {
  return openEnvelope(getKeyRing(), encryptedValue, 'hex-triple', purpose).plaintext;
}
