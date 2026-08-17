import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPairingState,
  loadPairingState,
  requestPairing,
  startPairing,
  submitPairingCode,
  unpair,
  _resetStateForTesting,
} from '../src/features/native-bridge/pairing';

type StorageCallback = (items: Record<string, unknown>) => void;
type RemoveCallback = () => void;
type SetCallback = () => void;

const sessionStore: Record<string, unknown> = {};
const localStore: Record<string, unknown> = {};

const BRIDGE_SECRET = `ipc${'0123456789abcdef'.repeat(4)}`.slice(0, 64);

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
    id: 'test-ext-id',
    lastError: null as null | { message: string },
  },
  storage: {
    session: makeStorageArea(sessionStore),
    local: makeStorageArea(localStore),
  },
};

function seedBridgeSecret(token: string = BRIDGE_SECRET): void {
  sessionStore['agi_bridge_secret'] = token;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface PairAttempt {
  extensionId: string | null;
  presentedToken: string | null;
  authorized: boolean;
}

function makeDesktopPairResponder(bridgeSecret: string = BRIDGE_SECRET) {
  const mintedTokens: string[] = [];
  const attempts: PairAttempt[] = [];
  let lastIssuedToken: string | null = null;
  let lastIssuedFingerprint: string | null = null;

  function mintToken(): string {
    const serial = (mintedTokens.length + 1).toString().padStart(2, '0');
    const token = `desktop${serial}${'0123456789abcdef'.repeat(4)}`.slice(0, 64);
    mintedTokens.push(token);
    lastIssuedToken = token;
    lastIssuedFingerprint = token.slice(0, 8);
    return token;
  }

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.endsWith('/pair') || init?.method !== 'POST') {
      return {
        ok: false,
        status: 404,
        text: async () => `not found: ${url}`,
        json: async () => ({}),
      };
    }

    const body = JSON.parse(String(init.body ?? '{}')) as { extensionId?: string };
    const headers = (init.headers ?? {}) as Record<string, string>;
    const presentedToken = headers['X-Bridge-Token'] ?? null;
    const extensionId = body.extensionId ?? null;

    if (extensionId) {
      const authorized = presentedToken === bridgeSecret;
      attempts.push({ extensionId, presentedToken, authorized });
      if (!authorized) {
        return {
          ok: false,
          status: 401,
          text: async () => 'Unauthorized manifest install',
          json: async () => ({}),
        };
      }
    } else {
      attempts.push({ extensionId: null, presentedToken, authorized: true });
    }

    const token = mintToken();
    return {
      ok: true,
      status: 200,
      json: async () => ({
        token,
        fingerprint: token.slice(0, 8),
        nativeHostManifestInstalled: Boolean(extensionId),
      }),
      text: async () => '',
    };
  });

  return {
    fetchMock,
    mintedTokens,
    attempts,
    get callCount() {
      return attempts.length;
    },
    get installAttempts() {
      return attempts.filter((a) => a.extensionId !== null);
    },
    get authorizedInstalls() {
      return attempts.filter((a) => a.extensionId !== null && a.authorized);
    },
    get rejectedInstalls() {
      return attempts.filter((a) => a.extensionId !== null && !a.authorized);
    },
    get lastIssuedToken() {
      return lastIssuedToken;
    },
    get lastIssuedFingerprint() {
      return lastIssuedFingerprint;
    },
  };
}

