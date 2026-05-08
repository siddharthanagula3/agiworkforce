/**
 * dispatchHmac.ts
 *
 * HIGH-MOB-05 fix (2026-05-04, v2 nonce scheme 2026-05-05):
 * Application-layer authentication for Dispatch WebRTC / signaling control
 * messages.
 *
 * ---------------------------------------------------------------------------
 * WIRE FORMAT (canonical — desktop peer must implement the same)
 * ---------------------------------------------------------------------------
 *
 * Every outbound control message is wrapped in a signed envelope:
 *
 *   {
 *     "hmac":    "<hex-encoded HMAC-SHA-256, 64 chars>",
 *     "nonce":   "<base64-encoded 16 random bytes>",
 *     "payload": <original control-message object>,
 *     "ts":      <Unix timestamp in milliseconds (integer)>,
 *     "type":    "<control message action string>"
 *   }
 *
 * Note: keys MUST be in alphabetical order when computing HMAC (see
 * canonicalSigningInput() below). JSON.stringify of the object with
 * keys sorted alphabetically produces the canonical string.
 *
 * The HMAC covers the canonical JSON of { hmac excluded }:
 *
 *   HMAC-SHA-256(session_key,
 *     JSON.stringify({ nonce, payload, ts, type })  // keys alpha-sorted
 *   )
 *
 * ---------------------------------------------------------------------------
 * SESSION SECRET DERIVATION (HKDF-SHA-256)
 * ---------------------------------------------------------------------------
 *
 *   IKM  = UTF-8(pairingCode)               // ≥8 uppercase alphanumeric chars
 *   Salt = UTF-8(sessionSalt)               // random per connect() call, not secret
 *   Info = UTF-8("dispatch-hmac-v2")
 *
 *   PRK  = HMAC-SHA-256(salt, IKM)          // HKDF extract
 *   OKM  = HMAC-SHA-256(PRK, Info || 0x01)  // HKDF expand, first block
 *
 * The derived key is 256 bits (32 bytes), hex-encoded for storage.
 * The sessionSalt is transmitted to the desktop peer inside the signaling
 * 'registered' or 'peer_ready' event metadata field `dispatchSalt`. It is
 * NOT secret — only the derived key is.
 *
 * ---------------------------------------------------------------------------
 * REPLAY PREVENTION
 * ---------------------------------------------------------------------------
 *
 *  1. Timestamp window: receiver rejects |now - ts| > 30 000 ms.
 *  2. Nonce cache: receiver keeps a sliding window of (nonce → ts) entries
 *     seen in the last 60 seconds. Duplicate nonces in that window are
 *     rejected. Old entries are pruned on each verification call.
 *
 * ---------------------------------------------------------------------------
 * TRANSITIONAL MODE (one release window)
 * ---------------------------------------------------------------------------
 *
 * Messages without an `hmac` field are accepted with a console.warn during
 * the transitional period. The desktop peer MUST add signing before
 * DISPATCH_HMAC_REQUIRED_AFTER (see constant below). After that date, this
 * file should be updated to fail-closed (delete the transitional branch and
 * remove this comment block).
 *
 * CUTOFF: 2026-06-05 — bump dispatchHmac.ts and remove the transitional
 * accept path once the desktop surface ships matching HMAC signing.
 *
 * ---------------------------------------------------------------------------
 * DESKTOP COUNTERPART REQUIREMENTS
 * ---------------------------------------------------------------------------
 *
 * The desktop peer (apps/desktop) must implement:
 *  1. On pairing: receive `dispatchSalt` from signaling metadata; derive the
 *     same session_key using HKDF-SHA-256 with the same IKM/salt/info.
 *  2. On send: wrap every control message in the envelope above.
 *  3. On receive: verify the envelope; reject on ts/nonce/hmac failure.
 *
 * This is tracked in the companion PR for apps/desktop Dispatch wiring.
 */

import * as Crypto from 'expo-crypto';
import {
  DISPATCH_HMAC_REQUIRED_AFTER as CANONICAL_DISPATCH_HMAC_REQUIRED_AFTER,
  DISPATCH_MAX_MESSAGE_AGE_MS,
  DISPATCH_NONCE_CACHE_TTL_MS,
  type DispatchEnvelope,
  type DispatchSessionState,
  type DispatchVerifyResult,
} from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Constants — re-exported from the canonical contract in @agiworkforce/types
// ---------------------------------------------------------------------------

