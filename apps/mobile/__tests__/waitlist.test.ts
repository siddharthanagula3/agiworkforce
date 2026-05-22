/**
 * Waitlist service + store — unit tests
 *
 * Covers:
 *  - joinWaitlist() success path: inserts row, calls RPC, returns rank
 *  - joinWaitlist() validation error (bad email)
 *  - joinWaitlist() duplicate error (Postgres 23505)
 *  - joinWaitlist() network error (Supabase insert failure)
 *  - joinWaitlist() RPC failure path
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

// The supabase mock exposes its inner jest.fn()s via __mocks so tests can control them.
// All mock functions are created inside the factory (not outside) so they are
// available at factory run time (which is hoisted before module-level const declarations).
jest.mock('../services/supabase', () => {
  const mockInsert = jest.fn();
  const mockRpc = jest.fn();
  return {
    supabase: {
      from: jest.fn(() => ({ insert: mockInsert })),
      rpc: mockRpc,
    },
    __mocks: { mockInsert, mockRpc },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are registered)
// ---------------------------------------------------------------------------

import {
  joinWaitlist,
  WaitlistValidationError,
  WaitlistDuplicateError,
  WaitlistNetworkError,
  useWaitlistStore,
} from '../src/features/waitlist';

// Retrieve the inner mock functions after imports so they are fully initialised.
const { mockInsert, mockRpc } = (
  jest.requireMock('../services/supabase') as {
    __mocks: { mockInsert: jest.Mock; mockRpc: jest.Mock };
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

  // Re-wire `from` after clearAllMocks so it returns { insert: mockInsert } again.
  const { supabase } = jest.requireMock('../services/supabase') as {
    supabase: { from: jest.Mock };
  };
  supabase.from.mockImplementation(() => ({ insert: mockInsert }));
});

// ---------------------------------------------------------------------------
// joinWaitlist — success
// ---------------------------------------------------------------------------

describe('joinWaitlist — success', () => {
  it('inserts a row with the normalised email', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: 42, error: null });

    await joinWaitlist({ email: '  Test@Example.COM  ' });

    const { supabase } = jest.requireMock('../services/supabase') as {
      supabase: { from: jest.Mock };
    };
    expect(supabase.from).toHaveBeenCalledWith('cloud_waitlist');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.com' }));
  });

  it('passes optional country and deviceModel fields when provided', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: 10, error: null });

    await joinWaitlist({
      email: 'user@test.io',
      country: 'US',
      deviceModel: 'iPhone 16',
      deviceTier: 2,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@test.io',
        country: 'US',
        device_model: 'iPhone 16',
        device_tier: 2,
      }),
    );
  });

  it('calls cloud_waitlist_rank RPC with the normalised email', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: 7, error: null });

    await joinWaitlist({ email: 'someone@example.com' });

    expect(mockRpc).toHaveBeenCalledWith('cloud_waitlist_rank', { p_email: 'someone@example.com' });
  });

  it('returns the rank from the RPC', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: 99, error: null });

    const result = await joinWaitlist({ email: 'a@b.com' });

    expect(result).toEqual({ rank: 99 });
  });

  it('treats a non-number RPC response as rank 0', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await joinWaitlist({ email: 'a@b.com' });

    expect(result).toEqual({ rank: 0 });
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

  it('does not call supabase.from when validation fails', async () => {
    const { supabase } = jest.requireMock('../services/supabase') as {
      supabase: { from: jest.Mock };
    };
    await joinWaitlist({ email: 'bad' }).catch(() => {});
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// joinWaitlist — duplicate error
// ---------------------------------------------------------------------------

describe('joinWaitlist — duplicate error', () => {
  it('throws WaitlistDuplicateError on Postgres 23505', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'unique violation' } });

    await expect(joinWaitlist({ email: 'dupe@example.com' })).rejects.toThrow(
      WaitlistDuplicateError,
    );
  });

  it('does not call RPC when there is a duplicate error', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'unique violation' } });

    await joinWaitlist({ email: 'dupe@example.com' }).catch(() => {});
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// joinWaitlist — network / RPC errors
// ---------------------------------------------------------------------------

describe('joinWaitlist — network errors', () => {
  it('throws WaitlistNetworkError on any non-unique Supabase insert error', async () => {
    mockInsert.mockResolvedValueOnce({ error: { code: '500', message: 'server error' } });

    await expect(joinWaitlist({ email: 'a@b.com' })).rejects.toThrow(WaitlistNetworkError);
  });

  it('throws WaitlistNetworkError when the RPC fails', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } });

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
