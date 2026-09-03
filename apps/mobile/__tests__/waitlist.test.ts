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

import {
  joinWaitlist,
  redeemInviteCode,
  WaitlistValidationError,
  WaitlistNetworkError,
  useWaitlistStore,
} from '../src/features/waitlist';

const { post, get } = (
  jest.requireMock('../services/api') as {
    __mocks: { post: jest.Mock; get: jest.Mock };
  }
).__mocks;

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
    cloudUnlocked: false,
    inviteId: undefined,
    inviteCode: undefined,
    cloudUnlockedAt: undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
  get.mockResolvedValue({ token: 'test-csrf-token' });
});

describe('joinWaitlist, success', () => {
  it('posts a row with the normalised email', async () => {
    post.mockResolvedValueOnce({ ok: true, joined: true, rank: 2 });

    await joinWaitlist({ email: '  Test@Example.COM  ' });

    expect(post).toHaveBeenCalledWith(
      '/api/waitlist/public',
      expect.objectContaining({ email: 'test@example.com', source: 'mobile' }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
  });

  it('passes optional country and deviceModel fields when provided', async () => {
    post.mockResolvedValueOnce({ ok: true, joined: true, rank: 3 });

    await joinWaitlist({
      email: 'user@test.io',
      country: 'US',
      deviceModel: 'iPhone 16',
      deviceTier: 2,
    });

    expect(post).toHaveBeenCalledWith(
      '/api/waitlist/public',
      expect.objectContaining({
        email: 'user@test.io',
        source: 'mobile',
        country: 'US',
        deviceModel: 'iPhone 16',
        deviceTier: 2,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
  });

  it('returns the server-provided zero-indexed rank', async () => {
    post.mockResolvedValueOnce({ ok: true, joined: true, rank: 14 });

    const result = await joinWaitlist({ email: 'a@b.com' });

    expect(result).toEqual({ rank: 14 });
  });

  it('resolves {rank: null} when the API omits rank', async () => {
    post.mockResolvedValueOnce({ ok: true, joined: true });

    const result = await joinWaitlist({ email: 'a@b.com' });
    expect(result).toEqual({ rank: null });
  });

  it('fetches a CSRF token from /api/csrf BEFORE posting (no preflight = 403)', async () => {
    post.mockResolvedValueOnce({ ok: true, joined: true, rank: 0 });

    await joinWaitlist({ email: 'a@b.com' });

    expect(get).toHaveBeenCalledWith('/api/csrf');
    expect(post).toHaveBeenCalledWith(
      '/api/waitlist/public',
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf-token' }),
      }),
    );
  });

  it('throws WaitlistNetworkError and does NOT post when the CSRF preflight fails', async () => {
    get.mockReset();
    get.mockResolvedValueOnce({});

    await expect(joinWaitlist({ email: 'a@b.com' })).rejects.toThrow(WaitlistNetworkError);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('joinWaitlist, validation errors', () => {
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

describe('joinWaitlist, network errors', () => {
  it('throws WaitlistNetworkError on API failure', async () => {
    post.mockRejectedValueOnce(new Error('server error'));

    await expect(joinWaitlist({ email: 'a@b.com' })).rejects.toThrow(WaitlistNetworkError);
  });
});

describe('redeemInviteCode, alpha code', () => {
  it('accepts ALPHATESTER and returns the local alpha invite id', async () => {
    await expect(redeemInviteCode('ALPHATESTER', 'chat')).resolves.toEqual({
      success: true,
      inviteId: 'mobile-alpha-tester',
    });
  });

  it('normalizes casing and whitespace', async () => {
    await expect(redeemInviteCode('  alphatester  ', 'chat')).resolves.toEqual({
      success: true,
      inviteId: 'mobile-alpha-tester',
    });
  });

  it('rejects unknown codes', async () => {
    await expect(redeemInviteCode('WRONGCODE', 'chat')).resolves.toEqual({
      success: false,
      error: 'invalid_code',
    });
  });
});

describe('useWaitlistStore, defaults', () => {
  it('starts with joined = false', () => {
    expect(getStoreState().joined).toBe(false);
  });

  it('starts with no email', () => {
    expect(getStoreState().email).toBeUndefined();
  });

  it('starts with no rank', () => {
    expect(getStoreState().rank).toBeUndefined();
  });

  it('starts with cloud access locked', () => {
    expect(getStoreState().cloudUnlocked).toBe(false);
  });
});

describe('useWaitlistStore, markJoined', () => {
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

describe('useWaitlistStore, markInviteRedeemed', () => {
  it('unlocks cloud access and normalizes the invite code', () => {
    getStoreState().markInviteRedeemed({
      code: ' alphatester ',
      inviteId: 'mobile-alpha-tester',
    });

    const state = getStoreState();
    expect(state.cloudUnlocked).toBe(true);
    expect(state.inviteCode).toBe('ALPHATESTER');
    expect(state.inviteId).toBe('mobile-alpha-tester');
    expect(state.cloudUnlockedAt).toBeDefined();
  });
});

describe('useWaitlistStore, clear', () => {
  it('resets joined to false', () => {
    getStoreState().markJoined({ email: 'a@b.com' }, { rank: 1 });
    getStoreState().clear();
    expect(getStoreState().joined).toBe(false);
  });

  it('clears email, country, rank, and joinedAt', () => {
    getStoreState().markJoined({ email: 'a@b.com', country: 'US' }, { rank: 7 });
    getStoreState().markInviteRedeemed({
      code: 'ALPHATESTER',
      inviteId: 'mobile-alpha-tester',
    });
    getStoreState().clear();

    const state = getStoreState();
    expect(state.email).toBeUndefined();
    expect(state.country).toBeUndefined();
    expect(state.rank).toBeUndefined();
    expect(state.joinedAt).toBeUndefined();
    expect(state.cloudUnlocked).toBe(false);
    expect(state.inviteCode).toBeUndefined();
    expect(state.inviteId).toBeUndefined();
    expect(state.cloudUnlockedAt).toBeUndefined();
  });
});
