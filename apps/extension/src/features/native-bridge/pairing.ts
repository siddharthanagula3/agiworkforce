/**
 * Canonical desktop pairing state machine for the Chrome extension.
 *
 * Consumed by side_panel.ts (directly and via the native-bridge barrel).
 */

export type PairingPhase = 'idle' | 'requesting' | 'paired' | 'error';

export interface PairingState {
  phase: PairingPhase;
  /** Short fingerprint shown to the user when paired, e.g. "ab12" */
  fingerprint: string | null;
  error: string | null;
}

import { ALLOWED_BRIDGE_HOSTS, DEFAULT_AGI_BRIDGE_URL } from '../../background/policy';

const STORAGE_KEY_TOKEN = 'agi_bridge_token';
const STORAGE_KEY_FINGERPRINT = 'agi_pairing_fingerprint';

// SECURITY (H-07 audit 2026-05-19): pairing token / fingerprint shape.
// Tokens must be 32-128 chars of URL-safe base64 / hex. Fingerprints are
// shorter (4-32 chars, same charset). Reject anything else — including
// empty values, multi-MB JSON blobs, or values containing whitespace.
const PAIRING_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const PAIRING_FINGERPRINT_RE = /^[A-Za-z0-9_-]{4,32}$/;

export function isValidPairingToken(value: string): boolean {
  return typeof value === 'string' && PAIRING_TOKEN_RE.test(value);
}

export function isValidPairingFingerprint(value: string): boolean {
  return typeof value === 'string' && PAIRING_FINGERPRINT_RE.test(value);
}

// Use the canonical default exported by the policy module so this surface
// can't drift from background / side panel (L-06 + H-08).
const DEFAULT_BRIDGE_URL = DEFAULT_AGI_BRIDGE_URL;

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
 * Pairing uses two loopback-only requests:
 * 1. Bootstrap a short-lived bridge token without requesting manifest changes.
 * 2. Present that token while asking Desktop to authorize this extension ID.
 *
 * The second response rotates the token. Only that final token is stored in
 * session storage before the native-messaging worker is asked to reconnect.
 *
 * If the desktop /pair endpoint is not yet implemented, the fetch will reject
 * (ECONNREFUSED or non-ok status) and the state will be ERROR.
 */
export async function requestPairing(): Promise<PairingState> {
  if (_state.phase === 'requesting' || _state.phase === 'paired') {
    return getPairingState();
  }

  _state = { phase: 'requesting', fingerprint: null, error: null };

  try {
    const baseUrl = await getBridgeBaseUrl();

    // Only allow local bridge URLs.
    // SECURITY (H-03 audit 2026-05-19): use the shared ALLOWED_BRIDGE_HOSTS
    // set so this check stays in sync with `validateBridgeUrl`. The previous
    // literal `'::1'` mismatched `new URL('http://[::1]/').hostname` which
    // returns `'[::1]'` with brackets — IPv6 pairing always rejected.
    const parsed = new URL(baseUrl);
    if (!ALLOWED_BRIDGE_HOSTS.has(parsed.hostname)) {
      throw new Error('Pairing is only supported with local desktop bridge');
    }

    const bootstrapResp = await fetch(`${baseUrl}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    });

    if (!bootstrapResp.ok) {
      const text = await bootstrapResp.text().catch(() => '');
      throw new Error(`Desktop returned ${bootstrapResp.status}${text ? `: ${text}` : ''}`);
    }

    const bootstrapData = (await bootstrapResp.json()) as { token?: string };
    if (!bootstrapData.token || !isValidPairingToken(bootstrapData.token)) {
      throw new Error('Desktop returned a malformed bootstrap token');
    }

    const resp = await fetch(`${baseUrl}/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token': bootstrapData.token,
      },
      body: JSON.stringify({ extensionId: chrome.runtime.id }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Desktop returned ${resp.status}${text ? `: ${text}` : ''}`);
    }

    const data = (await resp.json()) as {
      token?: string;
      fingerprint?: string;
      nativeHostManifestInstalled?: boolean;
    };

    if (!data.token) {
      throw new Error('Desktop response missing token');
    }
    if (data.nativeHostManifestInstalled !== true) {
      throw new Error('Desktop could not install the native host manifest');
    }
    // SECURITY (H-07 audit 2026-05-19): validate token shape. Accept only
    // URL-safe base64 / hex tokens between 32 and 128 chars. Reject
    // arbitrary-length strings (a 10 MB JSON value would happily round-trip
    // through chrome.storage.session today). Same constraint on fingerprint.
    if (!isValidPairingToken(data.token)) {
      throw new Error('Desktop returned a malformed token');
    }
    const rawFingerprint = data.fingerprint ?? data.token.slice(0, 4);
    if (!isValidPairingFingerprint(rawFingerprint)) {
      throw new Error('Desktop returned a malformed fingerprint');
    }
    const fingerprint = rawFingerprint;

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

    if (typeof chrome.runtime.sendMessage === 'function') {
      await chrome.runtime.sendMessage({ type: 'RECONNECT_NATIVE' }).catch(() => undefined);
    }
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
  const trimmed = (token ?? '').trim();
  if (!trimmed) {
    _state = { phase: 'error', fingerprint: null, error: 'Token must not be empty' };
    return getPairingState();
  }
  // H-07: same shape check for user-supplied tokens (e.g. when the user
  // pastes a code from the desktop UI).
  if (!isValidPairingToken(trimmed)) {
    _state = { phase: 'error', fingerprint: null, error: 'Token has invalid shape' };
    return getPairingState();
  }

  const fp = fingerprint ?? trimmed.slice(0, 4);
  if (!isValidPairingFingerprint(fp)) {
    _state = { phase: 'error', fingerprint: null, error: 'Fingerprint has invalid shape' };
    return getPairingState();
  }

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
