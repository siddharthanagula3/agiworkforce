/**
 * Waitlist service + store — unit tests
 *
 * Covers:
 *  - joinWaitlist() success path: posts through the Web/API waitlist endpoint
 *  - joinWaitlist() validation error (bad email)
 *  - joinWaitlist() network error
 *  - useWaitlistStore defaults, markJoined, clear, MMKV persistence
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

jest.mock('../services/api', () => {
  const post = jest.fn();
  const get = jest.fn();
  return {
    api: { post, get },
    __mocks: { post, get },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import {
  joinWaitlist,
  WaitlistValidationError,
  WaitlistNetworkError,
  useWaitlistStore,
} from '../src/features/waitlist';

// Retrieve the inner mock functions after imports so they are fully initialised.
const { post, get } = (
  jest.requireMock('../services/api') as {
    __mocks: { post: jest.Mock; get: jest.Mock };
  }
).__mocks;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStoreState() {
  return useWaitlistStore.getState();
}

function resetStore() {
  useWaitlistStore.setState({
    joined: false,
    email: undefined,
    country: undefined,
    rank: undefined,
    joinedAt: undefined,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
  // CSRF preflight: GET /api/csrf resolves a token by default.
  get.mockResolvedValue({ token: 'test-csrf-token' });
});

// ---------------------------------------------------------------------------
// joinWaitlist — success
// ---------------------------------------------------------------------------

describe('joinWaitlist — success', () => {
  it('posts a row with the normalised email', async () => {
    post.mockResolvedValueOnce({ ok: true, joined: true });

    await joinWaitlist({ email: '  Test@Example.COM  ' });

    expect(post).toHaveBeenCalledWith(
      '/api/waitlist/cloud-managed',
      expect.objectContaining({ email: 'test@example.com' }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
  });

  it('passes optional country and deviceModel fields when provided', async () => {
    post.mockResolvedValueOnce({ ok: true, joined: true });

    await joinWaitlist({
      email: 'user@test.io',
      country: 'US',
      deviceModel: 'iPhone 16',
      deviceTier: 2,
    });

    expect(post).toHaveBeenCalledWith(
      '/api/waitlist/cloud-managed',
      expect.objectContaining({
        email: 'user@test.io',
        country: 'US',
        deviceModel: 'iPhone 16',
        deviceTier: 2,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
  });

  it('returns rank 0 because the Web/API route does not expose rank', async () => {
    post.mockResolvedValueOnce({ ok: true, joined: true });

    const result = await joinWaitlist({ email: 'a@b.com' });

    expect(result).toEqual({ rank: 0 });
  });

  it('fetches a CSRF token from /api/csrf BEFORE posting (no preflight = 403)', async () => {
    post.mockResolvedValueOnce({ ok: true });

    await joinWaitlist({ email: 'a@b.com' });

    expect(get).toHaveBeenCalledWith('/api/csrf');
    // The token must reach the POST so requireCsrfToken passes server-side.
    expect(post).toHaveBeenCalledWith(
      '/api/waitlist/cloud-managed',
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
  });

  it('throws WaitlistNetworkError and does NOT post when the CSRF preflight fails', async () => {
    get.mockReset();
    get.mockResolvedValueOnce({}); // no token returned

    await expect(joinWaitlist({ email: 'a@b.com' })).rejects.toThrow(WaitlistNetworkError);
    expect(post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// joinWaitlist — validation errors
// ---------------------------------------------------------------------------

describe('joinWaitlist — validation errors', () => {
  it('throws WaitlistValidationError for an empty email', async () => {
    await expect(joinWaitlist({ email: '' })).rejects.toThrow(WaitlistValidationError);
  });

  it('throws WaitlistValidationError for a missing @ sign', async () => {
    await expect(joinWaitlist({ email: 'notanemail' })).rejects.toThrow(WaitlistValidationError);
  });

  it('throws WaitlistValidationError for a missing TLD', async () => {
    await expect(joinWaitlist({ email: 'user@domain' })).rejects.toThrow(WaitlistValidationError);
  });

  it('does not call api.post when validation fails', async () => {
    await joinWaitlist({ email: 'bad' }).catch(() => {});
    expect(post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// joinWaitlist — network / RPC errors
// ---------------------------------------------------------------------------

describe('joinWaitlist — network errors', () => {
  it('throws WaitlistNetworkError on API failure', async () => {
    post.mockRejectedValueOnce(new Error('server error'));

    await expect(joinWaitlist({ email: 'a@b.com' })).rejects.toThrow(WaitlistNetworkError);
  });
});

// ---------------------------------------------------------------------------
// useWaitlistStore — defaults
// ---------------------------------------------------------------------------

describe('useWaitlistStore — defaults', () => {
  it('starts with joined = false', () => {
    expect(getStoreState().joined).toBe(false);
  });

  it('starts with no email', () => {
    expect(getStoreState().email).toBeUndefined();
  });

  it('starts with no rank', () => {
    expect(getStoreState().rank).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useWaitlistStore — markJoined
// ---------------------------------------------------------------------------

describe('useWaitlistStore — markJoined', () => {
  it('sets joined = true', () => {
    getStoreState().markJoined({ email: 'user@test.com', country: 'US' }, { rank: 5 });
    expect(getStoreState().joined).toBe(true);
  });

  it('persists email, country, and rank', () => {
    getStoreState().markJoined({ email: 'user@test.com', country: 'IN' }, { rank: 12 });

    const state = getStoreState();
    expect(state.email).toBe('user@test.com');
    expect(state.country).toBe('IN');
    expect(state.rank).toBe(12);
  });

  it('records a joinedAt ISO timestamp', () => {
    const before = Date.now();
    getStoreState().markJoined({ email: 'user@test.com' }, { rank: 0 });

    const joinedAt = getStoreState().joinedAt;
    expect(joinedAt).toBeDefined();
    expect(new Date(joinedAt!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('persists without country when country is omitted', () => {
    getStoreState().markJoined({ email: 'user@test.com' }, { rank: 3 });
    expect(getStoreState().country).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useWaitlistStore — clear
// ---------------------------------------------------------------------------

describe('useWaitlistStore — clear', () => {
  it('resets joined to false', () => {
    getStoreState().markJoined({ email: 'a@b.com' }, { rank: 1 });
    getStoreState().clear();
    expect(getStoreState().joined).toBe(false);
  });

  it('clears email, country, rank, and joinedAt', () => {
    getStoreState().markJoined({ email: 'a@b.com', country: 'US' }, { rank: 7 });
    getStoreState().clear();

    const state = getStoreState();
    expect(state.email).toBeUndefined();
    expect(state.country).toBeUndefined();
    expect(state.rank).toBeUndefined();
    expect(state.joinedAt).toBeUndefined();
  });
});
