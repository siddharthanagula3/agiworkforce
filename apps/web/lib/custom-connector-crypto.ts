import 'server-only';
import { randomBytes } from 'crypto';

import { loadKeyRing, openEnvelope, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';

const CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY = process.env['CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY'];

let _devFallbackRing: KeyRing | null = null;

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

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

export function encryptConnectorToken(token: string): string {
  return sealEnvelope(getKeyRing(), token, 'hex-triple');
}

export function decryptConnectorToken(encryptedValue: string): string {
  return openEnvelope(getKeyRing(), encryptedValue, 'hex-triple').plaintext;
}
