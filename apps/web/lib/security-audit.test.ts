import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getKeyValueStore: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ execute: mocks.execute })),
}));
vi.mock('./server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ execute: mocks.execute })),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('./server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));

import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';

import {
  consumePendingSecurityAnomalyCheck,
  logSecurityEvent,
  SECURITY_EVENT_ACTIVITY_REDIS_KEY,
  sanitizeAuditDetail,
} from './security-audit';

function fakeRedis() {
  return { incrby: vi.fn(), expire: vi.fn(), get: vi.fn(), del: vi.fn() };
}
function asKeyValueStore(client: unknown): KeyValueStore {
  return createUpstashKeyValueStore(client as UpstashRedisLike);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue(undefined);
  mocks.getKeyValueStore.mockReturnValue(null);
});

describe('logSecurityEvent activity marker', () => {
  it('increments the activity counter after a successful write', async () => {
    const redis = fakeRedis();
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    await logSecurityEvent({ eventType: 'auth_failed' });

    expect(redis.incrby).toHaveBeenCalledWith(SECURITY_EVENT_ACTIVITY_REDIS_KEY, 1);
    expect(redis.expire).toHaveBeenCalledWith(SECURITY_EVENT_ACTIVITY_REDIS_KEY, 3_600);
  });

  it('does not throw when redis is unavailable', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);

    await expect(logSecurityEvent({ eventType: 'auth_failed' })).resolves.toBeUndefined();
  });

  it('does not increment when the write itself fails', async () => {
    const redis = fakeRedis();
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));
    mocks.execute.mockRejectedValue(new Error('insert failed'));

    await logSecurityEvent({ eventType: 'auth_failed' });

    expect(redis.incrby).not.toHaveBeenCalled();
  });
});

describe('consumePendingSecurityAnomalyCheck', () => {
  it('returns true and resets the counter when activity is pending', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(3);
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    await expect(consumePendingSecurityAnomalyCheck()).resolves.toBe(true);
    expect(redis.del).toHaveBeenCalledWith(SECURITY_EVENT_ACTIVITY_REDIS_KEY);
  });

  it('returns false and leaves the counter alone when nothing is pending', async () => {
    const redis = fakeRedis();
    redis.get.mockResolvedValue(0);
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    await expect(consumePendingSecurityAnomalyCheck()).resolves.toBe(false);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('returns null when redis is unavailable, so the caller falls through', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);

    await expect(consumePendingSecurityAnomalyCheck()).resolves.toBeNull();
  });

  it('returns null instead of throwing when redis errors', async () => {
    const redis = fakeRedis();
    redis.get.mockRejectedValue(new Error('redis down'));
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    await expect(consumePendingSecurityAnomalyCheck()).resolves.toBeNull();
  });
});

describe('sanitizeAuditDetail', () => {
  it('keeps the ip allow list change alongside the changed keys', () => {
    const detail = sanitizeAuditDetail({
      changedKeys: ['ipAllowList'],
      ipAllowListBefore: ['10.0.0.0/8'],
      ipAllowListAfter: ['10.0.0.0/8', '192.168.1.0/24'],
    });
    expect(detail['changedKeys']).toEqual(['ipAllowList']);
    expect(detail['ipAllowListBefore']).toEqual(['10.0.0.0/8']);
    expect(detail['ipAllowListAfter']).toEqual(['10.0.0.0/8', '192.168.1.0/24']);
  });
});
