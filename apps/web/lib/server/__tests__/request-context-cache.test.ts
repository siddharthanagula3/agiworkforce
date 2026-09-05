import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  getKeyValueStore: vi.fn(),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));

import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';

function fakeRedis() {
  return { get: vi.fn(), set: vi.fn(), del: vi.fn() };
}
function asKeyValueStore(client: unknown): KeyValueStore {
  return createUpstashKeyValueStore(client as UpstashRedisLike);
}

describe('request-context-cache, account status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined on a cache miss so the caller falls through to Postgres', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(null);
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedAccountStatus } = await import('../request-context-cache');
    await expect(getCachedAccountStatus('user-1')).resolves.toBeUndefined();
    expect(redis.get).toHaveBeenCalledWith('req-ctx:v1:account-status:user-1');
  });

  it('returns a cached null status distinctly from a miss', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue({ status: null });
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedAccountStatus } = await import('../request-context-cache');
    await expect(getCachedAccountStatus('user-1')).resolves.toBeNull();
  });

  it('returns a cached suspended status on hit', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue({ status: 'suspended' });
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedAccountStatus } = await import('../request-context-cache');
    await expect(getCachedAccountStatus('user-1')).resolves.toBe('suspended');
  });

  it('falls through on a Redis outage instead of throwing', async () => {
    const redis = fakeRedis();
    redis.get.mockRejectedValue(new Error('ECONNRESET'));
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedAccountStatus } = await import('../request-context-cache');
    await expect(getCachedAccountStatus('user-1')).resolves.toBeUndefined();
  });

  it('writes the status with the shared TTL', async () => {
    const redis = fakeRedis();
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { setCachedAccountStatus, REQUEST_CONTEXT_CACHE_TTL_SECONDS } =
      await import('../request-context-cache');
    await setCachedAccountStatus('user-1', 'banned');

    expect(redis.set).toHaveBeenCalledWith(
      'req-ctx:v1:account-status:user-1',
      { status: 'banned' },
      { ex: REQUEST_CONTEXT_CACHE_TTL_SECONDS },
    );
  });

  it('never throws when the write itself fails', async () => {
    const redis = fakeRedis();
    redis.set.mockRejectedValue(new Error('write failed'));
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { setCachedAccountStatus } = await import('../request-context-cache');
    await expect(setCachedAccountStatus('user-1', 'active')).resolves.toBeUndefined();
  });

  it('deletes the cached entry on invalidation', async () => {
    const redis = fakeRedis();
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { invalidateAccountStatusCache } = await import('../request-context-cache');
    await invalidateAccountStatusCache('user-1');

    expect(redis.del).toHaveBeenCalledWith('req-ctx:v1:account-status:user-1');
  });

  it('no-ops every operation when Redis is unavailable', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);

    const { getCachedAccountStatus, setCachedAccountStatus, invalidateAccountStatusCache } =
      await import('../request-context-cache');

    await expect(getCachedAccountStatus('user-1')).resolves.toBeUndefined();
    await expect(setCachedAccountStatus('user-1', 'active')).resolves.toBeUndefined();
    await expect(invalidateAccountStatusCache('user-1')).resolves.toBeUndefined();
  });

  it('treats a client that throws on access as an outage, not a crash', async () => {
    mocks.getKeyValueStore.mockImplementation(() => {
      throw new Error('client not configured');
    });

    const { getCachedAccountStatus } = await import('../request-context-cache');
    await expect(getCachedAccountStatus('user-1')).resolves.toBeUndefined();
  });
});

describe('request-context-cache, active organization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined on a cache miss', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(null);
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedActiveOrganizationId } = await import('../request-context-cache');
    await expect(getCachedActiveOrganizationId('user-1')).resolves.toBeUndefined();
    expect(redis.get).toHaveBeenCalledWith('req-ctx:v1:active-org:user-1');
  });

  it('returns a cached personal-workspace null distinctly from a miss', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue({ organizationId: null });
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedActiveOrganizationId } = await import('../request-context-cache');
    await expect(getCachedActiveOrganizationId('user-1')).resolves.toBeNull();
  });

  it('returns a cached organization id on hit', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue({ organizationId: 'org-1' });
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedActiveOrganizationId } = await import('../request-context-cache');
    await expect(getCachedActiveOrganizationId('user-1')).resolves.toBe('org-1');
  });

  it('falls through on a Redis outage instead of throwing', async () => {
    const redis = fakeRedis();
    redis.get.mockRejectedValue(new Error('ECONNRESET'));
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedActiveOrganizationId } = await import('../request-context-cache');
    await expect(getCachedActiveOrganizationId('user-1')).resolves.toBeUndefined();
  });

  it('writes the organization id with the shared TTL', async () => {
    const redis = fakeRedis();
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { setCachedActiveOrganizationId, REQUEST_CONTEXT_CACHE_TTL_SECONDS } =
      await import('../request-context-cache');
    await setCachedActiveOrganizationId('user-1', 'org-1');

    expect(redis.set).toHaveBeenCalledWith(
      'req-ctx:v1:active-org:user-1',
      { organizationId: 'org-1' },
      { ex: REQUEST_CONTEXT_CACHE_TTL_SECONDS },
    );
  });

  it('deletes the cached entry on invalidation', async () => {
    const redis = fakeRedis();
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { invalidateActiveOrganizationCache } = await import('../request-context-cache');
    await invalidateActiveOrganizationCache('user-1');

    expect(redis.del).toHaveBeenCalledWith('req-ctx:v1:active-org:user-1');
  });

  it('no-ops every operation when Redis is unavailable', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);

    const {
      getCachedActiveOrganizationId,
      setCachedActiveOrganizationId,
      invalidateActiveOrganizationCache,
    } = await import('../request-context-cache');

    await expect(getCachedActiveOrganizationId('user-1')).resolves.toBeUndefined();
    await expect(setCachedActiveOrganizationId('user-1', 'org-1')).resolves.toBeUndefined();
    await expect(invalidateActiveOrganizationCache('user-1')).resolves.toBeUndefined();
  });
});

describe('request-context-cache, first-token path cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('abandons a read that outlives its budget and reports a miss', async () => {
    const redis = fakeRedis();
    let settleRead: ((value: unknown) => void) | undefined;
    redis.get.mockReturnValue(
      new Promise((resolve) => {
        settleRead = resolve;
      }),
    );
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { getCachedAccountStatus } = await import('../request-context-cache');
    const { resolveRequestPathRedisReadTimeoutMs } = await import('../bounded-redis-read');
    const startedAt = Date.now();
    await expect(getCachedAccountStatus('user-1')).resolves.toBeUndefined();
    expect(Date.now() - startedAt).toBeLessThan(resolveRequestPathRedisReadTimeoutMs() * 4);
    settleRead?.({ status: 'active' });
  });

  it('returns from a write before the round trip completes', async () => {
    const redis = fakeRedis();
    let settleWrite: (() => void) | undefined;
    redis.set.mockReturnValue(
      new Promise<void>((resolve) => {
        settleWrite = resolve;
      }),
    );
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    const { setCachedActiveOrganizationId } = await import('../request-context-cache');
    await expect(setCachedActiveOrganizationId('user-1', 'org-1')).resolves.toBeUndefined();
    expect(redis.set).toHaveBeenCalledTimes(1);
    settleWrite?.();
  });
});
