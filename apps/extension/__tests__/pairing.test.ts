import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  beginPairing,
  getPairingState,
  isValidPairingCode,
  loadPairingState,
  normalizePairingCode,
  requestPairing,
  startPairing,
  storeBridgeSecret,
  submitPairingCode,
  unpair,
  confirmPairing,
  _resetStateForTesting,
} from '../src/features/native-bridge/pairing';

type StorageCallback = (items: Record<string, unknown>) => void;
type RemoveCallback = () => void;
type SetCallback = () => void;

const sessionStore: Record<string, unknown> = {};
const localStore: Record<string, unknown> = {};

const BRIDGE_SECRET = `ipc${'0123456789abcdef'.repeat(4)}`.slice(0, 64);
const DESKTOP_PAIR_TOKEN = `pair${'fedcba9876543210'.repeat(4)}`.slice(0, 64);

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

function seedBridgeSecret(token: string = BRIDGE_SECRET): void {
  sessionStore['agi_bridge_secret'] = token;
}

function pairResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      token: DESKTOP_PAIR_TOKEN,
      fingerprint: DESKTOP_PAIR_TOKEN.slice(0, 8),
      nativeHostManifestInstalled: true,
      ...overrides,
    }),
    text: async () => '',
  };
}

beforeEach(() => {
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
  for (const k of Object.keys(localStore)) delete localStore[k];
  chromeMock.runtime.lastError = null;
  chromeMock.runtime.sendMessage.mockReset();
  chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
  _resetStateForTesting();
  vi.stubGlobal('chrome', chromeMock);
  vi.stubGlobal('AbortSignal', { timeout: (_ms: number) => ({ signal: 'mock-signal' }) });
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
    sessionStore['agi_pair_token'] = 'tok123';
    sessionStore['agi_pairing_fingerprint'] = 'tok1';
    const state = await loadPairingState();
    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('tok1');
  });

  it('returns paired with null fingerprint when only token exists', async () => {
    sessionStore['agi_pair_token'] = 'tok456';
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
    expect(sessionStore['agi_pair_token']).toBe(token);
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
    sessionStore['agi_pair_token'] = 'tok';
    sessionStore['agi_pairing_fingerprint'] = 'to12';
    await loadPairingState();

    const state = await unpair();
    expect(state.phase).toBe('idle');
    expect(state.fingerprint).toBeNull();
    expect(sessionStore['agi_pair_token']).toBeUndefined();
    expect(sessionStore['agi_pairing_fingerprint']).toBeUndefined();
  });

  it('is safe to call when already idle', async () => {
    const state = await unpair();
    expect(state.phase).toBe('idle');
  });
});