/** Maximum age (ms) we accept for incoming messages to prevent replay. */
const MAX_MESSAGE_AGE_MS = DISPATCH_MAX_MESSAGE_AGE_MS;

/**
 * Nonce-cache TTL (ms). Nonces older than this are evicted from the cache.
 * Must be at least 2× MAX_MESSAGE_AGE_MS so that a nonce seen at the edge of
 * the acceptance window is still in the cache when a replay attempt arrives.
 */
const NONCE_CACHE_TTL_MS = DISPATCH_NONCE_CACHE_TTL_MS;

/**
 * ISO 8601 date after which unsigned (transitional) messages should be
 * rejected. Desktop surface must ship HMAC signing before this date.
 *
 * CUTOFF: 2026-06-05
 *
 * Re-exported from the canonical contract for backwards compatibility.
 */
export const DISPATCH_HMAC_REQUIRED_AFTER = CANONICAL_DISPATCH_HMAC_REQUIRED_AFTER;

// ---------------------------------------------------------------------------
// Types — re-exported aliases of the canonical types in @agiworkforce/types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Low-level HMAC-SHA-256 (RFC 2104) via expo-crypto
// ---------------------------------------------------------------------------

/** SHA-256 block size in bytes */
const BLOCK_SIZE = 64;

/**
 * Encode a string to UTF-8 bytes.
 * TextEncoder is available in React Native's Hermes engine.
 */
function utf8Encode(str: string): Uint8Array {
  // TextEncoder is globally available in Hermes (React Native >= 0.70)
  return new TextEncoder().encode(str);
}

/** hex-encode a Uint8Array */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** hex-decode a hex string to Uint8Array */
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

/**
 * Raw SHA-256 over a Uint8Array. Uses expo-crypto's `digest()` which accepts
 * binary data — no string encoding side-effects.
 *
 * Note: TypeScript's `Uint8Array<ArrayBufferLike>` is not assignable to
 * `BufferSource` (which requires `ArrayBuffer`, not `SharedArrayBuffer`).
 * We copy into a plain `ArrayBuffer` to satisfy the type contract.
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // Ensure we have a plain ArrayBuffer (not SharedArrayBuffer) for expo-crypto
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
  // If key is longer than block size, hash it first
  let k = keyBytes;
  if (k.length > BLOCK_SIZE) {
    k = await sha256(k);
  }

  // Pad key to block size
  const kPadded = new Uint8Array(BLOCK_SIZE);
  kPadded.set(k);

  // ipad = 0x36 repeated, opad = 0x5c repeated
  const ipad = new Uint8Array(BLOCK_SIZE).fill(0x36);
  const opad = new Uint8Array(BLOCK_SIZE).fill(0x5c);

  const kIpad = new Uint8Array(BLOCK_SIZE);
  const kOpad = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    kIpad[i] = kPadded[i] ^ ipad[i];
    kOpad[i] = kPadded[i] ^ opad[i];
  }

  // inner = SHA-256(k ⊕ ipad ∥ message)
  const innerInput = new Uint8Array(BLOCK_SIZE + msgBytes.length);
  innerInput.set(kIpad, 0);
  innerInput.set(msgBytes, BLOCK_SIZE);
  const inner = await sha256(innerInput);

  // outer = SHA-256(k ⊕ opad ∥ inner)
  const outerInput = new Uint8Array(BLOCK_SIZE + 32);
  outerInput.set(kOpad, 0);
  outerInput.set(inner, BLOCK_SIZE);
  return sha256(outerInput);
}

// ---------------------------------------------------------------------------
// HKDF-SHA-256
// ---------------------------------------------------------------------------

/**
 * HKDF Extract: PRK = HMAC-SHA-256(salt, IKM)
 */
async function hkdfExtract(saltBytes: Uint8Array, ikmBytes: Uint8Array): Promise<Uint8Array> {
  return hmacSha256(saltBytes, ikmBytes);
}

/**
 * HKDF Expand (single 32-byte output block):
 * OKM = HMAC-SHA-256(PRK, info ∥ 0x01)
 */
async function hkdfExpand(prk: Uint8Array, infoBytes: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(infoBytes.length + 1);
  input.set(infoBytes, 0);
  input[infoBytes.length] = 0x01; // counter byte T(1)
  return hmacSha256(prk, input);
}

