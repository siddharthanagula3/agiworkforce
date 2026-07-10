/**
 * TEST / FIXTURE-GENERATION SUPPORT ONLY — not part of the production API.
 *
 * Real licenses and org policies are signed OUT OF BAND by the issuer's private
 * key; production code only ever *verifies*. This module exists so the
 * cross-language fixture corpus is signed with REAL Ed25519 signatures (never
 * hand-forged bytes) and so it regenerates deterministically.
 *
 * It is exported under the `@agiworkforce/licensing/test-support` subpath and is
 * deliberately kept out of the package's main entry point. Do not import it from
 * production code paths.
 *
 * Determinism: an Ed25519 secret key IS its 32-byte seed, so deriving the
 * keypair from a fixed committed seed makes fixture generation byte-reproducible
 * — a hard requirement for a corpus the Rust crate must replay identically.
 */

import { ed25519 } from '@noble/curves/ed25519';

import { bytesToBase64, utf8ToBytes } from './bytes';

export interface TestKeyPair {
  /** Raw 32-byte Ed25519 secret key (== the seed). */
  privateKey: Uint8Array;
  /** Raw 32-byte Ed25519 public key. */
  publicKey: Uint8Array;
  /** Base64 public key, as embedded in configs / license `policyKeys`. */
  publicKeyB64: string;
}

/**
 * Derive a deterministic keypair from a fixed 32-byte seed. Pass a 32-byte
 * `Uint8Array`, or a short ASCII label that is padded/truncated to 32 bytes
 * (labels keep fixtures readable — e.g. `'agi-root-key-1'`).
 */
export function deriveKeyPairFromSeed(seed: Uint8Array | string): TestKeyPair {
  let privateKey: Uint8Array;
  if (typeof seed === 'string') {
    privateKey = new Uint8Array(32);
    const labelBytes = utf8ToBytes(seed);
    privateKey.set(labelBytes.subarray(0, 32));
  } else {
    if (seed.length !== 32) {
      throw new Error('seed must be exactly 32 bytes');
    }
    privateKey = seed;
  }
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey, publicKeyB64: bytesToBase64(publicKey) };
}

/**
 * Build a signed container file for the given payload object and format. Returns
 * the exact bytes that would be written to disk (`.agilicense` or policy file).
 */
export function makeSignedContainer(
  payload: unknown,
  privateKey: Uint8Array,
  format: string,
): Uint8Array {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = bytesToBase64(utf8ToBytes(payloadJson));
  const signature = ed25519.sign(utf8ToBytes(payloadB64), privateKey);
  const container = {
    format,
    payload: payloadB64,
    signature: bytesToBase64(signature),
  };
  return utf8ToBytes(JSON.stringify(container, null, 2));
}

/**
 * Corrupt an already-signed container by flipping one byte in the decoded
 * payload's base64 while leaving the signature intact — yields a container whose
 * signature no longer matches. Used to produce "tampered" fixtures. Kept as a
 * simple byte-flip (not a malleability edge case) so TS and Rust verifiers agree.
 */
export function tamperContainerPayload(containerBytes: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(containerBytes);
  const container = JSON.parse(text) as { format: string; payload: string; signature: string };
  const payloadChars = container.payload.split('');
  // Flip the last non-padding character to a different base64 symbol.
  let idx = payloadChars.length - 1;
  while (idx >= 0 && payloadChars[idx] === '=') idx -= 1;
  const current = payloadChars[idx];
  payloadChars[idx] = current === 'A' ? 'B' : 'A';
  container.payload = payloadChars.join('');
  return utf8ToBytes(JSON.stringify(container, null, 2));
}
