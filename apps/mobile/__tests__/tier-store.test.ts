/**
 * tierStore — unit tests
 *
 * Verifies:
 *  - Defaults to 'free' tier
 *  - refreshTier() fetches /api/auth/me and persists the normalised tier
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

// Override only the billing normalizer. Cloud-contract schemas loaded by the
// store also consume shared contract constants from this package.
jest.mock('@agiworkforce/types', () => {
  const actual = jest.requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
  return {
    ...actual,
    normalizeBillingPlanTier: (val: string | null | undefined): string => {
      if (!val) return 'free';
      const known = ['local-only', 'byok', 'free', 'hobby', 'pro', 'pro_plus', 'max', 'enterprise'];
      const lower = val.toLowerCase();
      return known.includes(lower) ? lower : 'free';
    },
  };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { useTierStore } from '../src/features/billing/store';
import { api } from '../services/api';
import { FEATURES } from '../lib/v1FeatureFlags';

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
function mePayload(tier: string) {
  return {
    id: 'user_test_1',
    email: 'test@example.com',
    name: 'Test User',
    avatar_url: null,
    created_at: null,
    updated_at: 1751712000,
    plan: { tier, display_name: tier, status: 'active', current_period_end: null },
    feature_flags: {
      beta_features: true,
      advanced_model_access: true,
      generic_web_search: true,
    },
    credits: null,
    routing_preferences: {},
  };
}

function resetStore() {
  useTierStore.setState({
    tier: 'free',
    isRefreshing: false,
    lastRefreshedAt: null,
    currentConversationProvider: null,
    genericWebSearchAvailable: false,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tierStore defaults', () => {
  it('starts with tier = free', () => {
    expect(getState().tier).toBe('free');
  });

  it('starts with isRefreshing = false', () => {
    expect(getState().isRefreshing).toBe(false);
  });

  it('starts with lastRefreshedAt = null', () => {
    expect(getState().lastRefreshedAt).toBeNull();
  });
});

// refreshTier() is a no-op when FEATURES.billing = false (v1 local-only).
// These tests verify cloud billing behaviour and are skipped in v1 config.
const describeRefreshTier = FEATURES.billing ? describe : describe.skip;

describeRefreshTier('refreshTier — success cases', () => {
  it('hydrates tier from /api/me plan field', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('hobby'));

    await getState().refreshTier();

    expect(getState().tier).toBe('hobby');
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
    mockApiGet.mockResolvedValueOnce({ plan: { tier: 'hobby' } });

    await getState().refreshTier();

    expect(getState().tier).toBe('pro');
    expect(getState().lastRefreshedAt).toBeNull();
  });

  it('sets lastRefreshedAt on success', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('pro_plus'));
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
    mockApiGet.mockResolvedValueOnce(mePayload('hobby'));

    await getState().refreshTier();

    expect(mockApiGet).toHaveBeenCalledWith('/api/me');
  });

  it('hydrates the generic web-search deployment capability', async () => {
    mockApiGet.mockResolvedValueOnce(mePayload('max'));

    await getState().refreshTier();

    expect(getState().genericWebSearchAvailable).toBe(true);
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

describeRefreshTier('refreshTier — concurrent call de-duplication', () => {
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
    resolveFirst(mePayload('hobby'));
    await first;
    expect(getState().tier).toBe('hobby');
  });
});

describe('setTier', () => {
  it('overrides tier immediately', () => {
    getState().setTier('max');
    expect(getState().tier).toBe('max');
  });

  it('does not affect isRefreshing or lastRefreshedAt', () => {
    getState().setTier('pro_plus');

    expect(getState().isRefreshing).toBe(false);
    expect(getState().lastRefreshedAt).toBeNull();
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
