/**
 * DES-C20 — a transient `/api/me` failure must not leave Cloud mode with zero
 * models and a permanent "Loading…" plan.
 *
 * `refreshUserData` deliberately KEEPS the session connected when the account
 * snapshot fails for a non-authorization reason (network, 429, cold start), so
 * the orchestrator still runs with `subscriptionFetchStatus: 'failed'`. It used
 * to leave `plan = null` in that case, which is not a neutral "unknown":
 *
 *   - `desktopCloudEntitlements` returns [] for a null plan, so `App.tsx`
 *     emptied the chat model store and Cloud chat had nothing selectable, and
 *   - `planDisplayName` stayed on the 'Loading…' sentinel forever in the
 *     sidebar footer and the account menu.
 *
 * Degradation is now ordered and recoverable: 24 h cache -> the tier this
 * session already confirmed with a succeeded fetch -> 'free'. Nothing here can
 * raise a tier the server never confirmed.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: false,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

vi.mock('../../lib/tauri-mock', () => ({
  isTauri: false,
  invoke: vi.fn(),
  isTauriContext: vi.fn(() => false),
}));

const { authStateListeners } = vi.hoisted(() => ({
  authStateListeners: [] as Array<(state: unknown) => void>,
}));

vi.mock('../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    onAuthStateChange: (listener: (state: unknown) => void) => {
      authStateListeners.push(listener);
      return () => {
        const index = authStateListeners.indexOf(listener);
        if (index >= 0) authStateListeners.splice(index, 1);
      };
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshUserData: vi.fn(),
    isAuthenticated: () => false,
  },
}));

vi.mock('../../api/accountApi', () => ({
  accountApi: {
    // The credits call is irrelevant to tier resolution; keep it inert so the
    // orchestrator's STEP 3 cannot mask the assertion.
    fetchUserProfile: vi.fn().mockResolvedValue({ credits: null }),
  },
}));

import { initializeAuthOrchestrator, resetAuthOrchestrator } from '../authOrchestrator';
import { useUnifiedAuthStore } from '../auth';

interface FakeAuthState {
  user: { id: string; email: string; created_at: string } | null;
  session: { access_token: string; refresh_token: string | null } | null;
  profile: { display_name: string } | null;
  subscription: { plan_tier: string; status: string } | null;
  featureFlags: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  subscriptionFetchStatus: 'idle' | 'fetching' | 'succeeded' | 'failed';
}

function authState(overrides: Partial<FakeAuthState> = {}): FakeAuthState {
  return {
    user: { id: 'user_demo', email: '', created_at: new Date().toISOString() },
    session: { access_token: 'device-bearer', refresh_token: null },
    profile: { display_name: 'demo' },
    subscription: null,
    featureFlags: {},
    isLoading: false,
    error: null,
    subscriptionFetchStatus: 'succeeded',
    ...overrides,
  };
}

/**
 * Push an auth state through the orchestrator and wait until it has finished.
 *
 * STEP 1 awaits `hashUserId` (a real WebCrypto digest) and STEP 3 awaits the
 * credits fetch before the account snapshot in STEP 4 lands, so a fixed number
 * of microtask turns is not a reliable settle point under load. Poll for the
 * observable result instead and fail loudly if it never arrives.
 */
async function emitUntil(state: FakeAuthState, settled: () => boolean): Promise<void> {
  for (const listener of [...authStateListeners]) listener(state);

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (settled()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The auth orchestrator never finished processing the auth state change.');
}

function planIs(expected: string): () => boolean {
  return () => useUnifiedAuthStore.getState().plan === expected;
}

let disposeOrchestrator: (() => void) | null = null;

describe('DES-C20: a failed /api/me never strands Cloud on a null plan', () => {
  beforeEach(() => {
    localStorage.clear();
    authStateListeners.length = 0;
    resetAuthOrchestrator();
    useUnifiedAuthStore.getState().reset();
    disposeOrchestrator = initializeAuthOrchestrator();
  });

  afterEach(() => {
    disposeOrchestrator?.();
    disposeOrchestrator = null;
    resetAuthOrchestrator();
    localStorage.clear();
  });

  it('falls back to the lowest tier when the fetch fails with nothing cached', async () => {
    await emitUntil(
      authState({ subscription: null, subscriptionFetchStatus: 'failed' }),
      planIs('free'),
    );

    const state = useUnifiedAuthStore.getState();
    expect(state.plan).toBe('free');
    expect(state.planDisplayName).not.toBe('Loading...');
    expect(state.subscriptionFetchStatus).toBe('failed');
    // The session itself stays connected — this is a degraded refresh, not a
    // sign-out.
    expect(state.accessToken).toBe('device-bearer');
  });

  it('retains a tier this session already confirmed instead of downgrading it', async () => {
    await emitUntil(
      authState({
        subscription: { plan_tier: 'max_15x', status: 'active' },
        subscriptionFetchStatus: 'succeeded',
      }),
      planIs('max_15x'),
    );
    expect(useUnifiedAuthStore.getState().subscriptionFetchStatus).toBe('succeeded');

    // The 24 h cache is the first fallback; drop it so the "last known
    // succeeded tier" path is the one under test.
    localStorage.clear();

    await emitUntil(
      authState({ subscription: null, subscriptionFetchStatus: 'failed' }),
      () => useUnifiedAuthStore.getState().subscriptionFetchStatus === 'failed',
    );

    const state = useUnifiedAuthStore.getState();
    expect(state.plan).toBe('max_15x');
    expect(state.planDisplayName).not.toBe('Loading...');
  });

  it('never leaves the plan display on the Loading… sentinel after a failure', () => {
    // Direct-store guard for the window before the orchestrator's STEP 4 runs:
    // setAccount keeps the previous (null) plan when `updates.plan` is absent.
    useUnifiedAuthStore.getState().setAccount({
      id: 'user_demo',
      accessToken: 'device-bearer',
      subscriptionFetchStatus: 'failed',
    });

    const state = useUnifiedAuthStore.getState();
    expect(state.plan).toBeNull();
    expect(state.planDisplayName).not.toBe('Loading...');
    expect(state.account.planDisplayName).not.toBe('Loading...');
  });

  it('still reports a genuinely free account as free on a successful fetch', async () => {
    await emitUntil(
      authState({ subscription: null, subscriptionFetchStatus: 'succeeded' }),
      planIs('free'),
    );

    const state = useUnifiedAuthStore.getState();
    expect(state.plan).toBe('free');
    expect(state.subscriptionFetchStatus).toBe('succeeded');
  });
});
