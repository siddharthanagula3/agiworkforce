import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  getKeyValueStore: vi.fn(),
  trackAuditedProductEvent: vi.fn(),
}));

vi.mock('@/lib/server/product-analytics', () => ({
  trackAuditedProductEvent: mocks.trackAuditedProductEvent,
}));
vi.mock('./server/product-analytics', () => ({
  trackAuditedProductEvent: mocks.trackAuditedProductEvent,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ execute: mocks.execute, query: mocks.query })),
}));
vi.mock('./server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ execute: mocks.execute, query: mocks.query })),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('./server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));

import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';

import {
  auditEnvelopeFields,
  auditRetentionClassFor,
  consumePendingSecurityAnomalyCheck,
  logSecurityEvent,
  recordAuditEvent,
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
  mocks.query.mockResolvedValue({ rows: [] });
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

describe('audit envelope', () => {
  it('classifies an export as compliance and a login as security', () => {
    expect(auditRetentionClassFor('data_exported')).toBe('compliance');
    expect(auditRetentionClassFor('login')).toBe('security');
  });

  it('carries the caller-supplied correlation and causation ids', () => {
    expect(
      auditEnvelopeFields({
        eventType: 'login',
        correlationId: 'req_1',
        causationId: 'evt_0',
        operationRef: '1:req_1:op_a:att_b',
      }),
    ).toEqual({
      schema_version: 1,
      retention_class: 'security',
      correlation_id: 'req_1',
      causation_id: 'evt_0',
      operation_ref: '1:req_1:op_a:att_b',
    });
  });

  it('writes the envelope into both the security row and the enterprise row', async () => {
    await recordAuditEvent({
      eventType: 'data_exported',
      userId: 'user_1',
      organizationId: 'org_1',
      correlationId: 'req_2',
    });

    const securityDetails = JSON.parse(String(mocks.execute.mock.calls[0]?.[1]?.[6]));
    expect(securityDetails).toMatchObject({
      schema_version: 1,
      retention_class: 'compliance',
      correlation_id: 'req_2',
    });

    const enterpriseMetadata = JSON.parse(String(mocks.query.mock.calls[0]?.[1]?.[8]));
    expect(enterpriseMetadata).toMatchObject({
      schema_version: 1,
      retention_class: 'compliance',
      correlation_id: 'req_2',
    });
  });
});
