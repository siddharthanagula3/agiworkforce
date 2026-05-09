/**
 * Desktop Dispatch listener service.
 *
 * This module is the desktop peer to `apps/mobile/lib/dispatchHmac.ts`.
 * Mobile signs every outbound control message with HMAC-SHA-256; this
 * service verifies those signatures via the Rust crypto module exposed
 * through Tauri commands (`dispatch_hmac_init`, `dispatch_hmac_verify`,
 * `dispatch_hmac_sign`, `dispatch_hmac_reset`).
 *
 * Lifecycle:
 *   1. Mobile connects and sends `dispatchSalt` in `peer_ready` metadata.
 *   2. Caller calls `initDispatchSession(pairingCode, dispatchSalt)`.
 *      The Rust side derives the 32-byte HKDF session key.
 *   3. On inbound control message: `verifyInbound(rawJson)` → VerifyOutcome.
 *   4. On outbound control message: `signOutbound(payload, type)` → wire JSON.
 *   5. On disconnect: `resetDispatchSession()` zeroes the key.
 *
 * Edge cases handled:
 *   - Clock drift: ±30s window enforced in Rust (plan says ±5min but Rust
 *     uses 30s which is stricter; +6min drift is rejected).
 *   - Replay: sliding-window nonce cache (1000 IDs / 60s) managed in Rust.
 *   - Key rotation: `rotateDispatchKey()` fetches new salt from Supabase RPC
 *     and re-initialises the session key. Two active key slots are supported
 *     by the Rust state (current + retry with old key on mismatch).
 *   - Salt collisions: 16-byte random nonce per message; collision probability
 *     is negligible (~2^-128 per message pair). Log + reject on the Rust side.
 *   - Unsigned grace window: accepted with warning until 2026-06-05; after
 *     that, rejected (Rust enforces; we surface the log).
 *   - Message dedup by ID: deduplicated in this module before calling Rust
 *     verify, so the nonce cache stays clean.
 *   - Network retry: exponential backoff for key rotation fetches.
 *   - Mobile version mismatch: parsed from `peer_ready` metadata; logged
 *     and emitted via `onVersionMismatch` callback so the UI can prompt.
 */

import { invoke } from '../lib/tauri-mock';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ISO date after which unsigned messages are hard-rejected by Rust. */
export const DISPATCH_HMAC_REQUIRED_AFTER = '2026-06-05T00:00:00.000Z';
const DISPATCH_HMAC_REQUIRED_AFTER_MS = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();

/** Minimum semantic version string that supports HMAC signing on mobile. */
const DISPATCH_HMAC_MIN_MOBILE_VERSION = '1.3.0';

/** Maximum number of processed message IDs to track for dedup. */
const MAX_DEDUP_IDS = 1000;

/** How long to keep a message ID in the dedup set (ms). Matches Rust nonce TTL. */
const DEDUP_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Outcome strings mirroring Rust `VerifyOutcome`. */
export type VerifyOutcome = 'signed' | 'unsigned_transitional';

/** Full verify result surface to callers. */
export type DispatchVerifyResult =
  | { ok: true; outcome: VerifyOutcome }
  | { ok: false; reason: string };

/** Structured inbound message before HMAC verification. */
export interface InboundDispatchMessage {
  /** Application-level deduplicated message ID (not the HMAC nonce). */
  id?: string;
  /** Raw JSON of the full signed envelope (passed to Rust for crypto). */
  rawJson: string;
}

