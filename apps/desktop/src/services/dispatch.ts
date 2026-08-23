import { invoke } from '../lib/tauri-mock';

export const DISPATCH_HMAC_REQUIRED_AFTER = '2026-05-26T00:00:00.000Z';
const DISPATCH_HMAC_REQUIRED_AFTER_MS = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();

const DISPATCH_HMAC_MIN_MOBILE_VERSION = '1.3.0';

const MAX_DEDUP_IDS = 1000;

const DEDUP_TTL_MS = 60_000;

export type VerifyOutcome = 'signed' | 'unsigned_transitional';

export type DispatchVerifyResult =
  | { ok: true; outcome: VerifyOutcome }
  | { ok: false; reason: string };

export interface InboundDispatchMessage {
  id?: string;
  rawJson: string;
}

export interface DispatchListenerCallbacks {
  onVersionMismatch?: (mobileVersion: string, minRequired: string) => void;
  onUnsignedTransitional?: () => void;
  onKeyRotated?: (newKeyHex: string) => void;
  onProtocolVersionUnsupported?: () => void;
}

let _sessionActive = false;

let _sessionLifecycleQueue: Promise<void> = Promise.resolve();
let _sessionLifecycleGeneration = 0;
let _sessionLifecycleHasKeyOrPendingSetup = false;

const _dedupCache = new Map<string, number>();

let _callbacks: DispatchListenerCallbacks = {};

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

export function setDispatchCallbacks(callbacks: DispatchListenerCallbacks): void {
  _callbacks = { ..._callbacks, ...callbacks };
}

/**
 * Initialise the desktop dispatch session key.
 *
 * Called from the connection store when `peer_ready` metadata contains a
 * `dispatchSalt`. The keying material is `pairingSecret` — 32 random bytes
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
    _callbacks.onVersionMismatch?.(mobileVersion, DISPATCH_HMAC_MIN_MOBILE_VERSION);
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
      _callbacks.onProtocolVersionUnsupported?.();
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
 * Fetches a new dispatch salt from the cloud API and re-initialises the Rust
 * session with that salt.
 * The previous key
 * is discarded (Rust only keeps one active key at a time for session keys;
 * multi-key support lives at the session-pairing layer).
 *
 * Retries up to 3 times with exponential backoff on failure.
 *
 * @param pairingCode - The current pairing code.
 * @param pairingSecret - The out-of-band secret from the active QR payload.
 * @param rotateKeyRequest - A function that calls the cloud key-rotation
 *   endpoint and returns `{ new_salt: string }`.
 */
export async function rotateDispatchKey(
  pairingCode: string,
  pairingSecret: string,
  rotateKeyRequest: () => Promise<{ new_salt: string }>,
): Promise<void> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  let rotationGeneration = _sessionLifecycleGeneration;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (rotationGeneration !== _sessionLifecycleGeneration) {
      throw new DispatchSessionSupersededError();
    }
    if (attempt > 0) {
      await new Promise((res) => setTimeout(res, 1000 * 2 ** (attempt - 1)));
      if (rotationGeneration !== _sessionLifecycleGeneration) {
        throw new DispatchSessionSupersededError();
      }
    }
    let expectedGenerationAfterOwnSetup: number | null = null;
    try {
      const { new_salt } = await rotateKeyRequest();
      if (rotationGeneration !== _sessionLifecycleGeneration) {
        throw new DispatchSessionSupersededError();
      }
      expectedGenerationAfterOwnSetup = rotationGeneration + 1;
      const keyHex = await initDispatchSession(pairingCode, new_salt, pairingSecret);
      console.debug('[dispatch] key rotated successfully');
      _callbacks.onKeyRotated?.(keyHex);
      return;
    } catch (err) {
      if (err instanceof DispatchSessionSupersededError) throw err;
      if (
        expectedGenerationAfterOwnSetup !== null &&
        _sessionLifecycleGeneration !== expectedGenerationAfterOwnSetup
      ) {
        throw new DispatchSessionSupersededError();
      }
      rotationGeneration = _sessionLifecycleGeneration;
      lastErr = err;
      console.warn(`[dispatch] key rotation attempt ${attempt + 1} failed:`, err);
    }
  }

  throw new Error(
    `[dispatch] key rotation failed after ${MAX_ATTEMPTS} attempts: ${String(lastErr)}`,
  );
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
