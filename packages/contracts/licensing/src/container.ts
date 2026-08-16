
import { ed25519 } from '@noble/curves/ed25519';

import { base64ToBytes, bytesToUtf8, utf8ToBytes } from './bytes';

export type ContainerErrorCode =
  | 'malformed'
  /** Well-formed container, but no authorized key verifies the signature. */
  | 'bad_signature';

export interface ContainerError {
  code: ContainerErrorCode;
  message: string;
}

export type VerifiedContainer =
  | { ok: true; payload: Uint8Array }
  | { ok: false; error: ContainerError };

const SIGNATURE_LENGTH = 64;
const PUBLIC_KEY_LENGTH = 32;

function malformed(message: string): VerifiedContainer {
  return { ok: false, error: { code: 'malformed', message } };
}

/**
 * Verify a signed container's structure and signature. Pure, no I/O, never
 * throws. Does NOT interpret the payload (that is the caller's schema concern).
 *
 * @param fileBytes  raw bytes of the container file.
 * @param authorizedPublicKeysB64  base64 32-byte Ed25519 public keys; the
 *   signature must verify against AT LEAST ONE of them (rotatable list).
 * @param expectedFormat  the required `format` discriminator.
 */
export function verifySignedContainer(
  fileBytes: Uint8Array,
  authorizedPublicKeysB64: readonly string[],
  expectedFormat: string,
): VerifiedContainer {
  let text: string;
  try {
    text = bytesToUtf8(fileBytes);
  } catch {
    return malformed('container is not valid UTF-8');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return malformed('container is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return malformed('container is not a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  if (record['format'] !== expectedFormat) {
    return malformed(`container format is not "${expectedFormat}"`);
  }
  const payloadField = record['payload'];
  const signatureField = record['signature'];
  if (typeof payloadField !== 'string' || typeof signatureField !== 'string') {
    return malformed('container is missing string "payload"/"signature" fields');
  }

  const payloadBytes = base64ToBytes(payloadField);
  if (payloadBytes === null) {
    return malformed('container payload is not valid base64');
  }

  const signatureBytes = base64ToBytes(signatureField);
  if (signatureBytes === null || signatureBytes.length !== SIGNATURE_LENGTH) {
    return malformed('container signature is not a base64 64-byte Ed25519 signature');
  }

  if (authorizedPublicKeysB64.length === 0) {
    return {
      ok: false,
      error: { code: 'bad_signature', message: 'no authorized public keys provided' },
    };
  }

  const signedMessage = utf8ToBytes(payloadField);

  for (const keyB64 of authorizedPublicKeysB64) {
    const keyBytes = base64ToBytes(keyB64);
    if (keyBytes === null || keyBytes.length !== PUBLIC_KEY_LENGTH) {
      continue;
    }
    let verified = false;
    try {
      verified = ed25519.verify(signatureBytes, signedMessage, keyBytes);
    } catch {
      verified = false;
    }
    if (verified) {
      return { ok: true, payload: payloadBytes };
    }
  }

  return {
    ok: false,
    error: { code: 'bad_signature', message: 'signature not authorized by any provided key' },
  };
}
