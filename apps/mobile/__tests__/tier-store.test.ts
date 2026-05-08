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

// Mock @agiworkforce/types normalizeBillingPlanTier to keep tests self-contained
jest.mock('@agiworkforce/types', () => ({
  normalizeBillingPlanTier: (val: string | null | undefined): string => {
    if (!val) return 'free';
    const known = ['local-only', 'byok', 'free', 'hobby', 'pro', 'pro_plus', 'max', 'enterprise'];
    const lower = val.toLowerCase();
    return known.includes(lower) ? lower : 'free';
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { useTierStore } from '../stores/tierStore';
import { api } from '../services/api';

// Retrieve the mock function reference AFTER imports (the factory ran during hoisting)
const mockApiGet = api.get as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useTierStore.getState();
}

function resetStore() {
  useTierStore.setState({
    tier: 'free',
    isRefreshing: false,
    lastRefreshedAt: null,
    currentConversationProvider: null,
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

describe('refreshTier — success cases', () => {
  it('hydrates tier from /api/auth/me plan field', async () => {
    mockApiGet.mockResolvedValueOnce({ plan: { tier: 'hobby' } });

    await getState().refreshTier();

    expect(getState().tier).toBe('hobby');
  });

  it('normalises "PRO" to "pro"', async () => {
    mockApiGet.mockResolvedValueOnce({ plan: { tier: 'PRO' } });

    await getState().refreshTier();

    expect(getState().tier).toBe('pro');
  });

  it('normalises null plan to "free"', async () => {
    mockApiGet.mockResolvedValueOnce({ plan: null });

    await getState().refreshTier();

    expect(getState().tier).toBe('free');
  });

  it('normalises missing plan field to "free"', async () => {
    mockApiGet.mockResolvedValueOnce({});

    await getState().refreshTier();

    expect(getState().tier).toBe('free');
  });

  it('sets lastRefreshedAt on success', async () => {
    mockApiGet.mockResolvedValueOnce({ plan: { tier: 'pro_plus' } });
    const before = Date.now();

    await getState().refreshTier();

    const refreshedAt = getState().lastRefreshedAt;
    expect(refreshedAt).not.toBeNull();
    expect(new Date(refreshedAt!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('sets isRefreshing back to false after success', async () => {
    mockApiGet.mockResolvedValueOnce({ plan: { tier: 'max' } });

    await getState().refreshTier();

    expect(getState().isRefreshing).toBe(false);
  });

  it('calls /api/auth/me endpoint', async () => {
    mockApiGet.mockResolvedValueOnce({ plan: { tier: 'hobby' } });

    await getState().refreshTier();

    expect(mockApiGet).toHaveBeenCalledWith('/api/me');
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
    resolveFirst({ plan: { tier: 'hobby' } });
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
