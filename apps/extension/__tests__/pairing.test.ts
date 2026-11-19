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
  releaseStoredDesktopPairing,
  readPendingDesktopRevocation,
  desktopPairingRejectsAccount,
  confirmPairing,
  _resetStateForTesting,
} from '../src/features/native-bridge/pairing';

const sessionStore: Record<string, unknown> = {};
const localStore: Record<string, unknown> = {};

const BRIDGE_SECRET = `ipc${'0123456789abcdef'.repeat(4)}`.slice(0, 64);
const DESKTOP_PAIR_TOKEN = `pair${'fedcba9876543210'.repeat(4)}`.slice(0, 64);

function makeStorageArea(store: Record<string, unknown>) {
  return {
    async get(keys: string | string[]) {
      const result: Record<string, unknown> = {};
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyList) {
        if (k in store) result[k] = store[k];
      }
      return result;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, items);
    },
    async remove(keys: string | string[]) {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyList) delete store[k];
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

function seedPairing(
  accountId: string | null = null,
  fingerprint = 'ab12',
  token: string = DESKTOP_PAIR_TOKEN,
): void {
  localStore['connectedToDesktop'] = true;
  localStore['agi_paired_desktop'] = { fingerprint, accountId, token };
}

function storedPairing(): { fingerprint?: string; accountId?: string | null; token?: string } {
  return (localStore['agi_paired_desktop'] ?? {}) as {
    fingerprint?: string;
    accountId?: string | null;
    token?: string;
  };
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

  it('returns paired when this profile holds the pair token', async () => {
    seedPairing(null, 'tok1');
    const state = await loadPairingState();
    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('tok1');
  });

  it('is not paired when the record has no usable token, whatever the connection flag says', async () => {
    localStore['connectedToDesktop'] = true;
    localStore['agi_paired_desktop'] = { fingerprint: 'tok1', accountId: null };
    expect((await loadPairingState()).phase).toBe('idle');
    localStore['agi_paired_desktop'] = { fingerprint: 'tok1', accountId: null, token: 'short' };
    expect((await loadPairingState()).phase).toBe('idle');
  });
});

describe('a pairing is a credential of the signed-in account', () => {
  function signedInAs(accountId: string, authIncarnation = 'sess_1'): void {
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      token: 'cloud-token',
      owner: { accountId, authIncarnation },
    });
  }

  it('is released, with the unpair owed to Desktop, when the account signs out', async () => {
    seedPairing('acct_1');
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

    const state = await loadPairingState();

    expect(state.phase).toBe('idle');
    expect(localStore['agi_paired_desktop']).toBeUndefined();
    expect(localStore['connectedToDesktop']).toBeUndefined();
    expect((await readPendingDesktopRevocation())?.token).toBe(DESKTOP_PAIR_TOKEN);
  });

  it('never carries over to a different account', async () => {
    seedPairing('acct_1');
    signedInAs('acct_2');

    expect((await loadPairingState()).phase).toBe('idle');
    expect(localStore['agi_paired_desktop']).toBeUndefined();
  });

  it('survives a session refresh, which rotates the incarnation but not the account', async () => {
    seedPairing('acct_1');
    signedInAs('acct_1', 'sess_rotated');

    expect((await loadPairingState()).phase).toBe('paired');
    expect(storedPairing().token).toBe(DESKTOP_PAIR_TOKEN);
  });

  it('is left alone when the background cannot say who is signed in', async () => {
    seedPairing('acct_1');
    chromeMock.runtime.sendMessage.mockRejectedValue(new Error('worker asleep'));

    expect((await loadPairingState()).phase).toBe('paired');
    expect(storedPairing().token).toBe(DESKTOP_PAIR_TOKEN);
  });

  it('binds a pairing issued while signed in, so the next sign-out releases it', async () => {
    signedInAs('acct_1');
    const token = 'secret-token-' + 'a'.repeat(28);

    await confirmPairing(token, 'ab12');

    expect(storedPairing().accountId).toBe('acct_1');
  });

  it('binds a pairing made while signed out to the next account on disk, so a restart keeps it', async () => {
    seedPairing(null);
    signedInAs('acct_1');

    expect((await loadPairingState()).phase).toBe('paired');
    expect(storedPairing().accountId).toBe('acct_1');

    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    _resetStateForTesting();
    chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
    expect((await loadPairingState()).phase).toBe('idle');
    expect(localStore['agi_paired_desktop']).toBeUndefined();
  });
});