beforeEach(() => {
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
  for (const k of Object.keys(localStore)) delete localStore[k];
  chromeMock.runtime.lastError = null;
  _resetStateForTesting();
  vi.stubGlobal('chrome', chromeMock);
  vi.stubGlobal('AbortSignal', { timeout: (_ms: number) => ({ signal: 'mock' }) });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('e2e pairing — SEC-11: only the desktop bridge secret authorizes a manifest install', () => {
  it('the manifest install is authorized by the operator secret, never by a token the desktop minted', async () => {
    const desktop = makeDesktopPairResponder();
    seedBridgeSecret();
    vi.stubGlobal('fetch', desktop.fetchMock);

    const state = await requestPairing();

    expect(desktop.installAttempts).toHaveLength(1);

    const install = desktop.installAttempts[0];
    expect(desktop.mintedTokens).not.toContain(install.presentedToken);
    expect(install.presentedToken).toBe(BRIDGE_SECRET);
    expect(desktop.rejectedInstalls).toHaveLength(0);
    expect(desktop.callCount).toBe(1);
    expect(state.phase).toBe('paired');
  });

  it('rejects a manifest install presenting a token the desktop itself minted', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    const bootstrap = (await desktop.fetchMock('http://localhost:8787/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })) as { ok: boolean; json: () => Promise<{ token: string }> };
    const selfIssued = (await bootstrap.json()).token;
    expect(desktop.mintedTokens).toContain(selfIssued);

    seedBridgeSecret(selfIssued);
    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toContain('401');
    expect(state.error).toMatch(/unauthorized manifest install/i);
    expect(desktop.authorizedInstalls).toHaveLength(0);
    expect(desktop.rejectedInstalls).toHaveLength(1);
    expect(sessionStore['agi_bridge_secret']).toBe(selfIssued);
    expect(sessionStore['agi_pairing_fingerprint']).toBeUndefined();
  });

  it('refuses to contact the desktop at all when no bridge secret is stored', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/copy the bridge token from desktop/i);
    expect(desktop.fetchMock).not.toHaveBeenCalled();
    expect(desktop.callCount).toBe(0);
    expect(desktop.mintedTokens).toHaveLength(0);
  });
});

describe('e2e pairing flow — IDLE → REQUESTING → PAIRED', () => {
  it('walks the full state machine with a pre-seeded bridge secret', async () => {
    const desktop = makeDesktopPairResponder();
    seedBridgeSecret();
    let releaseFetch: (() => void) | null = null;
    const gated = new Promise<void>((r) => (releaseFetch = r));
    const gatedFetch = vi.fn(async (url: string, init?: RequestInit) => {
      await gated;
      return desktop.fetchMock(url, init);
    });
    vi.stubGlobal('fetch', gatedFetch);

    expect(getPairingState().phase).toBe('idle');

    const inFlight = requestPairing();

    await flush();
    expect(getPairingState().phase).toBe('requesting');
    expect(getPairingState().fingerprint).toBeNull();

    releaseFetch!();
    const finalState = await inFlight;

    expect(finalState.phase).toBe('paired');
    expect(finalState.error).toBeNull();
  });

  it('stores the desktop-issued token in chrome.storage.session', async () => {
    const desktop = makeDesktopPairResponder();
    seedBridgeSecret();
    vi.stubGlobal('fetch', desktop.fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(desktop.lastIssuedToken).not.toBeNull();
    expect(sessionStore['agi_pair_token']).toBe(desktop.lastIssuedToken);
    expect(sessionStore['agi_pair_token']).not.toBe(BRIDGE_SECRET);
  });
});

describe('e2e pairing flow — fingerprint match across the joint', () => {
  it('stored fingerprint equals the value the desktop returned (no truncation)', async () => {
    const desktop = makeDesktopPairResponder();
    seedBridgeSecret();
    vi.stubGlobal('fetch', desktop.fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe(desktop.lastIssuedFingerprint);
    expect(sessionStore['agi_pairing_fingerprint']).toBe(desktop.lastIssuedFingerprint);
    expect(state.fingerprint).toHaveLength(8);
  });

  it('survives a load-after-pair round trip: reloaded fingerprint matches', async () => {
    const desktop = makeDesktopPairResponder();
    seedBridgeSecret();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await requestPairing();
    const issuedFp = desktop.lastIssuedFingerprint;

    _resetStateForTesting();
    const reloaded = await loadPairingState();

    expect(reloaded.phase).toBe('paired');
    expect(reloaded.fingerprint).toBe(issuedFp);
  });
});

describe('e2e pairing flow — idempotent re-requests', () => {
  it('does not double-fire fetch while a request is in flight', async () => {
    const desktop = makeDesktopPairResponder();
    seedBridgeSecret();
    let releaseFetch: (() => void) | null = null;
    const gated = new Promise<void>((r) => (releaseFetch = r));
    const gatedFetch = vi.fn(async (url: string, init?: RequestInit) => {
      await gated;
      return desktop.fetchMock(url, init);
    });
    vi.stubGlobal('fetch', gatedFetch);

    const first = requestPairing();
    await flush();
    expect(getPairingState().phase).toBe('requesting');
    const second = requestPairing();

    expect((await second).phase).toBe('requesting');
    expect(gatedFetch).toHaveBeenCalledTimes(1);

    releaseFetch!();
    expect((await first).phase).toBe('paired');
    expect(desktop.callCount).toBe(1);
  });

  it('returns PAIRED short-circuit when already paired (no second fetch)', async () => {
    const desktop = makeDesktopPairResponder();
    seedBridgeSecret();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await requestPairing();
    expect(getPairingState().phase).toBe('paired');
    const firstCount = desktop.callCount;

    const again = await requestPairing();
    expect(again.phase).toBe('paired');
    expect(desktop.callCount).toBe(firstCount);
  });

  it('after unpair, re-seeding the bridge secret rotates the desktop-issued token', async () => {
    const desktop = makeDesktopPairResponder();
    seedBridgeSecret();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await requestPairing();
    const firstToken = sessionStore['agi_pair_token'] as string;
    expect(firstToken).toBe(desktop.lastIssuedToken);
    expect(desktop.callCount).toBe(1);

    await unpair();
    expect(getPairingState().phase).toBe('idle');
    expect(sessionStore['agi_pair_token']).toBeUndefined();

    seedBridgeSecret();
    await requestPairing();
    const secondToken = sessionStore['agi_pair_token'] as string;

    expect(desktop.callCount).toBe(2);
    expect(desktop.installAttempts.every((a) => a.presentedToken === BRIDGE_SECRET)).toBe(true);
    expect(secondToken).not.toBe(firstToken);
    expect(secondToken).toBe(desktop.lastIssuedToken);
  });
});

interface DisplayedPrompt {
  requestId: string;
  extensionId: string;
  code: string;
}

// A desktop that parks a code and shows it on its own screen. `screen` is the
// Tauri-IPC side; `wire` is every byte the extension received over HTTP.
function makeDesktopHandshakeResponder() {
  const screen: DisplayedPrompt[] = [];
  const wire: string[] = [];
  const installs: string[] = [];
  const mintedTokens: string[] = [];

  function mintToken(): string {
    const serial = (mintedTokens.length + 1).toString().padStart(2, '0');
    const token = `handshake${serial}${'0123456789abcdef'.repeat(4)}`.slice(0, 64);
    mintedTokens.push(token);
    return token;
  }

  function reply(status: number, payload: Record<string, unknown> | string) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    wire.push(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (typeof payload === 'string' ? {} : payload),
      text: async () => body,
    };
  }

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;

    if (url.endsWith('/pair/request')) {
      const requestId = `a1b2c3d4e5f6070${screen.length}`;
      const code = `ZXCV${2345 + screen.length}`;
      screen.push({ requestId, code, extensionId: body.extensionId });
      return reply(200, { requestId, expiresInMs: 120000, codeLength: code.length });
    }

    if (url.endsWith('/pair/confirm')) {
      const index = screen.findIndex((p) => p.requestId === body.requestId);
      if (index < 0) return reply(401, 'Unknown or expired pairing request');
      const prompt = screen[index];
      if ((body.code ?? '').toUpperCase() !== prompt.code) {
        return reply(401, 'Pairing code did not match');
      }
      screen.splice(index, 1);
      installs.push(prompt.extensionId);
      const token = mintToken();
      return reply(200, {
        token,
        fingerprint: token.slice(0, 8),
        nativeHostManifestInstalled: true,
      });
    }

    return reply(404, `not found: ${url}`);
  });

  return { fetchMock, screen, wire, installs, mintedTokens };
}