// ---------------------------------------------------------------------------
// Session secret derivation
// ---------------------------------------------------------------------------

/**
 * Derive the shared HMAC session key for a Dispatch connection.
 *
 * Uses proper HKDF-SHA-256 (RFC 5869, single-block expand):
 *   PRK = HMAC-SHA-256(salt=UTF8(sessionSalt), IKM=UTF8(pairingCode))
 *   OKM = HMAC-SHA-256(PRK, UTF8("dispatch-hmac-v2") ∥ 0x01)
 *
 * @param pairingCode - 8-char alphanumeric pairing code (pre-shared key)
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

// ---------------------------------------------------------------------------
// Canonical signing input
// ---------------------------------------------------------------------------

/**
 * Produce the canonical UTF-8 JSON string over which the HMAC is computed.
 * Keys are sorted alphabetically so both peers produce an identical string
 * regardless of their JS engine's insertion order.
 *
 * Signed fields: { nonce, payload, ts, type }  (no "hmac" in the signed set)
 */
function canonicalSigningInput(type: string, payload: unknown, ts: number, nonce: string): string {
  // Alphabetical order: nonce < payload < ts < type
  return JSON.stringify({ nonce, payload, ts, type });
}

// ---------------------------------------------------------------------------
// Sign outgoing message
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Verify incoming message
// ---------------------------------------------------------------------------

/**
 * Constant-time hex string comparison.
 * Both strings are 64-char hex — same length always — so a character-by-
 * character XOR accumulator is sufficient. We avoid short-circuit evaluation
 * explicitly.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Evict nonce-cache entries older than NONCE_CACHE_TTL_MS. */
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
 *  2. `unsigned_transitional` — no hmac field; accepted with warn during
 *                              the transitional period, fail-closed after
 *                              DISPATCH_HMAC_REQUIRED_AFTER
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
  // 1. Shape check — must be a plain object (not null, not array)
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    return { ok: false, reason: 'malformed' };
  }
  const m = msg as Record<string, unknown>;

  const hasHmac = typeof m['hmac'] === 'string';
  const hasNonce = typeof m['nonce'] === 'string';
  const hasTs = typeof m['ts'] === 'number';
  const hasType = typeof m['type'] === 'string';

  // Transitional: accept unsigned messages (no hmac field) during the window
  if (!hasHmac) {
    const now = Date.now();
    const cutoff = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();
    if (now < cutoff) {
      console.warn(
        '[dispatch] SECURITY: received unsigned control message — transitional accept. ' +
          'Desktop peer must add HMAC signing before ' +
          DISPATCH_HMAC_REQUIRED_AFTER +
          '. This accept path will be removed after that date.',
      );
      return { ok: true };
    }
    // Past cutoff: fail-closed
    return { ok: false, reason: 'unsigned_transitional' };
  }

  // Past this point we have an hmac field; require all signed-envelope fields
  if (!hasNonce || !hasTs || !hasType) {
    return { ok: false, reason: 'malformed' };
  }

  const hmac = m['hmac'] as string;
  const nonce = m['nonce'] as string;
  const ts = m['ts'] as number;
  const type = m['type'] as string;
  const payload = m['payload'];

  // 2. Timestamp window: ±30s
  const now = Date.now();
  const age = now - ts;
  if (age > MAX_MESSAGE_AGE_MS || age < -MAX_MESSAGE_AGE_MS) {
    return { ok: false, reason: 'timestamp_expired' };
  }

  // 3. Nonce replay check — prune stale entries first
  pruneNonceCache(state.nonceCache, now);
  if (state.nonceCache.has(nonce)) {
    return { ok: false, reason: 'nonce_replay' };
  }

  // 4. HMAC verify (constant-time)
  const signingInput = canonicalSigningInput(type, payload, ts, nonce);
  const keyBytes = fromHex(state.secret);
  const msgBytes = utf8Encode(signingInput);
  const expectedBytes = await hmacSha256(keyBytes, msgBytes);
  const expected = toHex(expectedBytes);

  if (!constantTimeEqual(expected, hmac)) {
    return { ok: false, reason: 'hmac_mismatch' };
  }

  // All checks passed — record nonce
  state.nonceCache.set(nonce, now);
  return { ok: true };
}
