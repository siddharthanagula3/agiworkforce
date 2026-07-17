/**
 * The `.agilicense` / signed-policy container format and its verification
 * primitive. This is the crypto core; `verify.ts` (license) and
 * `org-policy.ts` both build on `verifySignedContainer`.
 *
 * ## Container format (v1)
 *
 * A container is a single UTF-8 JSON object distributed as one file
 * (`.agilicense` for licenses; org policy ships the same shape). It is
 * intentionally JWT-shaped — a base64 payload plus a detached signature over
 * the encoded payload string — so there is NO canonical-JSON requirement and a
 * Rust re-implementation can byte-match without a JSON canonicalizer:
 *
 * ```json
 * {
 *   "format": "agilicense-v1",              // discriminator; also "agipolicy-v1"
 *   "payload": "<base64(standard) of the exact UTF-8 payload JSON bytes>",
 *   "signature": "<base64(standard) of the 64-byte Ed25519 signature>"
 * }
 * ```
 *
 * The signature is computed over the **ASCII bytes of the `payload` base64
 * string** (not over the decoded JSON). Verifiers therefore never re-serialize
 * the payload: they verify the signature against `utf8Bytes(container.payload)`,
 * then decode `payload` and parse the JSON. This eliminates every
 * cross-language serialization ambiguity (key order, whitespace, number
 * formatting, Unicode escaping).
 *
 * Public keys (both root keys and license `policyKeys`) are base64 of the raw
 * 32-byte Ed25519 public key.
 */

import { ed25519 } from '@noble/curves/ed25519';

import { base64ToBytes, bytesToUtf8, utf8ToBytes } from './bytes';

/** Failure reasons that are common to any signed container. */
export type ContainerErrorCode =
  /** Not JSON, wrong container shape, wrong `format`, or un-decodable base64. */
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

  // The signed message is the ASCII bytes of the base64 payload string.
  const signedMessage = utf8ToBytes(payloadField);

  for (const keyB64 of authorizedPublicKeysB64) {
    const keyBytes = base64ToBytes(keyB64);
    if (keyBytes === null || keyBytes.length !== PUBLIC_KEY_LENGTH) {
      // A malformed configured key can't authorize anything; skip it. (An app
      // baking in a bad root key should not brick verification of a good one.)
      continue;
    }
    let verified = false;
    try {
      verified = ed25519.verify(signatureBytes, signedMessage, keyBytes);
    } catch {
      // Malleability / point-decoding rejections surface as a non-verify, not a
      // thrown error. Treat as "this key did not verify" and try the next.
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