describe('e2e handshake — the code travels Desktop → human → extension', () => {
  it('pairs once the user types the code Desktop displayed', async () => {
    const desktop = makeDesktopHandshakeResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    const requested = await startPairing();
    expect(requested.phase).toBe('awaiting-code');
    expect(desktop.installs).toHaveLength(0);

    const displayed = desktop.screen[0];
    expect(displayed.extensionId).toBe('test-ext-id');

    const paired = await submitPairingCode(
      `${displayed.code.slice(0, 4)}-${displayed.code.slice(4)}`,
    );

    expect(paired.phase).toBe('paired');
    expect(desktop.installs).toEqual(['test-ext-id']);
    expect(sessionStore['agi_pair_token']).toBe(desktop.mintedTokens[0]);
    expect(sessionStore['agi_pair_request']).toBeUndefined();
  });

  it('never puts the code on the HTTP channel', async () => {
    const desktop = makeDesktopHandshakeResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await startPairing();
    const displayed = desktop.screen[0];

    expect(desktop.wire.join('|')).not.toContain(displayed.code);
    expect(JSON.stringify(sessionStore)).not.toContain(displayed.code);
    expect(getPairingState().requestId).toBe(displayed.requestId);
  });

  it('locks out a caller that has the HTTP response but not the screen', async () => {
    const desktop = makeDesktopHandshakeResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await startPairing();
    const displayed = desktop.screen[0];

    const harvested = desktop.wire
      .flatMap((body) => {
        try {
          return Object.values(JSON.parse(body) as Record<string, unknown>);
        } catch {
          return [];
        }
      })
      .filter((value): value is string => typeof value === 'string');
    const guesses = [...harvested, 'ZZZZ9999', 'ABCD2345'];

    for (const guess of guesses) {
      const attacker = (await desktop.fetchMock('http://localhost:8787/pair/confirm', {
        method: 'POST',
        body: JSON.stringify({ requestId: displayed.requestId, code: guess }),
      })) as { ok: boolean; status: number };
      expect(attacker.ok).toBe(false);
      expect(attacker.status).toBe(401);
    }

    expect(desktop.installs).toHaveLength(0);
    expect(desktop.mintedTokens).toHaveLength(0);
    expect(sessionStore['agi_pair_token']).toBeUndefined();

    const paired = await submitPairingCode(displayed.code);
    expect(paired.phase).toBe('paired');
  });

  it('will not replay a code that already paired', async () => {
    const desktop = makeDesktopHandshakeResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await startPairing();
    const displayed = desktop.screen[0];
    await submitPairingCode(displayed.code);

    const replay = (await desktop.fetchMock('http://localhost:8787/pair/confirm', {
      method: 'POST',
      body: JSON.stringify({ requestId: displayed.requestId, code: displayed.code }),
    })) as { status: number };

    expect(replay.status).toBe(401);
    expect(desktop.installs).toEqual(['test-ext-id']);
  });

  it('keeps the operator X-Bridge-Token path available alongside the handshake', async () => {
    const legacy = makeDesktopPairResponder();
    seedBridgeSecret();
    vi.stubGlobal('fetch', legacy.fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(legacy.authorizedInstalls).toHaveLength(1);
    expect(sessionStore['agi_bridge_secret']).toBe(BRIDGE_SECRET);
    expect(sessionStore['agi_pair_token']).toBe(legacy.lastIssuedToken);
  });
});