describe('confirmPairing', () => {
  it('stores the token with this profile and transitions to paired', async () => {
    const token = 'secret-token-' + 'a'.repeat(28);
    const state = await confirmPairing(token, 'ab12');
    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe('ab12');
    expect(storedPairing()).toMatchObject({ token, fingerprint: 'ab12' });
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
  it('removes the stored pairing and returns idle', async () => {
    seedPairing(null, 'to12');
    await loadPairingState();

    const state = await unpair();
    expect(state.phase).toBe('idle');
    expect(state.fingerprint).toBeNull();
    expect(localStore['agi_paired_desktop']).toBeUndefined();
  });

  it('is safe to call when already idle', async () => {
    const state = await unpair();
    expect(state.phase).toBe('idle');
  });

  describe('when Desktop does not acknowledge the unpair', () => {
    async function pairThenLoseDesktop(
      answer: () => Promise<unknown>,
    ): Promise<ReturnType<typeof unpair>> {
      seedPairing(null, 'to12');
      chromeMock.runtime.sendMessage.mockImplementation(answer);
      return unpair();
    }

    it.each([
      ['an explicit failure receipt', () => Promise.resolve({ success: false })],
      ['a delivery exception', () => Promise.reject(new Error('Receiving end does not exist'))],
      ['no receipt at all', () => Promise.resolve(undefined)],
    ])('records the revocation as owed after %s', async (_name, answer) => {
      const state = await pairThenLoseDesktop(answer);

      expect(state.phase).toBe('idle');
      expect(state.error).toMatch(/could not be reached to remove the pairing/);
      expect(state.error).toMatch(/removed the next time Desktop is open/);
      expect(localStore['agi_paired_desktop']).toBeUndefined();
      expect((await readPendingDesktopRevocation())?.token).toBe(DESKTOP_PAIR_TOKEN);
    });

    it('takes the background at its word when it already recorded the owed unpair', async () => {
      const state = await pairThenLoseDesktop(() =>
        Promise.resolve({ success: false, revocationOwed: true }),
      );

      expect(state.error).toMatch(/could not be reached to remove the pairing/);
      expect(await readPendingDesktopRevocation()).toBeNull();
    });

    it('keeps telling the user after a browser restart', async () => {
      await pairThenLoseDesktop(() => Promise.resolve({ success: false }));
      _resetStateForTesting();

      const restarted = await loadPairingState();

      expect(restarted.phase).toBe('idle');
      expect(restarted.error).toMatch(/could not be reached to remove the pairing/);
    });

    it('keeps the pairing when the owed revocation cannot be recorded', async () => {
      const original = chromeMock.storage.local.set;
      chromeMock.storage.local.set = async (items: Record<string, unknown>) => {
        if ('agi_pending_desktop_revocation' in items) throw new Error('quota');
        return original(items);
      };
      try {
        const state = await pairThenLoseDesktop(() => Promise.resolve({ success: false }));

        expect(state.error).toMatch(/pairing was kept/);
        expect(storedPairing().token).toBe(DESKTOP_PAIR_TOKEN);
        expect(await readPendingDesktopRevocation()).toBeNull();
      } finally {
        chromeMock.storage.local.set = original;
      }
    });

    it('owes nothing once Desktop acknowledges', async () => {
      const state = await pairThenLoseDesktop(() => Promise.resolve({ success: true }));

      expect(state.error).toBeNull();
      expect(await readPendingDesktopRevocation()).toBeNull();
    });

    it('drops the owed revocation when a new pairing replaces the old one', async () => {
      await pairThenLoseDesktop(() => Promise.resolve({ success: false }));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairRequestResponse()));
      expect((await startPairing()).phase).toBe('awaiting-code');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse()));

      expect((await submitPairingCode('abcd-2345')).phase).toBe('paired');

      expect(await readPendingDesktopRevocation()).toBeNull();
    });
  });
});

describe('desktopPairingRejectsAccount', () => {
  function seedDurablePairing(accountId: string | null): void {
    seedPairing(accountId);
  }

  it('rejects a pairing bound to a different account', async () => {
    seedDurablePairing('acct_1');
    expect(await desktopPairingRejectsAccount('acct_2')).toBe(true);
  });

  it('keeps a pairing for the same account', async () => {
    seedDurablePairing('acct_1');
    expect(await desktopPairingRejectsAccount('acct_1')).toBe(false);
  });

  it('rejects a bound pairing when the account has signed out', async () => {
    seedDurablePairing('acct_1');
    expect(await desktopPairingRejectsAccount(null)).toBe(true);
  });

  it('keeps a pairing that was issued with no account', async () => {
    seedDurablePairing(null);
    expect(await desktopPairingRejectsAccount('acct_2')).toBe(false);
  });

  it('does nothing when no pairing is stored', async () => {
    expect(await desktopPairingRejectsAccount('acct_2')).toBe(false);
  });

  it('reads the account binding from the stored pairing, which survives a restart', async () => {
    seedDurablePairing('acct_1');
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    expect(await desktopPairingRejectsAccount('acct_2')).toBe(true);
    expect(await desktopPairingRejectsAccount('acct_1')).toBe(false);
  });
});

