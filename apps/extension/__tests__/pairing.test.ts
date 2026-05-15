/**
 * Tests for the desktop pairing state machine (src/pairing.ts).
 *
 * Chrome extension APIs are shimmed via the global chrome mock set up in
 * vitest.setup.ts / the existing test helpers. Fetch is mocked per-test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPairingState,
  loadPairingState,
  requestPairing,
  unpair,
  confirmPairing,
  _resetStateForTesting,
} from '../src/pairing';

// ── Minimal chrome storage shim ───────────────────────────────────────────────

type StorageCallback = (items: Record<string, unknown>) => void;
type RemoveCallback = () => void;
type SetCallback = () => void;

const sessionStore: Record<string, unknown> = {};
const localStore: Record<string, unknown> = {};

function makeStorageArea(store: Record<string, unknown>) {
  return {
    get(keys: string | string[], callback: StorageCallback) {
      const result: Record<string, unknown> = {};
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyList) {
        if (k in store) result[k] = store[k];
      }
      callback(result);
    },
    set(items: Record<string, unknown>, callback?: SetCallback) {
      Object.assign(store, items);
      callback?.();
    },
    remove(keys: string | string[], callback?: RemoveCallback) {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyList) delete store[k];
      callback?.();
    },
  };
}

const chromeMock = {
  runtime: {
    id: 'test-extension-id',
    lastError: null as null | { message: string },
  },
  storage: {
    session: makeStorageArea(sessionStore),
    local: makeStorageArea(localStore),
  },
};

// Install chrome global before each test
beforeEach(() => {
  // Reset all stores
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
  for (const k of Object.keys(localStore)) delete localStore[k];
  chromeMock.runtime.lastError = null;
  // Reset module-level state
  _resetStateForTesting();
  // Install chrome global
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getPairingState', () => {
  it('starts in idle phase', () => {
    const state = getPairingState();
    expect(state.phase).toBe('idle');
    expect(state.fingerprint).toBeNull();
    expect(state.error).toBeNull();
  });

  it('returns a copy, not the internal reference', () => {
    const a = getPairingState();
    const b = getPairingState();
    expect(a).not.toBe(b);
  });
});

describe('loadPairingState', () => {
  it('returns idle when session storage is empty', async () => {
    const state = await loadPairingState();
    expect(state.phase).toBe('idle');
  });

  it('returns paired when token exists in session storage', async () => {
    sessionStore['agi_bridge_token'] = 'tok123';
    sessionStore['agi_pairing_fingerprint'] = 'tok1';
    const state = await loadPairingState();
    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('tok1');
  });

  it('returns paired with null fingerprint when only token exists', async () => {
    sessionStore['agi_bridge_token'] = 'tok456';
    const state = await loadPairingState();
    expect(state.phase).toBe('paired');
    // No fingerprint key stored → fingerprint is null
    expect(state.fingerprint).toBeNull();
  });
});

describe('confirmPairing', () => {
  it('stores token in session storage and transitions to paired', async () => {
    const state = await confirmPairing('secret-token', 'ab12');
    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('ab12');
    expect(sessionStore['agi_bridge_token']).toBe('secret-token');
    expect(sessionStore['agi_pairing_fingerprint']).toBe('ab12');
  });

  it('derives fingerprint from first 4 chars when not provided', async () => {
    const state = await confirmPairing('xyzw_rest_of_token');
    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('xyzw');
  });

  it('returns error for empty token', async () => {
    const state = await confirmPairing('   ');
    expect(state.phase).toBe('error');
    expect(state.error).toBeTruthy();
  });
});

describe('unpair', () => {
  it('removes token from session storage and returns idle', async () => {
    sessionStore['agi_bridge_token'] = 'tok';
    sessionStore['agi_pairing_fingerprint'] = 'to12';
    await loadPairingState();

    const state = await unpair();
    expect(state.phase).toBe('idle');
    expect(state.fingerprint).toBeNull();
    expect(sessionStore['agi_bridge_token']).toBeUndefined();
    expect(sessionStore['agi_pairing_fingerprint']).toBeUndefined();
  });

  it('is safe to call when already idle', async () => {
    const state = await unpair();
    expect(state.phase).toBe('idle');
  });
});

describe('requestPairing — success path', () => {
  it('stores token + fingerprint and transitions to paired', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'bridge-tok', fingerprint: 'br12' }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('AbortSignal', {
      timeout: (_ms: number) => ({ signal: 'mock-signal' }),
    });

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('br12');
    expect(sessionStore['agi_bridge_token']).toBe('bridge-tok');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/pair'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('requestPairing — failure paths', () => {
  it('transitions to error when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    vi.stubGlobal('AbortSignal', { timeout: (_ms: number) => ({}) });

    const state = await requestPairing();
    expect(state.phase).toBe('error');
    expect(state.error).toContain('ECONNREFUSED');
  });

  it('transitions to error when desktop returns non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'service unavailable',
      }),
    );
    vi.stubGlobal('AbortSignal', { timeout: (_ms: number) => ({}) });

    const state = await requestPairing();
    expect(state.phase).toBe('error');
    expect(state.error).toContain('503');
  });

  it('is idempotent when already requesting (no double-fire)', async () => {
    // Force into requesting phase
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {}))); // never resolves
    vi.stubGlobal('AbortSignal', { timeout: (_ms: number) => ({}) });

    void requestPairing();
    const state = getPairingState();
    expect(state.phase).toBe('requesting');

    // Second call should return immediately without launching another fetch
    const state2 = await requestPairing();
    expect(state2.phase).toBe('requesting');
  });

  it('rejects non-localhost bridge URL', async () => {
    localStore['agi_bridge_url'] = 'http://remote-host.example.com:8787';

    const state = await requestPairing();
    expect(state.phase).toBe('error');
    expect(state.error).toContain('local');
  });
});
