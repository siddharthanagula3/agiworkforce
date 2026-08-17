import * as Crypto from 'expo-crypto';
import {
  DISPATCH_HMAC_REQUIRED_AFTER as CANONICAL_DISPATCH_HMAC_REQUIRED_AFTER,
  DISPATCH_MAX_MESSAGE_AGE_MS,
  DISPATCH_NONCE_CACHE_TTL_MS,
  type DispatchEnvelope,
  type DispatchSessionState,
  type DispatchVerifyResult,
} from '@agiworkforce/types';

// Constants — re-exported from the canonical contract in @agiworkforce/types

const MAX_MESSAGE_AGE_MS = DISPATCH_MAX_MESSAGE_AGE_MS;

const NONCE_CACHE_TTL_MS = DISPATCH_NONCE_CACHE_TTL_MS;

/**
 * Historical ISO 8601 date after which unsigned messages are rejected.
 * Re-exported from the canonical contract for cross-surface compatibility.
 */
export const DISPATCH_HMAC_REQUIRED_AFTER = CANONICAL_DISPATCH_HMAC_REQUIRED_AFTER;

// Types — re-exported aliases of the canonical types in @agiworkforce/types

/**
 * The signed envelope that travels over the data channel / signaling relay.
 * Keys are always in alphabetical order when the HMAC is computed.
 *
 * @deprecated Import {@link DispatchEnvelope} from `@agiworkforce/types` directly.
 * This alias is preserved for backwards compatibility with existing mobile code.
 */
export type SignedEnvelope = DispatchEnvelope;

/**
 * Session state threaded through the session by the caller.
 *
 * @deprecated Import {@link DispatchSessionState} from `@agiworkforce/types`.
 */
export type HmacSessionState = DispatchSessionState;

/** Verification result — alias of canonical {@link DispatchVerifyResult}. */
export type VerifyResult = DispatchVerifyResult;

const BLOCK_SIZE = 64;

function utf8Encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const plain: ArrayBuffer =
    data.buffer instanceof ArrayBuffer
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : new Uint8Array(data).buffer;
  const buf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, plain as ArrayBuffer);
  return new Uint8Array(buf);
}

/**
 * Proper RFC 2104 HMAC-SHA-256.
 *
 * HMAC(K, m) = H((K⊕opad) ∥ H((K⊕ipad) ∥ m))
 *
 * @param keyBytes - Raw key bytes (any length; hashed if > BLOCK_SIZE)
 * @param msgBytes - Message bytes
 * @returns 32-byte HMAC digest
 */
async function hmacSha256(keyBytes: Uint8Array, msgBytes: Uint8Array): Promise<Uint8Array> {
  let k = keyBytes;
  if (k.length > BLOCK_SIZE) {
    k = await sha256(k);
  }

  const kPadded = new Uint8Array(BLOCK_SIZE);
  kPadded.set(k);

  const ipad = new Uint8Array(BLOCK_SIZE).fill(0x36);
  const opad = new Uint8Array(BLOCK_SIZE).fill(0x5c);

  const kIpad = new Uint8Array(BLOCK_SIZE);
  const kOpad = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    kIpad[i] = kPadded[i] ^ ipad[i];
    kOpad[i] = kPadded[i] ^ opad[i];
  }

  const innerInput = new Uint8Array(BLOCK_SIZE + msgBytes.length);
  innerInput.set(kIpad, 0);
  innerInput.set(msgBytes, BLOCK_SIZE);
  const inner = await sha256(innerInput);

  const outerInput = new Uint8Array(BLOCK_SIZE + 32);
  outerInput.set(kOpad, 0);
  outerInput.set(inner, BLOCK_SIZE);
  return sha256(outerInput);
}

async function hkdfExtract(saltBytes: Uint8Array, ikmBytes: Uint8Array): Promise<Uint8Array> {
  return hmacSha256(saltBytes, ikmBytes);
}

async function hkdfExpand(prk: Uint8Array, infoBytes: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(infoBytes.length + 1);
  input.set(infoBytes, 0);
  input[infoBytes.length] = 0x01;
  return hmacSha256(prk, input);
}

/**
 * Derive the shared HMAC session key for a Dispatch connection.
 *
 * Uses proper HKDF-SHA-256 (RFC 5869, single-block expand):
 *   PRK = HMAC-SHA-256(salt=UTF8(sessionSalt), IKM=UTF8(pairingCode))
 *   OKM = HMAC-SHA-256(PRK, UTF8("dispatch-hmac-v2") ∥ 0x01)
 *
 * Threat model: this key authenticates the peer against anyone who reaches the
 * data channel without the pairing transcript. It does not defend against the
 * signaling relay. The relay mints the pairing code and receives it again on
 * POST /pairings/{code}/claim and in the register frame, and the salt travels
 * to it in register metadata, so the relay — or a relay compromise, or a
 * TLS-intercepting proxy while `PINNING_ENFORCED` is false — holds both KDF
 * inputs and can mint envelopes that verify in either direction. Closing that
 * needs an out-of-band key or a PAKE: SEC-16 in docs/remediation/register.json.
 *
 * @param pairingCode - 12-char alphanumeric pairing code (pre-shared key, AUDIT-FIX: H-12).
 * @param sessionSalt - Random per-session salt (not secret; sent in metadata)
 * @returns hex-encoded 32-byte derived key
 */
