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

export type DispatchSignatureAlgorithm = 'hmac-sha256-v2';

export const DISPATCH_SIGNATURE_ALGORITHM: DispatchSignatureAlgorithm = 'hmac-sha256-v2';

export const DISPATCH_HKDF_INFO = 'dispatch-hmac-v2';

export const DISPATCH_HMAC_REQUIRED_AFTER = '2026-05-26T00:00:00.000Z';

export const DISPATCH_MAX_MESSAGE_AGE_MS = 30_000;

export const DISPATCH_NONCE_CACHE_TTL_MS = 60_000;

export const DISPATCH_SESSION_KEY_LEN = 32;

export const DISPATCH_PAIRING_CODE_MIN_LEN = 8;

export type DispatchPayload = unknown;

export interface DispatchEnvelope {
  hmac: string;
  nonce: string;
  payload: DispatchPayload;
  ts: number;
  type: string;
}

/**
 * Backwards-compatible alias used by mobile's `dispatchHmac.ts`.
 * Prefer {@link DispatchEnvelope} in new code.
 */
export type SignedEnvelope = DispatchEnvelope;

export type DispatchVerifyFailureReason =
  | 'hmac_mismatch'
  | 'timestamp_expired'
  | 'nonce_replay'
  | 'malformed'
  | 'unsigned_transitional';

export type DispatchVerifyResult =
  | { ok: true }
  | { ok: false; reason: DispatchVerifyFailureReason };

export interface DispatchSessionState {
  /**
   * Hex-encoded 32-byte derived key (HKDF-SHA-256 output, see
   * {@link DISPATCH_SESSION_KEY_LEN}). Hex form lets tests use simple string
   * comparison.
   */
  secret: string;
  nonceCache: Map<string, number>;
}

/** Backwards-compatible alias for {@link DispatchSessionState}. */
export type HmacSessionState = DispatchSessionState;