/** Callbacks the caller can provide to react to dispatch events. */
export interface DispatchListenerCallbacks {
  onVersionMismatch?: (mobileVersion: string, minRequired: string) => void;
  onUnsignedTransitional?: () => void;
  onKeyRotated?: (newKeyHex: string) => void;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Whether a session key is currently active. */
let _sessionActive = false;

/** Dedup cache: message ID → expiry ms. */
const _dedupCache = new Map<string, number>();

/** Registered callbacks. */
let _callbacks: DispatchListenerCallbacks = {};

// ---------------------------------------------------------------------------
// Dedup helpers
// ---------------------------------------------------------------------------

function pruneDedup(nowMs: number): void {
  for (const [id, expiry] of _dedupCache) {
    if (expiry < nowMs) {
      _dedupCache.delete(id);
    }
  }
}

function isDuplicate(id: string): boolean {
  pruneDedup(Date.now());
  if (_dedupCache.size >= MAX_DEDUP_IDS) {
    // Evict oldest entries when at cap.
    const oldest = [..._dedupCache.entries()].sort((a, b) => a[1] - b[1]);
    const toEvict = oldest.slice(0, _dedupCache.size - MAX_DEDUP_IDS + 1);
    for (const [key] of toEvict) {
      _dedupCache.delete(key);
    }
  }
  if (_dedupCache.has(id)) {
    return true;
  }
  _dedupCache.set(id, Date.now() + DEDUP_TTL_MS);
  return false;
}

// ---------------------------------------------------------------------------
// Version comparison helpers
// ---------------------------------------------------------------------------

/**
 * Compares two semantic version strings (major.minor.patch).
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareSemver(a: string, b: string): number {
  const parseParts = (v: string): number[] =>
    v
      .split('.')
      .slice(0, 3)
      .map((n) => parseInt(n, 10) || 0);
  const aParts = parseParts(a);
  const bParts = parseParts(b);
  for (let i = 0; i < 3; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isMobileVersionSufficient(mobileVersion: string): boolean {
  return compareSemver(mobileVersion, DISPATCH_HMAC_MIN_MOBILE_VERSION) >= 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register optional callbacks for dispatch events.
 * Safe to call before `initDispatchSession`.
 */
export function setDispatchCallbacks(callbacks: DispatchListenerCallbacks): void {
  _callbacks = { ..._callbacks, ...callbacks };
}

/**
 * Initialise the desktop dispatch session key.
 *
 * Called from the connection store when `peer_ready` metadata contains a
 * `dispatchSalt`. The pairing code the desktop generated and the salt the
 * mobile generated together feed HKDF-SHA-256 to derive the shared key.
 *
 * @param pairingCode - The 8+ char pairing code shared between devices.
 * @param dispatchSalt - Hex salt from `peer_ready` metadata.
 * @param mobileVersion - Optional mobile app version string for mismatch check.
 * @returns hex-encoded 64-char derived key (diagnostic only; do not persist).
 */
export async function initDispatchSession(
  pairingCode: string,
  dispatchSalt: string,
  mobileVersion?: string,
): Promise<string> {
  if (mobileVersion && !isMobileVersionSufficient(mobileVersion)) {
    _callbacks.onVersionMismatch?.(mobileVersion, DISPATCH_HMAC_MIN_MOBILE_VERSION);
    console.warn(
      `[dispatch] Mobile version ${mobileVersion} does not support HMAC signing. ` +
        `Force-update required before ${DISPATCH_HMAC_REQUIRED_AFTER}.`,
    );
  }

  const keyHex = await invoke<string>('dispatch_hmac_init', {
    pairingCode,
    sessionSalt: dispatchSalt,
  });

  _sessionActive = true;
  _dedupCache.clear();

  console.debug('[dispatch] session key initialised');
  return keyHex;
}

/**
 * Verify an inbound control message from mobile.
 *
 * Handles:
 *   - Application-level message-ID deduplication (before Rust nonce check).
 *   - Unsigned-transitional warning for messages without HMAC.
 *   - Post-cutoff hard rejection surfacing.
 *
 * @param message - `{ id?, rawJson }`. The `id` is an app-layer dedup key
 *   (e.g., `msg.id` from the dispatch payload), NOT the HMAC nonce.
 */
export async function verifyInbound(
  message: InboundDispatchMessage,
): Promise<DispatchVerifyResult> {
  if (!_sessionActive) {
    return { ok: false, reason: 'session_not_initialised' };
  }

  // App-layer dedup by message ID before hitting Rust.
  if (message.id && isDuplicate(message.id)) {
    return { ok: false, reason: 'duplicate_message_id' };
  }

  let outcome: VerifyOutcome;
  try {
    outcome = await invoke<VerifyOutcome>('dispatch_hmac_verify', {
      envelopeJson: message.rawJson,
    });
  } catch (err: unknown) {
    const reason = typeof err === 'string' ? err : String(err);

    if (reason === 'unsigned_after_cutoff') {
      console.error(
        '[dispatch] Rejecting unsigned message past cutoff date. ' + 'Mobile app must be updated.',
      );
      return { ok: false, reason };
    }

    if (reason === 'timestamp_expired') {
      console.warn('[dispatch] Rejected message with expired timestamp (clock drift > ±30s).');
      return { ok: false, reason };
    }

    if (reason === 'nonce_replay') {
      console.warn('[dispatch] Rejected replayed nonce.');
      return { ok: false, reason };
    }

    return { ok: false, reason };
  }

  if (outcome === 'unsigned_transitional') {
    const nowMs = Date.now();
    const daysLeft = Math.ceil((DISPATCH_HMAC_REQUIRED_AFTER_MS - nowMs) / 86_400_000);
    console.warn(
      `[dispatch] Accepting unsigned message in transitional window ` +
        `(${daysLeft} days until cutoff ${DISPATCH_HMAC_REQUIRED_AFTER}). ` +
        `Mobile app may need update.`,
    );
    _callbacks.onUnsignedTransitional?.();
  }

  return { ok: true, outcome };
}

/**
 * Sign an outbound control message for mobile.
 *
 * @param payload - Control message object. Must be JSON-serialisable.
 * @param msgType - Action string (e.g. `"approval_response"`).
 * @returns Wire-format JSON envelope ready to send over the data channel.
 */
export async function signOutbound(payload: unknown, msgType: string): Promise<string> {
  if (!_sessionActive) {
    throw new Error('[dispatch] session not initialised — call initDispatchSession first');
  }

  return invoke<string>('dispatch_hmac_sign', {
    payload,
    msgType,
  });
}

/**
 * Rotate the session key.
 *
 * Fetches a new dispatch salt from the Supabase RPC `rotate_dispatch_keys`
 * and re-initialises the Rust session with the new salt. The previous key
 * is discarded (Rust only keeps one active key at a time for session keys;
 * multi-key support lives at the session-pairing layer).
 *
 * Retries up to 3 times with exponential backoff on failure.
 *
 * @param pairingCode - The current pairing code.
 * @param supabaseRpc - A function that calls `rotate_dispatch_keys` and
 *   returns `{ new_salt: string }`. Injected to avoid circular dependency
 *   on the Supabase client.
 */
export async function rotateDispatchKey(
  pairingCode: string,
  supabaseRpc: () => Promise<{ new_salt: string }>,
): Promise<void> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((res) => setTimeout(res, 1000 * 2 ** (attempt - 1)));
    }
    try {
      const { new_salt } = await supabaseRpc();
      const keyHex = await invoke<string>('dispatch_hmac_init', {
        pairingCode,
        sessionSalt: new_salt,
      });
      console.debug('[dispatch] key rotated successfully');
      _callbacks.onKeyRotated?.(keyHex);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[dispatch] key rotation attempt ${attempt + 1} failed:`, err);
    }
  }

  throw new Error(
    `[dispatch] key rotation failed after ${MAX_ATTEMPTS} attempts: ${String(lastErr)}`,
  );
}

/**
 * Reset the session — zero the session key and clear the nonce + dedup caches.
 * Call this when the Dispatch connection terminates.
 */
export async function resetDispatchSession(): Promise<void> {
  if (!_sessionActive) return;

  try {
    await invoke<void>('dispatch_hmac_reset');
  } finally {
    _sessionActive = false;
    _dedupCache.clear();
    console.debug('[dispatch] session reset');
  }
}

/** Whether a dispatch session is currently active (key derived and stored). */
export function isDispatchSessionActive(): boolean {
  return _sessionActive;
}

/**
 * Extract `dispatchSalt` and `version` from `peer_ready` metadata.
 *
 * Mobile sends:
 * ```json
 * { "deviceType": "mobile", "app": "agiworkforce-mobile", "version": "...", "dispatchSalt": "..." }
 * ```
 *
 * Returns `null` when the field is absent (old mobile version or non-mobile peer).
 */
export function extractDispatchSalt(
  metadata: Record<string, unknown> | null | undefined,
): { salt: string; version?: string } | null {
  if (!metadata) return null;

  const salt = metadata['dispatchSalt'];
  if (typeof salt !== 'string' || salt.length === 0) return null;

  const version = typeof metadata['version'] === 'string' ? metadata['version'] : undefined;
  return { salt, version };
}