export async function deriveDispatchSecret(
  pairingCode: string,
  sessionSalt: string,
): Promise<string> {
  const ikm = utf8Encode(pairingCode);
  const salt = utf8Encode(sessionSalt);
  const info = utf8Encode('dispatch-hmac-v2');

  const prk = await hkdfExtract(salt, ikm);
  const okm = await hkdfExpand(prk, info);
  return toHex(okm);
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : canonicalizeJson(item)));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const child = source[key];
    if (child !== undefined) {
      sorted[key] = canonicalizeJson(child);
    }
  }
  return sorted;
}

function canonicalSigningInput(type: string, payload: unknown, ts: number, nonce: string): string {
  return JSON.stringify(canonicalizeJson({ nonce, payload, ts, type }));
}

/**
 * Wrap a control-message payload in a signed envelope.
 * Generates a fresh 16-byte nonce on every call.
 *
 * @param state   - Mutable session state (nonceCache may be updated on receive)
 * @param type    - Control message action string (e.g. "approval_response")
 * @param payload - Original control-message object
 * @returns Signed envelope ready to serialize and send
 */
export async function signMessage(
  state: HmacSessionState,
  type: string,
  payload: unknown,
): Promise<SignedEnvelope> {
  const nonceBytes = Crypto.getRandomBytes(16);
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  const ts = Date.now();

  const signingInput = canonicalSigningInput(type, payload, ts, nonce);
  const keyBytes = fromHex(state.secret);
  const msgBytes = utf8Encode(signingInput);
  const macBytes = await hmacSha256(keyBytes, msgBytes);
  const hmac = toHex(macBytes);

  return { hmac, nonce, payload, ts, type };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function pruneNonceCache(nonceCache: Map<string, number>, now: number): void {
  const cutoff = now - NONCE_CACHE_TTL_MS;
  for (const [nonce, seenAt] of nonceCache) {
    if (seenAt < cutoff) {
      nonceCache.delete(nonce);
    }
  }
}

/**
 * Verify a signed incoming envelope.
 *
 * Rejection reasons (checked in order):
 *  1. `malformed`           — not a valid SignedEnvelope shape
 *  2. `unsigned_transitional` — no hmac field; fail-closed
 *  3. `timestamp_expired`   — |now - ts| > MAX_MESSAGE_AGE_MS
 *  4. `nonce_replay`        — nonce seen in the NONCE_CACHE_TTL_MS window
 *  5. `hmac_mismatch`       — HMAC does not match (constant-time compare)
 *
 * On success, the nonce is added to the cache.
 *
 * @param state - Mutable session state; nonceCache is updated in place
 * @param msg   - Raw parsed JSON from the wire
 */
export async function verifyMessage(state: HmacSessionState, msg: unknown): Promise<VerifyResult> {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    return { ok: false, reason: 'malformed' };
  }
  const m = msg as Record<string, unknown>;

  const hasHmac = typeof m['hmac'] === 'string';
  const hasNonce = typeof m['nonce'] === 'string';
  const hasTs = typeof m['ts'] === 'number';
  const hasType = typeof m['type'] === 'string';

  if (!hasHmac) {
    return { ok: false, reason: 'unsigned_transitional' };
  }

  if (!hasNonce || !hasTs || !hasType) {
    return { ok: false, reason: 'malformed' };
  }

  const hmac = m['hmac'] as string;
  const nonce = m['nonce'] as string;
  const ts = m['ts'] as number;
  const type = m['type'] as string;
  const payload = m['payload'];

  const now = Date.now();
  const age = now - ts;
  if (age > MAX_MESSAGE_AGE_MS || age < -MAX_MESSAGE_AGE_MS) {
    return { ok: false, reason: 'timestamp_expired' };
  }

  pruneNonceCache(state.nonceCache, now);
  if (state.nonceCache.has(nonce)) {
    return { ok: false, reason: 'nonce_replay' };
  }

  const signingInput = canonicalSigningInput(type, payload, ts, nonce);
  const keyBytes = fromHex(state.secret);
  const msgBytes = utf8Encode(signingInput);
  const expectedBytes = await hmacSha256(keyBytes, msgBytes);
  const expected = toHex(expectedBytes);

  if (!constantTimeEqual(expected, hmac)) {
    return { ok: false, reason: 'hmac_mismatch' };
  }

  state.nonceCache.set(nonce, now);
  return { ok: true };
}