describe('requestPairing — authorizes with the operator-supplied bridge secret', () => {
  it('sends the stored bridge secret as X-Bridge-Token on a single POST /pair', async () => {
    seedBridgeSecret();
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/pair'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Bridge-Token': BRIDGE_SECRET,
        }),
        body: JSON.stringify({ extensionId: 'test-extension-id' }),
      }),
    );
  });

  it('never sends a token the desktop issued during this flow (SEC-11)', async () => {
    seedBridgeSecret();
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    await requestPairing();

    const sentTokens = fetchMock.mock.calls.map(
      ([, init]) => (init.headers as Record<string, string>)['X-Bridge-Token'],
    );
    expect(sentTokens).toEqual([BRIDGE_SECRET]);
    expect(sentTokens).not.toContain(DESKTOP_PAIR_TOKEN);
  });

  it('stores the desktop-issued pair token and fingerprint on success', async () => {
    seedBridgeSecret();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse()));

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe(DESKTOP_PAIR_TOKEN.slice(0, 8));
    expect(sessionStore['agi_pair_token']).toBe(DESKTOP_PAIR_TOKEN);
    expect(sessionStore['agi_pairing_fingerprint']).toBe(DESKTOP_PAIR_TOKEN.slice(0, 8));
  });

  it('reconnects native messaging after the manifest is installed', async () => {
    seedBridgeSecret();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse()));
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
  it('fails before any network call when no bridge token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/copy the bridge token from desktop/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStore['agi_pair_token']).toBeUndefined();
  });

  it('treats a whitespace-only stored bridge token as missing', async () => {
    seedBridgeSecret('   ');
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/copy the bridge token from desktop/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an error when Desktop cannot install the native-host manifest', async () => {
    seedBridgeSecret();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pairResponse({ nativeHostManifestInstalled: false })),
    );

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/native host manifest/i);
    expect(sessionStore['agi_bridge_secret']).toBe(BRIDGE_SECRET);
  });

  it('reports an error when the desktop response omits the token', async () => {
    seedBridgeSecret();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse({ token: undefined })));

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/missing token/i);
  });

  it('rejects a malformed token returned by the desktop', async () => {
    seedBridgeSecret();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pairResponse({ token: 'nope', fingerprint: 'nope' })),
    );

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/malformed token/i);
    expect(sessionStore['agi_bridge_secret']).toBe(BRIDGE_SECRET);
  });

  it('rejects a malformed fingerprint returned by the desktop', async () => {
    seedBridgeSecret();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse({ fingerprint: 'no!' })));

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/malformed fingerprint/i);
  });

  it('transitions to error when fetch rejects', async () => {
    seedBridgeSecret();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const state = await requestPairing();
    expect(state.phase).toBe('error');
    expect(state.error).toContain('ECONNREFUSED');
  });

  it('transitions to error when desktop returns non-ok status', async () => {
    seedBridgeSecret();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'service unavailable',
      }),
    );

    const state = await requestPairing();
    expect(state.phase).toBe('error');
    expect(state.error).toContain('503');
  });

  it('surfaces the desktop 401 when the stored token is not the bridge secret', async () => {
    seedBridgeSecret('not-the-bridge-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized manifest install',
      }),
    );

    const state = await requestPairing();
    expect(state.phase).toBe('error');
    expect(state.error).toContain('401');
    expect(state.error).toMatch(/unauthorized manifest install/i);
  });

  it('is idempotent when already requesting (no double-fire)', async () => {
    seedBridgeSecret();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    void requestPairing();
    const state = getPairingState();
    expect(state.phase).toBe('requesting');

    const state2 = await requestPairing();
    expect(state2.phase).toBe('requesting');
  });

  it('rejects non-localhost bridge URL', async () => {
    seedBridgeSecret();
    localStore['agi_bridge_url'] = 'http://remote-host.example.com:8787';
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await requestPairing();
    expect(state.phase).toBe('error');
    expect(state.error).toContain('local');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const REQUEST_ID = 'a1b2c3d4e5f60718';
const DESKTOP_CODE = 'ABCD2345';

function pairRequestResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      requestId: REQUEST_ID,
      expiresInMs: 120000,
      codeLength: 8,
      ...overrides,
    }),
    text: async () => '',
  };
}

function unauthorizedResponse(body = 'Pairing code did not match') {
  return {
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => body,
  };
}

describe('pairing code helpers', () => {
  it('normalizes what a user types off the Desktop screen', () => {
    expect(normalizePairingCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(isValidPairingCode('abcd 2345')).toBe(true);
    expect(isValidPairingCode('ABCD234')).toBe(true);
    expect(isValidPairingCode('ABCD')).toBe(false);
    expect(isValidPairingCode('ABCDI345')).toBe(false);
  });
});

describe('startPairing — asks Desktop to display a code', () => {
  it('posts the extension id and receives only an opaque request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pairRequestResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await startPairing();

    expect(state.phase).toBe('awaiting-code');
    expect(state.requestId).toBe(REQUEST_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/pair/request');
    expect(init.body).toBe(JSON.stringify({ extensionId: 'test-extension-id' }));
    expect((init.headers as Record<string, string>)['X-Bridge-Token']).toBeUndefined();
  });

  it('stores nothing that could authorize an install', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairRequestResponse()));

    await startPairing();

    expect(sessionStore['agi_pair_token']).toBeUndefined();
    expect(sessionStore['agi_bridge_secret']).toBeUndefined();
    expect(JSON.stringify(sessionStore)).not.toContain(DESKTOP_CODE);
  });

  it('rejects a malformed request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairRequestResponse({ requestId: 'nope!' })));

    const state = await startPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/malformed pairing request id/i);
  });

  it('surfaces a desktop rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Too many pending pairing requests',
      }),
    );

    const state = await startPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toContain('429');
  });
});

