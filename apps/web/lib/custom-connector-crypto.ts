import 'server-only';

import { loadKeyRing, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';
import {
  CONNECTOR_SECRET_PURPOSES,
  openConnectorSecret,
  type ConnectorSecretPurpose,
} from '@/lib/crypto/connector-secret-reseal';

export const CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ENV = 'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY';

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

export { CONNECTOR_SECRET_PURPOSES, type ConnectorSecretPurpose };

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
  return loadKeyRing(CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ENV);
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
  return openConnectorSecret(getKeyRing(), encryptedValue, purpose).plaintext;
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
