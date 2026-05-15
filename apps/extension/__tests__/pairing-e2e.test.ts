/**
 * Cross-surface contract test: chrome ext pairing flow against the desktop
 * bridge POST /pair endpoint at 127.0.0.1:8787.
 *
 * Pins the joint between `apps/extension/src/pairing.ts` (the IDLE→REQUESTING
 * →PAIRED state machine) and `apps/desktop/.../websocket_server.rs`
 * `handle_http_pair` (the E2 desktop responder, closed at desktop commit
 * 948ceeb7f) by simulating the desktop responder in jsdom.
 *
 * Distinct from `pairing.test.ts` (which unit-tests each function in
 * isolation): this file walks the state machine end-to-end and asserts the
 * three integration invariants that the contract depends on:
 *
 *   1. State transitions  : idle → requesting (observable mid-flight) → paired
 *   2. Fingerprint match  : the value the ext stores equals the value the
 *                            desktop returns (no truncation, no derivation
 *                            divergence vs `requestPairing` fallback)
 *   3. Idempotent re-pair : repeated POST /pair calls do NOT double-fire from
 *                            the ext side (state guards), and on the desktop
 *                            side the call ROTATES the token (verified by the
 *                            fact that the ext picks up the new token + fp).
 *
 * The desktop responder is mocked via fetch so this test ships in the
 * extension's vitest suite and runs without spawning a Tauri sidecar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPairingState,
  loadPairingState,
  requestPairing,
  unpair,
  _resetStateForTesting,
} from '../src/pairing';

// ── Chrome storage shim (matches pairing.test.ts) ─────────────────────────────

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

// ── Desktop /pair responder simulation ────────────────────────────────────────

/**
 * Mimics `handle_http_pair` in websocket_server.rs: every POST /pair returns a
 * fresh 64-hex-char token and an 8-char fingerprint (the first 8 chars of the
 * token). Call counter is exposed so tests can assert idempotent re-requests.
 */
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
    callCount++;
    // Deterministic 32-byte token so tests can pin equality across the joint
    const seed = `desktop-token-${callCount.toString().padStart(2, '0')}-${'x'.repeat(40)}`;
    const token = seed.slice(0, 64).padEnd(64, '0');
    const fingerprint = token.slice(0, 8);
    lastIssuedToken = token;
    lastIssuedFingerprint = fingerprint;
    return {
      ok: true,
      status: 200,
      json: async () => ({ token, fingerprint }),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('e2e pairing flow — IDLE → REQUESTING → PAIRED', () => {
  it('walks the full state machine: idle → requesting → paired', async () => {
    const desktop = makeDesktopPairResponder();
    // Wrap fetchMock with a deferred resolver so we can observe REQUESTING.
    let releaseFetch: (() => void) | null = null;
    const gated = new Promise<void>((r) => (releaseFetch = r));
    const gatedFetch = vi.fn(async (url: string, init?: RequestInit) => {
      await gated;
      return desktop.fetchMock(url, init);
    });
    vi.stubGlobal('fetch', gatedFetch);

    // Initial state: idle
    expect(getPairingState().phase).toBe('idle');

    // Kick off pairing (do NOT await)
    const inFlight = requestPairing();

    // Mid-flight observation: REQUESTING (the state was set synchronously
    // before the first await in requestPairing)
    await Promise.resolve();
    expect(getPairingState().phase).toBe('requesting');
    expect(getPairingState().fingerprint).toBeNull();

    // Release the desktop responder
    releaseFetch!();
    const finalState = await inFlight;

    // Terminal state: PAIRED
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
    // Contract: ext does NOT mutate the fingerprint when desktop provides one.
    expect(state.fingerprint).toBe(desktop.lastIssuedFingerprint);
    expect(sessionStore['agi_pairing_fingerprint']).toBe(desktop.lastIssuedFingerprint);
    // Desktop responder issues 8-char fingerprints (first 8 hex chars of the
    // 64-char token). Confirm we didn't fall through to the `token.slice(0,4)`
    // fallback path in pairing.ts:133.
    expect(state.fingerprint).toHaveLength(8);
  });

  it('survives a load-after-pair round trip: reloaded fingerprint matches', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await requestPairing();
    const issuedFp = desktop.lastIssuedFingerprint;

    // Simulate ext popup reopen: in-memory state cleared, storage persists
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

    // Fire two concurrent requestPairing calls without awaiting either
    const first = requestPairing();
    await Promise.resolve();
    expect(getPairingState().phase).toBe('requesting');
    const second = requestPairing();

    // Second call must return immediately with REQUESTING (no second fetch)
    expect((await second).phase).toBe('requesting');
    expect(gatedFetch).toHaveBeenCalledTimes(1);

    // Release and complete the first
    releaseFetch!();
    expect((await first).phase).toBe('paired');
    expect(desktop.callCount).toBe(1);
  });

  it('returns PAIRED short-circuit when already paired (no second fetch)', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    await requestPairing();
    expect(getPairingState().phase).toBe('paired');
    const firstCount = desktop.callCount;

    // A second requestPairing while already paired returns the existing state
    const again = await requestPairing();
    expect(again.phase).toBe('paired');
    // Idempotent re-request counter: no additional desktop POST issued
    expect(desktop.callCount).toBe(firstCount);
  });

  it('after unpair, a fresh requestPairing rotates the token (desktop counter increments)', async () => {
    const desktop = makeDesktopPairResponder();
    vi.stubGlobal('fetch', desktop.fetchMock);

    // First pairing
    await requestPairing();
    const firstToken = sessionStore['agi_bridge_token'] as string;
    expect(firstToken).toBe(desktop.lastIssuedToken);
    expect(desktop.callCount).toBe(1);

    // Unpair and re-pair
    await unpair();
    expect(getPairingState().phase).toBe('idle');

    await requestPairing();
    const secondToken = sessionStore['agi_bridge_token'] as string;

    // Desktop ROTATES the token on each /pair (matches handle_http_pair).
    expect(desktop.callCount).toBe(2);
    expect(secondToken).not.toBe(firstToken);
    expect(secondToken).toBe(desktop.lastIssuedToken);
  });
});
