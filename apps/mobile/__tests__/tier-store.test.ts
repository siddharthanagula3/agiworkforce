/**
 * tierStore — unit tests
 *
 * Verifies:
 *  - Defaults to 'free' tier
 *  - refreshTier() fetches the mobile /api/me capability handshake
 *  - paid access is derived from plan status, never the raw tier alone
 *  - account-scoped entitlement state is cleared atomically on sign-out
 *  - refreshTier() falls back to cached tier on network error
 *  - refreshTier() de-duplicates concurrent calls
 *  - setTier() overrides locally
 *  - MMKV persistence layer is called on tier update
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// Mock api — inject controlled /api/auth/me responses.
// Note: jest.mock() is hoisted to the top of the file by Babel, so we cannot
// reference variables defined in the test body here. Use jest.fn() inside the
// factory and retrieve it via jest.mocked() after import.
jest.mock('../services/api', () => {
  // Plain ES class — no TS parameter property syntax (Babel cannot hoist it)
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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { useTierStore } from '../src/features/billing/store';
import { api } from '../services/api';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

// Retrieve the mock function reference AFTER imports (the factory ran during hoisting)
const mockApiGet = api.get as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useTierStore.getState();
}

/**
 * Build a full contract-valid /api/me payload (see packages/services
 * cloud-contracts/me.ts). refreshTier() now validates responses with
 * parseMeResponse, so partial payloads throw and fall back to the cached tier.
 */
function mePayload(
  tier: string,
  {
    status = 'active',
    granted = ['canChat', 'canUseCloudExecution', 'canUseConnectors'],
    codeExecution = true,
  }: {
    status?: string;
    granted?: string[];
    codeExecution?: boolean;
  } = {},
) {
  return {
    id: 'user_test_1',
    email: 'test@example.com',
    name: 'Test User',
    avatar_url: null,
    created_at: null,
    updated_at: 1751712000,
    plan: { tier, display_name: tier, status, current_period_end: null },
    feature_flags: {
      beta_features: true,
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
    isRefreshing: false,
    lastRefreshedAt: null,
    currentConversationProvider: null,
    grantedCapabilities: [],
    capabilityHandshakeVersion: null,
    codeExecutionAvailable: false,
    genericWebSearchAvailable: false,
  } as never);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('tier-test-user-a');
  resetStore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
});

describe('refreshTier — success cases', () => {
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
    // Partial payloads (missing id/email/plan envelope) fail parseMeResponse —
    // the store must degrade to the cached tier, exactly like a network error.
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
  });

  it('requires both deployment availability and the per-account cloud-execution grant', async () => {
    mockApiGet.mockResolvedValueOnce(
      mePayload('max', { granted: ['canChat'], codeExecution: true }),
    );

    await getState().refreshTier();

    expect(getState().codeExecutionAvailable).toBe(false);
  });
});

describe('refreshTier — failure cases', () => {
  it('keeps cached tier when network call fails', async () => {
    // Set an initial cached tier
    useTierStore.setState({ tier: 'pro', isRefreshing: false, lastRefreshedAt: null });
    mockApiGet.mockRejectedValueOnce(new Error('Network error'));

    await getState().refreshTier();

    // Tier must remain 'pro', not reset to 'free'
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

describe('refreshTier — concurrent call de-duplication', () => {
  it('skips a second concurrent call if one is already in flight', async () => {
    // Make the first call slow so the second call sees isRefreshing=true
    let resolveFirst!: (v: unknown) => void;
    const firstPromise = new Promise<{ plan: string }>((resolve) => {
      resolveFirst = resolve;
    });
    mockApiGet.mockReturnValueOnce(firstPromise);

    // Start first refresh without awaiting
    const first = getState().refreshTier();

    // Yield to let the first async step run (the `set({ isRefreshing: true })` line
    // runs synchronously before the first await, so after one microtask tick it is set)
    await Promise.resolve();

    // Second concurrent call while first is in flight — must not invoke api.get again
    await getState().refreshTier();
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    // Resolve the first call
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
      lastRefreshedAt: '2026-07-26T00:00:00.000Z',
      grantedCapabilities: ['canUseDeepResearch', 'canUseConnectors'],
      capabilityHandshakeVersion: 'version-user-a',
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
      lastRefreshedAt: string | null;
      grantedCapabilities: string[];
      capabilityHandshakeVersion: string | null;
      codeExecutionAvailable: boolean;
      genericWebSearchAvailable: boolean;
      currentConversationProvider: string | null;
    };
    expect(state).toMatchObject({
      tier: 'free',
      billingTier: 'free',
      lastRefreshedAt: null,
      grantedCapabilities: [],
      capabilityHandshakeVersion: null,
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
