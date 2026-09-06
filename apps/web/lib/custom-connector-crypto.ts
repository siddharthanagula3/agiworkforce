import 'server-only';
import { randomBytes } from 'crypto';

import { loadKeyRing, openEnvelope, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';

export const CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ENV = 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY';

const CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY =
  process.env[CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ENV];

let _devFallbackRing: KeyRing | null = null;

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

const CREDENTIAL_ENVELOPE_PREFIX = 'agi-credential-v1:';

export const AUTHORIZATION_HEADER_NAME = 'Authorization';
export const BEARER_VALUE_PREFIX = 'Bearer ';

export interface CustomConnectorCredential {
  readonly headerName: string;
  readonly headerValue: string;
}

export class CustomConnectorCredentialError extends Error {
  constructor() {
    super('Stored connector credential is malformed');
    this.name = 'CustomConnectorCredentialError';
  }
}

export const CONNECTOR_SECRET_PURPOSES = [
  'custom-connector-auth-header',
  'oauth-client-secret',
  'oauth-code-verifier',
  'oauth-access-token',
  'oauth-refresh-token',
] as const;

export type ConnectorSecretPurpose = (typeof CONNECTOR_SECRET_PURPOSES)[number];

export const CONNECTOR_TOKEN_STORAGE_UNAVAILABLE =
  'Connector authorization is unavailable because secure token storage is not configured. Contact your administrator.';

export function isConnectorTokenStorageAvailable(): boolean {
  try {
    getKeyRing();
    return true;
  } catch {
    return false;
  }
}

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

export function bearerCredential(token: string): CustomConnectorCredential {
  return { headerName: AUTHORIZATION_HEADER_NAME, headerValue: `${BEARER_VALUE_PREFIX}${token}` };
}

export function sealCustomConnectorCredential(credential: CustomConnectorCredential): string {
  const envelope = `${CREDENTIAL_ENVELOPE_PREFIX}${JSON.stringify({
    headerName: credential.headerName,
    headerValue: credential.headerValue,
  })}`;
  return encryptConnectorToken(envelope, 'custom-connector-auth-header');
}

// Rows written before the envelope existed hold a bare bearer token, so a
// plaintext without the prefix is still a valid credential rather than an error.
export function openCustomConnectorCredential(encryptedValue: string): CustomConnectorCredential {
  const plaintext = decryptConnectorToken(encryptedValue, 'custom-connector-auth-header');
  if (!plaintext.startsWith(CREDENTIAL_ENVELOPE_PREFIX)) return bearerCredential(plaintext);
  let parsed: Partial<Record<keyof CustomConnectorCredential, unknown>>;
  try {
    parsed = JSON.parse(plaintext.slice(CREDENTIAL_ENVELOPE_PREFIX.length)) as typeof parsed;
  } catch {
    throw new CustomConnectorCredentialError();
  }
  if (typeof parsed.headerName !== 'string' || typeof parsed.headerValue !== 'string') {
    throw new CustomConnectorCredentialError();
  }
  return { headerName: parsed.headerName, headerValue: parsed.headerValue };
}
