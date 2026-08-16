
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPairingState,
  loadPairingState,
  requestPairing,
  unpair,
  confirmPairing,
  _resetStateForTesting,
} from '../src/features/native-bridge/pairing';

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
    sendMessage: vi.fn(),
  },
  storage: {
    session: makeStorageArea(sessionStore),
    local: makeStorageArea(localStore),
  },
};

beforeEach(() => {
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
  for (const k of Object.keys(localStore)) delete localStore[k];
  chromeMock.runtime.lastError = null;
  chromeMock.runtime.sendMessage.mockReset();
  chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
  _resetStateForTesting();
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
    expect(state.fingerprint).toBeNull();
  });
});

describe('confirmPairing', () => {
  it('stores token in session storage and transitions to paired', async () => {
    const token = 'secret-token-' + 'a'.repeat(28);
    const state = await confirmPairing(token, 'ab12');
    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('ab12');
    expect(sessionStore['agi_bridge_token']).toBe(token);
    expect(sessionStore['agi_pairing_fingerprint']).toBe('ab12');
  });

  it('derives fingerprint from first 4 chars when not provided', async () => {
    const token = 'xyzw' + 'a'.repeat(36);
    const state = await confirmPairing(token);
    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('xyzw');
  });

  it('rejects a malformed token shape (H-07)', async () => {
    const state = await confirmPairing('short');
    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/invalid shape/i);
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
  it('bootstraps a token before authorizing the unpacked extension manifest', async () => {
    const bootstrapToken = 'bootstrap-' + 'a'.repeat(40);
    const finalToken = 'bridge-tok-' + 'b'.repeat(40);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: bootstrapToken,
          fingerprint: 'boot1234',
          nativeHostManifestInstalled: false,
        }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: finalToken,
          fingerprint: 'bridge12',
          nativeHostManifestInstalled: true,
        }),
        text: async () => '',
      });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('AbortSignal', {
      timeout: (_ms: number) => ({ signal: 'mock-signal' }),
    });

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('bridge12');
    expect(sessionStore['agi_bridge_token']).toBe(finalToken);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/pair'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/pair'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Bridge-Token': bootstrapToken,
        }),
        body: JSON.stringify({ extensionId: 'test-extension-id' }),
      }),
    );
  });

  it('reconnects native messaging after the manifest is installed', async () => {
    const bootstrapToken = 'bootstrap-' + 'a'.repeat(40);
    const finalToken = 'bridge-tok-' + 'b'.repeat(40);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: bootstrapToken,
            fingerprint: 'boot1234',
            nativeHostManifestInstalled: false,
          }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: finalToken,
            fingerprint: 'bridge12',
            nativeHostManifestInstalled: true,
          }),
          text: async () => '',
        }),
    );
    vi.stubGlobal('AbortSignal', { timeout: (_ms: number) => ({}) });
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      nativeConnected: true,
      connectionStatus: 'connected',
    });

    await requestPairing();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'RECONNECT_NATIVE',
    });
  });
});

describe('requestPairing — failure paths', () => {
  it('reports an error when Desktop cannot install the native-host manifest', async () => {
    const bootstrapToken = 'bootstrap-' + 'a'.repeat(40);
    const finalToken = 'bridge-tok-' + 'b'.repeat(40);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: bootstrapToken,
            fingerprint: 'boot1234',
            nativeHostManifestInstalled: false,
          }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: finalToken,
            fingerprint: 'bridge12',
            nativeHostManifestInstalled: false,
          }),
          text: async () => '',
        }),
    );
    vi.stubGlobal('AbortSignal', { timeout: (_ms: number) => ({}) });

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/native host manifest/i);
    expect(sessionStore['agi_bridge_token']).toBeUndefined();
  });

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
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    vi.stubGlobal('AbortSignal', { timeout: (_ms: number) => ({}) });

    void requestPairing();
    const state = getPairingState();
    expect(state.phase).toBe('requesting');

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