describe('submitPairingCode — the code the user read off Desktop', () => {
  async function startAwaitingCode() {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairRequestResponse()));
    const state = await startPairing();
    expect(state.phase).toBe('awaiting-code');
  }

  it('sends the normalized code with the request id and stores the issued token', async () => {
    await startAwaitingCode();
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await submitPairingCode('abcd-2345');

    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe(DESKTOP_PAIR_TOKEN.slice(0, 8));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/pair/confirm');
    expect(init.body).toBe(JSON.stringify({ requestId: REQUEST_ID, code: DESKTOP_CODE }));
    expect(sessionStore['agi_pair_token']).toBe(DESKTOP_PAIR_TOKEN);
    expect(sessionStore['agi_pair_request']).toBeUndefined();
  });

  it('refuses to confirm before a request was opened', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const state = await submitPairingCode(DESKTOP_CODE);

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/start a pairing request/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never contacts Desktop with a code that cannot be a real one', async () => {
    await startAwaitingCode();
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await submitPairingCode('??');

    expect(state.phase).toBe('awaiting-code');
    expect(state.error).toMatch(/enter the code shown in desktop/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays on the code prompt when Desktop rejects a wrong code', async () => {
    await startAwaitingCode();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorizedResponse()));

    const state = await submitPairingCode('ZZZZ9999');

    expect(state.phase).toBe('awaiting-code');
    expect(state.requestId).toBe(REQUEST_ID);
    expect(state.error).toContain('401');
    expect(sessionStore['agi_pair_token']).toBeUndefined();
  });

  it('reports when Desktop could not install the manifest', async () => {
    await startAwaitingCode();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pairResponse({ nativeHostManifestInstalled: false })),
    );

    const state = await submitPairingCode(DESKTOP_CODE);

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/native host manifest/i);
    expect(sessionStore['agi_pair_token']).toBeUndefined();
  });
});

describe('beginPairing — one button, both paths', () => {
  it('runs the code handshake when no operator secret is provisioned', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pairRequestResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await beginPairing();

    expect(state.phase).toBe('awaiting-code');
    expect(fetchMock.mock.calls[0][0]).toContain('/pair/request');
  });

  it('uses the operator secret when one is provisioned', async () => {
    seedBridgeSecret();
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await beginPairing();

    expect(state.phase).toBe('paired');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/pair$/);
    expect((init.headers as Record<string, string>)['X-Bridge-Token']).toBe(BRIDGE_SECRET);
  });
});

describe('storeBridgeSecret — the operator credential keeps its own key', () => {
  it('writes the secret without claiming the extension is paired', async () => {
    const state = await storeBridgeSecret(BRIDGE_SECRET);

    expect(state.phase).toBe('idle');
    expect(sessionStore['agi_bridge_secret']).toBe(BRIDGE_SECRET);
    expect(sessionStore['agi_pair_token']).toBeUndefined();
  });

  it('does not overwrite a desktop-issued pair token', async () => {
    seedBridgeSecret();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse()));
    await requestPairing();

    await storeBridgeSecret(`rotated${'0123456789abcdef'.repeat(4)}`.slice(0, 64));

    expect(sessionStore['agi_pair_token']).toBe(DESKTOP_PAIR_TOKEN);
    expect(sessionStore['agi_bridge_secret']).not.toBe(DESKTOP_PAIR_TOKEN);
  });

  it('rejects a malformed secret', async () => {
    const state = await storeBridgeSecret('short');
    expect(state.phase).toBe('error');
    expect(sessionStore['agi_bridge_secret']).toBeUndefined();
  });
});

describe('loadPairingState — resumes an open handshake', () => {
  it('returns awaiting-code when a live request is stored', async () => {
    sessionStore['agi_pair_request'] = {
      requestId: REQUEST_ID,
      codeLength: 8,
      expiresAt: Date.now() + 60000,
    };

    const state = await loadPairingState();

    expect(state.phase).toBe('awaiting-code');
    expect(state.requestId).toBe(REQUEST_ID);
  });

  it('ignores an expired request', async () => {
    sessionStore['agi_pair_request'] = {
      requestId: REQUEST_ID,
      codeLength: 8,
      expiresAt: Date.now() - 1,
    };

    const state = await loadPairingState();

    expect(state.phase).toBe('idle');
  });
});
