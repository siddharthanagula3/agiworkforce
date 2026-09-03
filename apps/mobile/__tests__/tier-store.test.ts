jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/api', () => {
  function MockApiPaywallError(
    this: { feature: string; requiredTier: string; reason: string; name: string; message: string },
    feat: string,
    reqTier: string,
    rsn: string,
  ) {
    this.feature = feat;
    this.requiredTier = reqTier;
    this.reason = rsn;
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);

  return {
    api: { get: jest.fn() },
    ApiPaywallError: MockApiPaywallError,
  };
});

import {
  useTierStore,
  ensureCloudEntitlementsReadyForRequest,
} from '../src/features/billing/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { api } from '../services/api';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockApiGet = api.get as jest.Mock;

function getState() {
  return useTierStore.getState();
}

function mePayload(
  tier: string,
  {
    status = 'active',
    granted = ['canChat', 'canUseCloudExecution', 'canUseConnectors'],
    codeExecution = true,
    subscriptionSource = 'stripe',
  }: {
    status?: string;
    granted?: string[];
    codeExecution?: boolean;
    subscriptionSource?: 'none' | 'stripe' | 'apple' | 'google' | 'manual';
  } = {},
) {
  return {
    id: 'user_test_1',
    email: 'test@example.com',
    name: 'Test User',
    avatar_url: null,
    created_at: null,
    updated_at: 1751712000,
    plan: {
      tier,
      display_name: tier,
      status,
      current_period_end: null,
      subscription_source: subscriptionSource,
    },
    feature_flags: {
      advanced_model_access: true,
      code_execution: codeExecution,
      generic_web_search: true,
    },
    credits: null,
    routing_preferences: {},
    capability_handshake: {
      sessionId: 'user_test_1',
      version: 'mobile-capabilities-v1',
      computedAt: '2026-07-26T00:00:00.000Z',
      sources: {
        model: 'models.json@1',
        tier: `tier:${tier}`,
        surface: 'surface:mobile',
        settings: 'settings:none-configured',
      },
      granted,
      deniedBy: {},
    },
  };
}