describe('releaseStoredDesktopPairing', () => {
  it('clears the stored pairing and the connected-to-desktop flag', async () => {
    seedPairing('acct', 'to12');
    chromeMock.runtime.sendMessage.mockResolvedValue({
      success: true,
      owner: { accountId: 'acct', authIncarnation: 'sess_1' },
    });
    await loadPairingState();

    await releaseStoredDesktopPairing();

    expect(getPairingState().phase).toBe('idle');
    expect(localStore['connectedToDesktop']).toBeUndefined();
    expect(localStore['agi_paired_desktop']).toBeUndefined();
  });
});

describe('requestPairing, authorizes with the operator-supplied bridge secret', () => {
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
    expect(storedPairing()).toMatchObject({
      token: DESKTOP_PAIR_TOKEN,
      fingerprint: DESKTOP_PAIR_TOKEN.slice(0, 8),
    });
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

describe('requestPairing, failure paths', () => {
  it('fails before any network call when no bridge token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pairResponse());
    vi.stubGlobal('fetch', fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/copy the bridge token from desktop/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStore['agi_paired_desktop']).toBeUndefined();
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
    expect(isValidPairingCode('ABCD')).toBe(false);
    expect(isValidPairingCode('ABCDI345')).toBe(false);
  });

  // Desktop mints exactly eight characters (PAIR_CODE_LEN in
  // integrations/realtime/websocket_server.rs). Accepting six to twelve let a
  // code that cannot exist reach the bridge before it was refused.
  it('accepts only the length Desktop mints', () => {
    expect(isValidPairingCode('ABCD2345')).toBe(true);
    expect(isValidPairingCode('ABCD234')).toBe(false);
    expect(isValidPairingCode('ABCD23456')).toBe(false);
  });
});

describe('startPairing, asks Desktop to display a code', () => {
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

    expect(localStore['agi_paired_desktop']).toBeUndefined();
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

describe('submitPairingCode, the code the user read off Desktop', () => {
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
    expect(storedPairing().token).toBe(DESKTOP_PAIR_TOKEN);
    expect(sessionStore['agi_pair_request']).toBeUndefined();
  });

  it('stays paired after a browser restart clears session storage', async () => {
    await startAwaitingCode();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse()));
    expect((await submitPairingCode('abcd-2345')).phase).toBe('paired');
    localStore['connectedToDesktop'] = true;

    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    _resetStateForTesting();
    const restarted = await loadPairingState();

    expect(restarted.phase).toBe('paired');
    expect(restarted.fingerprint).toBe(DESKTOP_PAIR_TOKEN.slice(0, 8));
    expect(storedPairing().token).toBe(DESKTOP_PAIR_TOKEN);
  });

  it('forgets the restart record on unpair', async () => {
    await startAwaitingCode();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse()));
    await submitPairingCode('abcd-2345');
    localStore['connectedToDesktop'] = true;

    await unpair();
    expect(localStore['agi_paired_desktop']).toBeUndefined();
    _resetStateForTesting();
    expect((await loadPairingState()).phase).toBe('idle');
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
    expect(localStore['agi_paired_desktop']).toBeUndefined();
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
    expect(localStore['agi_paired_desktop']).toBeUndefined();
  });
});

describe('beginPairing, one button, both paths', () => {
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

describe('storeBridgeSecret, the operator credential keeps its own key', () => {
  it('writes the secret without claiming the extension is paired', async () => {
    const state = await storeBridgeSecret(BRIDGE_SECRET);

    expect(state.phase).toBe('idle');
    expect(sessionStore['agi_bridge_secret']).toBe(BRIDGE_SECRET);
    expect(localStore['agi_paired_desktop']).toBeUndefined();
  });

  it('does not overwrite a desktop-issued pair token', async () => {
    seedBridgeSecret();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pairResponse()));
    await requestPairing();

    await storeBridgeSecret(`rotated${'0123456789abcdef'.repeat(4)}`.slice(0, 64));

    expect(storedPairing().token).toBe(DESKTOP_PAIR_TOKEN);
    expect(sessionStore['agi_bridge_secret']).not.toBe(DESKTOP_PAIR_TOKEN);
  });

  it('rejects a malformed secret', async () => {
    const state = await storeBridgeSecret('short');
    expect(state.phase).toBe('error');
    expect(sessionStore['agi_bridge_secret']).toBeUndefined();
  });
});

describe('loadPairingState, resumes an open handshake', () => {
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
