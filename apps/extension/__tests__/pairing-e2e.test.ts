
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPairingState,
  loadPairingState,
  requestPairing,
  unpair,
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
    id: 'test-ext-id',
    lastError: null as null | { message: string },
  },
  storage: {
    session: makeStorageArea(sessionStore),
    local: makeStorageArea(localStore),
  },
};

function makeDesktopPairResponder() {
  let callCount = 0;
  let lastIssuedToken: string | null = null;
  let lastIssuedFingerprint: string | null = null;

  const respond = vi.fn(async (url: string, init?: RequestInit) => {
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
    if (body.extensionId && headers['X-Bridge-Token'] !== lastIssuedToken) {
      return {
        ok: false,
        status: 401,
        text: async () => 'Unauthorized manifest install',
        json: async () => ({}),
      };
    }

    callCount++;
    const seed = `desktop-token-${callCount.toString().padStart(2, '0')}-${'x'.repeat(40)}`;
    const token = seed.slice(0, 64).padEnd(64, '0');
    const fingerprint = token.slice(0, 8);
    lastIssuedToken = token;
    lastIssuedFingerprint = fingerprint;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        token,
        fingerprint,
        nativeHostManifestInstalled: Boolean(body.extensionId),
      }),
      text: async () => '',
    };
  });

  return {
    fetchMock: respond,
    get callCount() {
      return callCount;
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

describe('e2e pairing flow — IDLE → REQUESTING → PAIRED', () => {
  it('walks the full state machine: idle → requesting → paired', async () => {
    const desktop = makeDesktopPairResponder();
    let releaseFetch: (() => void) | null = null;
    const gated = new Promise<void>((r) => (releaseFetch = r));
    const gatedFetch = vi.fn(async (url: string, init?: RequestInit) => {
      await gated;
      return desktop.fetchMock(url, init);
    });
    vi.stubGlobal('fetch', gatedFetch);

    expect(getPairingState().phase).toBe('idle');

    const inFlight = requestPairing();

    await Promise.resolve();
    expect(getPairingState().phase).toBe('requesting');
    expect(getPairingState().fingerprint).toBeNull();

    releaseFetch!();
    const finalState = await inFlight;

    expect(finalState.phase).toBe('paired');
    expect(finalState.error).toBeNull();
  });

  it('stores the desktop-issued token in chrome.storage.session', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(desktop.lastIssuedToken).not.toBeNull();
    expect(sessionStore['agi_bridge_token']).toBe(desktop.lastIssuedToken);
  });
});

describe('e2e pairing flow — fingerprint match across the joint', () => {
  it('stored fingerprint equals the value the desktop returned (no truncation)', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    const state = await requestPairing();

    expect(state.phase).toBe('paired');
    expect(state.fingerprint).toBe(desktop.lastIssuedFingerprint);
    expect(sessionStore['agi_pairing_fingerprint']).toBe(desktop.lastIssuedFingerprint);
    expect(state.fingerprint).toHaveLength(8);
  });

  it('survives a load-after-pair round trip: reloaded fingerprint matches', async () => {
    const desktop = makeDesktopPairResponder();
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
    let releaseFetch: (() => void) | null = null;
    const gated = new Promise<void>((r) => (releaseFetch = r));
    const gatedFetch = vi.fn(async (url: string, init?: RequestInit) => {
      await gated;
      return desktop.fetchMock(url, init);
    });
    vi.stubGlobal('fetch', gatedFetch);

    const first = requestPairing();
    await Promise.resolve();
    expect(getPairingState().phase).toBe('requesting');
    const second = requestPairing();

    expect((await second).phase).toBe('requesting');
    expect(gatedFetch).toHaveBeenCalledTimes(1);

    releaseFetch!();
    expect((await first).phase).toBe('paired');
    expect(desktop.callCount).toBe(2);
  });

  it('returns PAIRED short-circuit when already paired (no second fetch)', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await requestPairing();
    expect(getPairingState().phase).toBe('paired');
    const firstCount = desktop.callCount;

    const again = await requestPairing();
    expect(again.phase).toBe('paired');
    expect(desktop.callCount).toBe(firstCount);
  });

  it('after unpair, a fresh requestPairing rotates the token (desktop counter increments)', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await requestPairing();
    const firstToken = sessionStore['agi_bridge_token'] as string;
    expect(firstToken).toBe(desktop.lastIssuedToken);
    expect(desktop.callCount).toBe(2);

    await unpair();
    expect(getPairingState().phase).toBe('idle');

    await requestPairing();
    const secondToken = sessionStore['agi_bridge_token'] as string;

    expect(desktop.callCount).toBe(4);
    expect(secondToken).not.toBe(firstToken);
    expect(secondToken).toBe(desktop.lastIssuedToken);
  });
});