function resetStore() {
  useTierStore.setState({
    tier: 'free',
    billingTier: 'free',
    billingStatus: 'none',
    billingSource: 'unknown',
    billingPeriodEnd: null,
    billingCancelsAtPeriodEnd: false,
    isRefreshing: false,
    lastRefreshedAt: null,
    currentConversationProvider: null,
    grantedCapabilities: [],
    capabilityHandshakeVersion: null,
    capabilityHandshakeReceived: false,
    codeExecutionAvailable: false,
    genericWebSearchAvailable: false,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('tier-test-user-a');
  useChatAppModeStore.setState({ appMode: 'cloud' });
  resetStore();
});

describe('tierStore defaults', () => {
  it('starts with tier = free', () => {
    expect(getState().tier).toBe('free');
  });

  it('starts with raw billing tier = free', () => {
    expect((getState() as unknown as { billingTier: string }).billingTier).toBe('free');
  });

  it('starts with isRefreshing = false', () => {
    expect(getState().isRefreshing).toBe(false);
  });

  it('starts with lastRefreshedAt = null', () => {
    expect(getState().lastRefreshedAt).toBeNull();
  });

  it('starts without claiming that a capability handshake was received', () => {
    expect(getState().capabilityHandshakeReceived).toBe(false);
  });
});

describe('refreshTier, success cases', () => {
  it('hydrates tier from /api/me plan field', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('basic'));

    await getState().refreshTier();

    expect(getState().tier).toBe('basic');
  });

  it('normalises "PRO" to "pro"', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('PRO'));

    await getState().refreshTier();

    expect(getState().tier).toBe('pro');
  });

  it('keeps cached tier when the payload violates the /api/me contract', async () => {
    useTierStore.setState({ tier: 'pro', isRefreshing: false, lastRefreshedAt: null });
    mockApiGet.mockResolvedValueOnce({ plan: { tier: 'basic' } });

    await getState().refreshTier();

    expect(getState().tier).toBe('pro');
    expect(getState().lastRefreshedAt).toBeNull();
  });

  it('sets lastRefreshedAt on success', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('max_15x'));
    const before = Date.now();

    await getState().refreshTier();

    const refreshedAt = getState().lastRefreshedAt;
    expect(refreshedAt).not.toBeNull();
    expect(new Date(refreshedAt!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('sets isRefreshing back to false after success', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('max'));

    await getState().refreshTier();

    expect(getState().isRefreshing).toBe(false);
  });

  it('calls the /api/me endpoint', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('basic'));

    await getState().refreshTier();

    expect(mockApiGet).toHaveBeenCalledWith('/api/me?surface=mobile');
  });

  it('hydrates the generic web-search deployment capability', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('max'));

    await getState().refreshTier();

    expect(getState().genericWebSearchAvailable).toBe(true);
  });

  it('keeps the raw plan for billing copy but fails closed on a canceled paid plan', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('pro', { status: 'canceled' }));

    await getState().refreshTier();

    expect(getState().tier).toBe('free');
    expect((getState() as unknown as { billingTier: string }).billingTier).toBe('pro');
  });

  it('hydrates the server-authoritative subscription management source', async () => {
    mockApiGet.mockResolvedValueOnce(
      mePayload('pro', { status: 'active', subscriptionSource: 'apple' }),
    );

    await getState().refreshTier();

    expect(getState().billingSource).toBe('apple');
  });

  it('persists the server-authoritative capability handshake', async () => {
    mockApiGet.mockResolvedValueOnce(
      mePayload('max', {
        granted: ['canChat', 'canUseDeepResearch', 'canUseConnectors'],
      }),
    );

    await getState().refreshTier();

    const state = getState() as unknown as {
      grantedCapabilities: string[];
      capabilityHandshakeVersion: string | null;
    };
    expect(state.grantedCapabilities).toEqual([
      'canChat',
      'canUseDeepResearch',
      'canUseConnectors',
    ]);
    expect(state.capabilityHandshakeVersion).toBe('mobile-capabilities-v1');
    expect(getState().capabilityHandshakeReceived).toBe(true);
  });

  it('requires both deployment availability and the per-account cloud-execution grant', async () => {
    mockApiGet.mockResolvedValueOnce(
      mePayload('max', { granted: ['canChat'], codeExecution: true }),
    );

    await getState().refreshTier();

    expect(getState().codeExecutionAvailable).toBe(false);
  });
});

describe('refreshTier, failure cases', () => {
  it('keeps cached tier when network call fails', async () => {
    useTierStore.setState({ tier: 'pro', isRefreshing: false, lastRefreshedAt: null });
    mockApiGet.mockRejectedValueOnce(new Error('Network error'));

    await getState().refreshTier();

    expect(getState().tier).toBe('pro');
  });

  it('sets isRefreshing back to false after failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('timeout'));

    await getState().refreshTier();

    expect(getState().isRefreshing).toBe(false);
  });

  it('does not update lastRefreshedAt on failure', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('500'));

    await getState().refreshTier();

    expect(getState().lastRefreshedAt).toBeNull();
  });
});

describe('refreshTier, concurrent call de-duplication', () => {
  it('skips a second concurrent call if one is already in flight', async () => {
    let resolveFirst!: (v: unknown) => void;
    const firstPromise = new Promise<{ plan: string }>((resolve) => {
      resolveFirst = resolve;
    });
    mockApiGet.mockReturnValueOnce(firstPromise);

    const first = getState().refreshTier();

    await Promise.resolve();

    await getState().refreshTier();
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    resolveFirst(mePayload('basic'));
    await first;
    expect(getState().tier).toBe('basic');
  });

  it('ignores an account-A response that resolves after switching to account B', async () => {
    let resolveAccountA!: (value: unknown) => void;
    mockApiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAccountA = resolve;
      }),
    );

    const accountARefresh = getState().refreshTier();
    await Promise.resolve();
    activateCloudAccount('tier-test-user-b');
    getState().clearAccountEntitlements();

    resolveAccountA(mePayload('max'));
    await accountARefresh;

    expect(getState()).toMatchObject({
      tier: 'free',
      billingTier: 'free',
      isRefreshing: false,
      grantedCapabilities: [],
    });
  });

  it('lets the first Cloud request join an in-flight entitlement refresh', async () => {
    let resolveRefresh!: (value: unknown) => void;
    mockApiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const backgroundRefresh = getState().refreshTier();
    await Promise.resolve();
    let requestReady = false;
    const requestGate = ensureCloudEntitlementsReadyForRequest().then(() => {
      requestReady = true;
    });
    await Promise.resolve();

    expect(requestReady).toBe(false);
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    resolveRefresh(
      mePayload('max', {
        granted: ['canChat', 'canUseWebSearch'],
      }),
    );
    await Promise.all([backgroundRefresh, requestGate]);

    expect(requestReady).toBe(true);
    expect(getState()).toMatchObject({
      tier: 'max',
      capabilityHandshakeReceived: true,
      grantedCapabilities: ['canChat', 'canUseWebSearch'],
      genericWebSearchAvailable: true,
    });
  });
});

