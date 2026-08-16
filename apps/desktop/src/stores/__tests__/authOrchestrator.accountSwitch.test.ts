import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const mocks = vi.hoisted(() => ({
  authStateListeners: [] as Array<(state: FakeAuthState) => void>,
  fetchUserProfile: vi.fn(),
}));

vi.mock('../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    onAuthStateChange: (listener: (state: FakeAuthState) => void) => {
      mocks.authStateListeners.push(listener);
      return () => {
        const index = mocks.authStateListeners.indexOf(listener);
        if (index >= 0) mocks.authStateListeners.splice(index, 1);
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
    fetchUserProfile: mocks.fetchUserProfile,
  },
}));

import { initializeAuthOrchestrator, resetAuthOrchestrator } from '../authOrchestrator';
import { useUnifiedAuthStore } from '../auth';

interface FakeAuthState {
  user: {
    id: string;
    email: string;
    created_at: string;
    user_metadata?: Record<string, unknown>;
  } | null;
  session: { access_token: string; refresh_token: string | null } | null;
  profile: { display_name: string; avatar_url?: string | null } | null;
  subscription: {
    plan_tier: string;
    status: string;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_price_id?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    subscription_source?: 'none' | 'stripe' | 'apple' | 'google' | 'manual' | 'unknown';
    canceled_at?: string | null;
    created_at?: string;
    updated_at?: string;
  } | null;
  featureFlags: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  subscriptionFetchStatus: 'idle' | 'fetching' | 'succeeded' | 'failed';
}

function authState(
  userId: string,
  accessToken: string,
  overrides: Partial<FakeAuthState> = {},
): FakeAuthState {
  return {
    user: {
      id: userId,
      email: `${userId}@example.test`,
      created_at: '2026-08-02T00:00:00.000Z',
    },
    session: { access_token: accessToken, refresh_token: `${accessToken}-refresh` },
    profile: { display_name: userId },
    subscription: null,
    featureFlags: {},
    isLoading: false,
    error: null,
    subscriptionFetchStatus: 'succeeded',
    ...overrides,
  };
}

function emit(state: FakeAuthState): void {
  for (const listener of [...mocks.authStateListeners]) listener(state);
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the auth orchestrator.');
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((settle) => {
      resolve = settle;
    }),
    resolve,
  };
}

