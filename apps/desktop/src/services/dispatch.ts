import { invoke } from '../lib/tauri-mock';

export const DISPATCH_HMAC_REQUIRED_AFTER = '2026-05-26T00:00:00.000Z';
const DISPATCH_HMAC_REQUIRED_AFTER_MS = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();

const DISPATCH_HMAC_MIN_MOBILE_VERSION = '1.3.0';

const MAX_DEDUP_IDS = 1000;

const DEDUP_TTL_MS = 60_000;

export type VerifyOutcome = 'signed' | 'unsigned_transitional';

export type DispatchVerifyResult =
  { ok: true; outcome: VerifyOutcome } | { ok: false; reason: string };

export interface InboundDispatchMessage {
  id?: string;
  rawJson: string;
}

let _sessionActive = false;

let _sessionLifecycleQueue: Promise<void> = Promise.resolve();
let _sessionLifecycleGeneration = 0;
let _sessionLifecycleHasKeyOrPendingSetup = false;

const _dedupCache = new Map<string, number>();

class DispatchSessionSupersededError extends Error {
  constructor() {
    super('[dispatch] session setup superseded');
  }
}

function enqueueSessionLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = _sessionLifecycleQueue.catch(() => undefined).then(operation);
  _sessionLifecycleQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

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

/**
 * Initialise the desktop dispatch session key.
 *
 * Called from the connection store when `peer_ready` metadata contains a
 * `dispatchSalt`. The keying material is `pairingSecret`, 32 random bytes
 * this desktop generated and published only in the QR / pairing-link payload,
 * never to the signaling relay. The relay-visible pairing code and salt are
 * mixed in to bind the key to one session but are not sufficient to derive it.
 *
 * @param pairingCode - The 8+ char pairing code shared between devices.
 * @param dispatchSalt - Hex salt from `peer_ready` metadata.
 * @param pairingSecret - 64-char hex out-of-band secret from the QR payload.
 * @param mobileVersion - Optional mobile app version string for mismatch check.
 * @returns hex-encoded 64-char derived key (diagnostic only; do not persist).
 */
export async function initDispatchSession(
  pairingCode: string,
  dispatchSalt: string,
  pairingSecret: string,
  mobileVersion?: string,
): Promise<string> {
  if (mobileVersion && !isMobileVersionSufficient(mobileVersion)) {
    console.warn(
      `[dispatch] Mobile version ${mobileVersion} does not support HMAC signing. ` +
        `Force-update required before ${DISPATCH_HMAC_REQUIRED_AFTER}.`,
    );
  }

  const setupGeneration = ++_sessionLifecycleGeneration;
  _sessionLifecycleHasKeyOrPendingSetup = true;
  _sessionActive = false;
  _dedupCache.clear();

  return enqueueSessionLifecycle(async () => {
    if (setupGeneration !== _sessionLifecycleGeneration) {
      throw new DispatchSessionSupersededError();
    }

    try {
      const keyHex = await invoke<string>('dispatch_hmac_init', {
        pairingCode,
        sessionSalt: dispatchSalt,
        pairingSecret,
      });
      if (setupGeneration !== _sessionLifecycleGeneration) {
        throw new DispatchSessionSupersededError();
      }

      _sessionActive = true;
      _dedupCache.clear();
      console.debug('[dispatch] session key initialised');
      return keyHex;
    } catch (error) {
      if (setupGeneration === _sessionLifecycleGeneration) {
        _sessionActive = false;
        _sessionLifecycleHasKeyOrPendingSetup = false;
      }
      throw error;
    }
  });
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

    if (reason === 'update_required') {
      console.error(
        '[dispatch] Rejecting envelope from a peer on an older dispatch protocol. ' +
          'Both apps must be updated before pairing can be secured.',
      );
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
    throw new Error('[dispatch] session not initialised, call initDispatchSession first');
  }

  return invoke<string>('dispatch_hmac_sign', {
    payload,
    msgType,
  });
}

export async function resetDispatchSession(): Promise<void> {
  const shouldResetNative = _sessionLifecycleHasKeyOrPendingSetup || _sessionActive;
  _sessionLifecycleGeneration += 1;

  _sessionActive = false;
  _sessionLifecycleHasKeyOrPendingSetup = false;
  _dedupCache.clear();
  if (!shouldResetNative) return;

  return enqueueSessionLifecycle(async () => {
    try {
      await invoke<void>('dispatch_hmac_reset');
    } finally {
      console.debug('[dispatch] session reset');
    }
  });
}

export function isDispatchSessionActive(): boolean {
  return _sessionActive;
}

export function extractDispatchSalt(
  metadata: Record<string, unknown> | null | undefined,
): { salt: string; version?: string } | null {
  if (!metadata) return null;

  const salt = metadata['dispatchSalt'];
  if (typeof salt !== 'string' || salt.length === 0) return null;

  const version = typeof metadata['version'] === 'string' ? metadata['version'] : undefined;
  return { salt, version };
}
