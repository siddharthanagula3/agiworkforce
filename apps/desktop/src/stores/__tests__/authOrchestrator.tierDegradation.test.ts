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