const accountASubscription = {
  plan_tier: 'max_15x',
  status: 'active',
  stripe_customer_id: 'cus_account_a',
  stripe_subscription_id: 'sub_account_a',
  stripe_price_id: 'price_account_a',
  current_period_start: '2026-08-01T00:00:00.000Z',
  current_period_end: '2026-09-01T00:00:00.000Z',
  cancel_at_period_end: false,
  subscription_source: 'stripe' as const,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

let disposeOrchestrator: (() => void) | null = null;

async function loadAccountA(): Promise<void> {
  mocks.fetchUserProfile.mockResolvedValueOnce({
    credits: {
      remaining_cents: 9_900,
      daily_used_cents: 100,
      daily_limit_cents: 10_000,
    },
  });
  emit(
    authState('account-a', 'token-a', {
      subscription: accountASubscription,
      featureFlags: { code_execution: true, generic_web_search: true },
    }),
  );
  await waitFor(() => {
    const state = useUnifiedAuthStore.getState();
    return state.plan === 'max_15x' && state.credits?.remaining_cents === 9_900;
  });
}

describe('Managed Cloud auth account transitions', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.authStateListeners.length = 0;
    mocks.fetchUserProfile.mockReset();
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

  it('preserves billing owner, period, and scheduled cancellation in the unified store', async () => {
    mocks.fetchUserProfile.mockResolvedValueOnce({ credits: null });
    emit(
      authState('account-apple', 'token-apple', {
        subscription: {
          ...accountASubscription,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_source: 'apple',
          cancel_at_period_end: true,
        },
      }),
    );

    await waitFor(() => useUnifiedAuthStore.getState().subscriptionSource === 'apple');
    const state = useUnifiedAuthStore.getState();
    expect(state.subscriptionCancelAtPeriodEnd).toBe(true);
    expect(state.currentPeriodEnd).toBe(Date.parse('2026-09-01T00:00:00.000Z'));
    expect(state.account.subscriptionSource).toBe('apple');
    expect(state.account.subscriptionCancelAtPeriodEnd).toBe(true);
    expect(state.stripeSubscription).toMatchObject({
      subscription_source: 'apple',
      cancel_at_period_end: true,
    });
  });

  it('clears account A capabilities synchronously while account B refresh is hung', async () => {
    await loadAccountA();
    const accountAEpoch = useUnifiedAuthStore.getState().cloudSessionEpoch;

    emit(
      authState('account-b', 'token-b', {
        subscriptionFetchStatus: 'fetching',
      }),
    );

    const duringAccountRefresh = useUnifiedAuthStore.getState();
    expect(duringAccountRefresh.user?.id).toBe('account-b');
    expect(duringAccountRefresh.accessToken).toBe('token-b');
    expect(duringAccountRefresh.cloudSessionEpoch).toBeGreaterThan(accountAEpoch);
    expect(duringAccountRefresh.plan).toBeNull();
    expect(duringAccountRefresh.isPro).toBe(false);
    expect(duringAccountRefresh.isEnterprise).toBe(false);
    expect(duringAccountRefresh.featureFlags).toEqual({});
    expect(duringAccountRefresh.credits).toBeNull();
    expect(duringAccountRefresh.creditBalance_cents).toBeNull();
    expect(duringAccountRefresh.dailyUsage_cents).toBeNull();
    expect(duringAccountRefresh.dailyLimit_cents).toBeNull();
    expect(duringAccountRefresh.stripeCustomer).toBeNull();
    expect(duringAccountRefresh.stripeSubscription).toBeNull();
    expect(duringAccountRefresh.account.plan).toBeNull();
    expect(duringAccountRefresh.account.featureFlags).toEqual({});
    expect(duringAccountRefresh.account.credits).toBeNull();

    const bCredits = deferred<{ credits: { remaining_cents: number } }>();
    mocks.fetchUserProfile.mockImplementationOnce(() => bCredits.promise);
    emit(
      authState('account-b', 'token-b', {
        subscription: { plan_tier: 'basic', status: 'active' },
        featureFlags: { code_execution: false },
      }),
    );
    await waitFor(() => mocks.fetchUserProfile.mock.calls.length === 2);

    const duringCreditsRefresh = useUnifiedAuthStore.getState();
    expect(duringCreditsRefresh.user?.id).toBe('account-b');
    expect(duringCreditsRefresh.plan).toBeNull();
    expect(duringCreditsRefresh.featureFlags).toEqual({});
    expect(duringCreditsRefresh.credits).toBeNull();
    expect(duringCreditsRefresh.creditBalance_cents).toBeNull();

    bCredits.resolve({ credits: { remaining_cents: 500 } });
    await waitFor(() => useUnifiedAuthStore.getState().plan === 'basic');
    expect(useUnifiedAuthStore.getState().credits?.remaining_cents).toBe(500);
  });

  it('preserves stable account state and epoch across a same-account token refresh', async () => {
    await loadAccountA();
    const before = useUnifiedAuthStore.getState();

    emit(
      authState('account-a', 'token-a-rotated', {
        subscription: accountASubscription,
        featureFlags: { code_execution: true, generic_web_search: true },
        subscriptionFetchStatus: 'fetching',
      }),
    );

    const duringAccountRefresh = useUnifiedAuthStore.getState();
    expect(duringAccountRefresh.accessToken).toBe('token-a-rotated');
    expect(duringAccountRefresh.cloudSessionEpoch).toBe(before.cloudSessionEpoch);
    expect(duringAccountRefresh.plan).toBe(before.plan);
    expect(duringAccountRefresh.featureFlags).toEqual(before.featureFlags);
    expect(duringAccountRefresh.credits).toEqual(before.credits);
    expect(duringAccountRefresh.creditBalance_cents).toBe(before.creditBalance_cents);

    const rotatedCredits = deferred<{ credits: { remaining_cents: number } }>();
    mocks.fetchUserProfile.mockImplementationOnce(() => rotatedCredits.promise);
    emit(
      authState('account-a', 'token-a-rotated', {
        subscription: accountASubscription,
        featureFlags: { code_execution: true, generic_web_search: true },
      }),
    );
    await waitFor(() => mocks.fetchUserProfile.mock.calls.length === 2);

    const duringCreditsRefresh = useUnifiedAuthStore.getState();
    expect(duringCreditsRefresh.cloudSessionEpoch).toBe(before.cloudSessionEpoch);
    expect(duringCreditsRefresh.plan).toBe(before.plan);
    expect(duringCreditsRefresh.featureFlags).toEqual(before.featureFlags);
    expect(duringCreditsRefresh.credits).toEqual(before.credits);

    rotatedCredits.resolve({ credits: { remaining_cents: 8_800 } });
    await waitFor(() => useUnifiedAuthStore.getState().credits?.remaining_cents === 8_800);
    expect(useUnifiedAuthStore.getState().cloudSessionEpoch).toBe(before.cloudSessionEpoch);
  });

  it('drops an older account result that settles after the new boundary is projected', async () => {
    await loadAccountA();
    const delayedAccountACredits = deferred<{ credits: { remaining_cents: number } }>();
    mocks.fetchUserProfile.mockImplementationOnce(() => delayedAccountACredits.promise);

    emit(
      authState('account-a', 'token-a-refreshing', {
        subscription: { plan_tier: 'max_15x', status: 'active' },
        featureFlags: { account_a_only: true },
      }),
    );
    await waitFor(() => mocks.fetchUserProfile.mock.calls.length === 2);

    emit(
      authState('account-b', 'token-b', {
        subscriptionFetchStatus: 'fetching',
      }),
    );
    expect(useUnifiedAuthStore.getState()).toMatchObject({
      user: { id: 'account-b' },
      accessToken: 'token-b',
      plan: null,
      featureFlags: {},
      credits: null,
      creditBalance_cents: null,
    });

    delayedAccountACredits.resolve({ credits: { remaining_cents: 7_700 } });
    await waitFor(() => useUnifiedAuthStore.getState().user?.id === 'account-b');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useUnifiedAuthStore.getState()).toMatchObject({
      user: { id: 'account-b' },
      accessToken: 'token-b',
      plan: null,
      featureFlags: {},
      credits: null,
      creditBalance_cents: null,
    });
  });
});
