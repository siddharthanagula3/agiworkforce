/**
 * Anthropic Dispatch — canonical wire format contract.
 *
 * This file is the single source of truth for the Dispatch HMAC envelope
 * shared between the mobile signer (`apps/mobile/lib/dispatchHmac.ts`) and
 * the desktop verifier (`apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs`).
 *
 * Both peers MUST agree on:
 *   - the envelope shape ({hmac, nonce, payload, ts, type})
 *   - the canonical signing input (alphabetical keys, payload byte-verbatim)
 *   - the HKDF derivation (SHA-256, info `dispatch-hmac-v2`)
 *   - the replay-prevention parameters (timestamp window + nonce TTL)
 *   - the transitional cutoff (`DISPATCH_HMAC_REQUIRED_AFTER`)
 *
 * Drift between the two sides is a security defect — keep them lockstep.
 *
 * @see apps/mobile/lib/dispatchHmac.ts
 * @see apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs
 */

// ---------------------------------------------------------------------------
// Algorithm + protocol identifiers
// ---------------------------------------------------------------------------

/**
 * Signature algorithm used to authenticate Dispatch control messages.
 *
 * Currently `hmac-sha256-v2` is the only value in production. New values
 * should be added (never re-purposed) and both peers must coordinate
 * before the wire format changes.
 */
export type DispatchSignatureAlgorithm = 'hmac-sha256-v2';

/** The single algorithm both peers currently implement. */
export const DISPATCH_SIGNATURE_ALGORITHM: DispatchSignatureAlgorithm = 'hmac-sha256-v2';

/**
 * HKDF info parameter — UTF-8 bytes of this string are mixed into the
 * key derivation. Must match `dispatch_hmac.rs:HKDF_INFO`.
 */
export const DISPATCH_HKDF_INFO = 'dispatch-hmac-v2';

/**
 * ISO 8601 UTC date after which unsigned (transitional) Dispatch messages
 * MUST be rejected by both peers. Mobile and desktop must update lockstep.
 */
export const DISPATCH_HMAC_REQUIRED_AFTER = '2026-06-05T00:00:00.000Z';

/** Maximum age (ms) we accept for incoming Dispatch envelopes. */
export const DISPATCH_MAX_MESSAGE_AGE_MS = 30_000;

/**
 * Sliding-window nonce-cache TTL (ms). Must be ≥ 2× DISPATCH_MAX_MESSAGE_AGE_MS
 * so a nonce seen at the edge of the acceptance window is still in the cache
 * when a replay attempt arrives.
 */
export const DISPATCH_NONCE_CACHE_TTL_MS = 60_000;

/** Length (bytes) of the derived HMAC session key. */
export const DISPATCH_SESSION_KEY_LEN = 32;

/** Minimum length (chars) of a Dispatch pairing code (uppercase alphanumeric). */
export const DISPATCH_PAIRING_CODE_MIN_LEN = 8;

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

/**
 * Original control-message payload before signing. Held as `unknown` because
 * different action types carry different shapes; the HMAC covers the payload
 * byte-verbatim, so the canonical form is whatever bytes are passed through.
 *
 * On the receive side, narrow this to the per-action shape after verification.
 */
export type DispatchPayload = unknown;

/**
 * The signed envelope that travels over the data channel / signaling relay.
 *
 * Wire format:
 * ```text
 * {
 *   "hmac":    "<hex HMAC-SHA-256, 64 chars>",
 *   "nonce":   "<base64 16 random bytes>",
 *   "payload": <original control-message JSON>,
 *   "ts":      <unix ms integer>,
 *   "type":    "<action string, mirrors payload.action>"
 * }
 * ```
 *
 * Keys MUST be in alphabetical order when computing the HMAC. The HMAC
 * covers `JSON.stringify({nonce, payload, ts, type})` — i.e. the envelope
 * with the `hmac` field excluded.
 */
export interface DispatchEnvelope {
  /** HMAC-SHA-256 over the canonical signing input (hex, 64 chars). */
  hmac: string;
  /** 16 random bytes, base64-encoded. */
  nonce: string;
  /** Original control-message object — held verbatim for HMAC integrity. */
  payload: DispatchPayload;
  /** Unix timestamp (milliseconds). */
  ts: number;
  /** Control message action string (mirrors payload.action). */
  type: string;
}

/**
 * Backwards-compatible alias used by mobile's `dispatchHmac.ts`.
 * Prefer {@link DispatchEnvelope} in new code.
 */
export type SignedEnvelope = DispatchEnvelope;

// ---------------------------------------------------------------------------
// Verify result + reasons
// ---------------------------------------------------------------------------

/**
 * Reasons a Dispatch envelope can be rejected. Mirror the discriminants in
 * `dispatch_hmac.rs:VerifyError` (Rust desktop side).
 */
export type DispatchVerifyFailureReason =
  | 'hmac_mismatch'
  | 'timestamp_expired'
  | 'nonce_replay'
  | 'malformed'
  | 'unsigned_transitional';

/**
 * Outcome of verifying a Dispatch envelope. The `ok: true` branch may be
 * extended later to indicate transitional vs fully-signed acceptance — both
 * peers should treat this as a discriminated union.
 */
export type DispatchVerifyResult =
  | { ok: true }
  | { ok: false; reason: DispatchVerifyFailureReason };

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/**
 * Mutable session state threaded through verify/sign calls by the caller.
 * Owned by the surface (mobile / desktop); not transmitted over the wire.
 */
export interface DispatchSessionState {
  /**
   * Hex-encoded 32-byte derived key (HKDF-SHA-256 output, see
   * {@link DISPATCH_SESSION_KEY_LEN}). Hex form lets tests use simple string
   * comparison.
   */
  secret: string;
  /**
   * Sliding-window nonce cache: maps base64-nonce → received-ts (ms).
   * Pruned on each verification call.
   */
  nonceCache: Map<string, number>;
}

/** Backwards-compatible alias for {@link DispatchSessionState}. */
export type HmacSessionState = DispatchSessionState;