describe('setTier', () => {
  it('overrides tier immediately', () => {
    getState().setTier('max');
    expect(getState().tier).toBe('max');
  });

  it('does not affect isRefreshing or lastRefreshedAt', () => {
    getState().setTier('max_15x');

    expect(getState().isRefreshing).toBe(false);
    expect(getState().lastRefreshedAt).toBeNull();
  });
});

describe('clearAccountEntitlements', () => {
  it('clears every account-scoped tier, capability, and provider cache', () => {
    useTierStore.setState({
      tier: 'enterprise',
      billingTier: 'enterprise',
      billingStatus: 'active',
      billingSource: 'stripe',
      billingPeriodEnd: 1_800_000_000,
      billingCancelsAtPeriodEnd: true,
      lastRefreshedAt: '2026-07-26T00:00:00.000Z',
      grantedCapabilities: ['canUseDeepResearch', 'canUseConnectors'],
      capabilityHandshakeVersion: 'version-user-a',
      capabilityHandshakeReceived: true,
      codeExecutionAvailable: true,
      genericWebSearchAvailable: true,
      currentConversationProvider: 'anthropic',
    } as never);

    (
      getState() as unknown as {
        clearAccountEntitlements: () => void;
      }
    ).clearAccountEntitlements();

    const state = getState() as unknown as {
      tier: string;
      billingTier: string;
      billingStatus: string;
      billingSource: string;
      billingPeriodEnd: number | null;
      billingCancelsAtPeriodEnd: boolean;
      lastRefreshedAt: string | null;
      grantedCapabilities: string[];
      capabilityHandshakeVersion: string | null;
      capabilityHandshakeReceived: boolean;
      codeExecutionAvailable: boolean;
      genericWebSearchAvailable: boolean;
      currentConversationProvider: string | null;
    };
    expect(state).toMatchObject({
      tier: 'free',
      billingTier: 'free',
      billingStatus: 'none',
      billingSource: 'unknown',
      billingPeriodEnd: null,
      billingCancelsAtPeriodEnd: false,
      lastRefreshedAt: null,
      grantedCapabilities: [],
      capabilityHandshakeVersion: null,
      capabilityHandshakeReceived: false,
      codeExecutionAvailable: false,
      genericWebSearchAvailable: false,
      currentConversationProvider: null,
    });
  });
});

describe('currentConversationProvider', () => {
  it('starts as null', () => {
    expect(getState().currentConversationProvider).toBeNull();
  });

  it('setCurrentConversationProvider sets a provider id', () => {
    getState().setCurrentConversationProvider('anthropic');
    expect(getState().currentConversationProvider).toBe('anthropic');
  });

  it('setCurrentConversationProvider can be called with any string', () => {
    getState().setCurrentConversationProvider('openai');
    expect(getState().currentConversationProvider).toBe('openai');
  });

  it('setCurrentConversationProvider can be cleared back to null', () => {
    getState().setCurrentConversationProvider('google');
    expect(getState().currentConversationProvider).toBe('google');

    getState().setCurrentConversationProvider(null);
    expect(getState().currentConversationProvider).toBeNull();
  });

  it('setCurrentConversationProvider does not affect tier or refresh state', () => {
    useTierStore.setState({ tier: 'pro', isRefreshing: false, lastRefreshedAt: '2026-01-01' });

    getState().setCurrentConversationProvider('xai');

    expect(getState().tier).toBe('pro');
    expect(getState().isRefreshing).toBe(false);
    expect(getState().lastRefreshedAt).toBe('2026-01-01');
  });
});
