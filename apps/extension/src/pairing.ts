/**
 * Desktop pairing state machine for the Chrome extension.
 *
 * States: IDLE → REQUESTING → PAIRED | ERROR
 *         PAIRED → IDLE (unpair)
 *
 * The token returned by the desktop is stored in chrome.storage.session
 * ('agi_bridge_token') so background.ts can attach it to bridge requests
 * as X-Bridge-Token without further reads.
 *
 * The desktop endpoint is POST http://127.0.0.1:8787/pair (or overridden
 * bridge URL + /pair). If the desktop is not yet running an actual /pair
 * endpoint, the flow degrades gracefully: request fails → ERROR state with
 * a clear message.
 *
 * TODO(desktop): implement POST /pair on the desktop bridge server and return
 * { token: string; fingerprint: string }.
 */

export type PairingPhase = 'idle' | 'requesting' | 'paired' | 'error';

export interface PairingState {
  phase: PairingPhase;
  /** Short fingerprint shown to the user when paired, e.g. "ab12" */
  fingerprint: string | null;
  error: string | null;
}

const STORAGE_KEY_TOKEN = 'agi_bridge_token';
const STORAGE_KEY_FINGERPRINT = 'agi_pairing_fingerprint';

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8787';

let _state: PairingState = { phase: 'idle', fingerprint: null, error: null };

export function getPairingState(): PairingState {
  return { ..._state };
}

/** Load persisted pairing state from storage so the popup can restore UI. */
export async function loadPairingState(): Promise<PairingState> {
  try {
    const sessionData = await new Promise<Record<string, unknown>>((resolve, reject) => {
      chrome.storage.session.get([STORAGE_KEY_TOKEN, STORAGE_KEY_FINGERPRINT], (r) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(r as Record<string, unknown>);
        }
      });
    });

    const token = sessionData[STORAGE_KEY_TOKEN] as string | undefined;
    const fingerprint = sessionData[STORAGE_KEY_FINGERPRINT] as string | undefined;

    if (token) {
      _state = { phase: 'paired', fingerprint: fingerprint ?? null, error: null };
    } else {
      _state = { phase: 'idle', fingerprint: null, error: null };
    }
  } catch {
    _state = { phase: 'idle', fingerprint: null, error: null };
  }
  return getPairingState();
}

/** Read the active bridge base URL from storage, falling back to the default. */
async function getBridgeBaseUrl(): Promise<string> {
  try {
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      chrome.storage.local.get('agi_bridge_url', (r) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(r as Record<string, unknown>);
        }
      });
    });
    const stored = (result['agi_bridge_url'] as string | undefined)?.trim();
    return stored ?? DEFAULT_BRIDGE_URL;
  } catch {
    return DEFAULT_BRIDGE_URL;
  }
}

/**
 * Request pairing with the desktop app.
 *
 * Sends POST <bridgeUrl>/pair. The desktop is expected to respond with
 * { token: string; fingerprint: string }. On success, the token is stored in
 * session storage and the state transitions to PAIRED. On failure the state
 * transitions to ERROR with the failure reason.
 *
 * If the desktop /pair endpoint is not yet implemented, the fetch will reject
 * (ECONNREFUSED or non-ok status) and the state will be ERROR. The TODO above
 * is the marker for the desktop-side implementation work.
 */
export async function requestPairing(): Promise<PairingState> {
  if (_state.phase === 'requesting' || _state.phase === 'paired') {
    return getPairingState();
  }

  _state = { phase: 'requesting', fingerprint: null, error: null };

  try {
    const baseUrl = await getBridgeBaseUrl();

    // Only allow local bridge URLs (security constraint: same as bridge URL validation)
    const parsed = new URL(baseUrl);
    const host = parsed.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
      throw new Error('Pairing is only supported with local desktop bridge');
    }

    const resp = await fetch(`${baseUrl}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extensionId: chrome.runtime.id }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Desktop returned ${resp.status}${text ? `: ${text}` : ''}`);
    }

    const data = (await resp.json()) as { token?: string; fingerprint?: string };

    if (!data.token) {
      throw new Error('Desktop response missing token');
    }

    const fingerprint = data.fingerprint ?? data.token.slice(0, 4);

    // Persist token in session storage so background.ts can read it
    await new Promise<void>((resolve, reject) => {
      chrome.storage.session.set(
        { [STORAGE_KEY_TOKEN]: data.token, [STORAGE_KEY_FINGERPRINT]: fingerprint },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        },
      );
    });

    _state = { phase: 'paired', fingerprint, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Pairing failed';
    _state = { phase: 'error', fingerprint: null, error: msg };
  }

  return getPairingState();
}

/** Clear the stored token and return the extension to unpaired state. */
export async function unpair(): Promise<PairingState> {
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.storage.session.remove([STORAGE_KEY_TOKEN, STORAGE_KEY_FINGERPRINT], () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  } catch {
    // Storage removal failure should not block state reset
  }

  _state = { phase: 'idle', fingerprint: null, error: null };
  return getPairingState();
}

/**
 * Confirm an externally-provided token (e.g., the user copied it from the
 * desktop and typed it in). Stores the token and transitions to PAIRED.
 */
export async function confirmPairing(token: string, fingerprint?: string): Promise<PairingState> {
  if (!token.trim()) {
    _state = { phase: 'error', fingerprint: null, error: 'Token must not be empty' };
    return getPairingState();
  }

  const fp = fingerprint ?? token.trim().slice(0, 4);

  try {
    await new Promise<void>((resolve, reject) => {
      chrome.storage.session.set(
        { [STORAGE_KEY_TOKEN]: token.trim(), [STORAGE_KEY_FINGERPRINT]: fp },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        },
      );
    });
    _state = { phase: 'paired', fingerprint: fp, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to store token';
    _state = { phase: 'error', fingerprint: null, error: msg };
  }

  return getPairingState();
}

/** Reset in-memory state (for tests). */
export function _resetStateForTesting(): void {
  _state = { phase: 'idle', fingerprint: null, error: null };
}
