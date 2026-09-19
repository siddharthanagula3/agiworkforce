import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  neonQuery: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  getKeyValueStore: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: mocks.neonQuery })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('stripe', () => ({
  default: class MockStripe {
    products = { list: vi.fn().mockResolvedValue({ data: [] }) };
    prices = { retrieve: vi.fn() };
  },
}));
vi.mock('@/lib/price-tier-mapping', () => ({ getConfiguredStripePriceIds: vi.fn(() => []) }));

import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';

import { runHealthChecks } from './health-check';
function asKeyValueStore(client: unknown): KeyValueStore {
  return createUpstashKeyValueStore(client as UpstashRedisLike);
}

const DATABASE_PROBE_LAST_SUCCESS_REDIS_KEY = 'agi-health-probe:database-last-success-at';

function fakeRedis() {
  return { get: mocks.redisGet, set: mocks.redisSet };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.test';
  process.env['UPSTASH_REDIS_REST_TOKEN'] = 'test-token';
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_health';
  process.env['CLERK_SECRET_KEY'] = 'sk_test_health';
  delete process.env['STRIPE_SECRET_KEY'];
  mocks.neonQuery.mockResolvedValue([{ '?column?': 1 }]);
  mocks.getKeyValueStore.mockReturnValue(null);
});

describe('runHealthChecks core dependency readiness', () => {
  it('is unhealthy when key-value configuration is missing', async () => {
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['KV_REST_API_URL'];
    delete process.env['KV_REST_API_TOKEN'];

    const result = await runHealthChecks();

    expect(result.status).toBe('unhealthy');
    expect(result.checks.environment.status).toBe('unhealthy');
    expect(result.checks.environment.unreadyDependencies).toContainEqual(
      expect.objectContaining({ id: 'key_value', criticality: 'core' }),
    );
  });

  it('is unhealthy when identity configuration is missing', async () => {
    delete process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
    delete process.env['CLERK_SECRET_KEY'];

    const result = await runHealthChecks();

    expect(result.status).toBe('unhealthy');
    expect(result.checks.environment.status).toBe('unhealthy');
    expect(result.checks.environment.missingCount).toBe(1);
    expect(result.checks.environment.unreadyDependencies).toContainEqual(
      expect.objectContaining({ id: 'identity', criticality: 'core' }),
    );
  });

  it('keeps degradable and optional configuration gaps out of core health', async () => {
    delete process.env['OBJECT_STORAGE_ENDPOINT'];
    delete process.env['OBJECT_STORAGE_ACCESS_KEY_ID'];
    delete process.env['OBJECT_STORAGE_SECRET_ACCESS_KEY'];
    delete process.env['R2_ACCOUNT_ID'];
    delete process.env['R2_ACCESS_KEY_ID'];
    delete process.env['R2_SECRET_ACCESS_KEY'];
    delete process.env['E2B_API_KEY'];

    const result = await runHealthChecks();

    expect(result.checks.environment.status).toBe('healthy');
    expect(result.checks.environment.unreadyDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'object_storage', criticality: 'degradable' }),
        expect.objectContaining({ id: 'code_execution', criticality: 'optional' }),
      ]),
    );
  });
});

describe('runHealthChecks database throttle', () => {
  it('probes and records success when redis has no prior probe', async () => {
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
    mocks.redisGet.mockResolvedValue(null);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
    expect(mocks.redisSet).toHaveBeenCalledWith(
      DATABASE_PROBE_LAST_SUCCESS_REDIS_KEY,
      expect.any(Number),
      { ex: 3_600 },
    );
  });

  it('skips the database probe when the last success is within the interval', async () => {
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
    mocks.redisGet.mockResolvedValue(Date.now() - 10 * 60 * 1_000);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).not.toHaveBeenCalledWith('select 1');
    expect(mocks.neonQuery).toHaveBeenCalledWith(
      expect.stringContaining('from public.background_jobs'),
      [],
    );
    expect(result.checks.database.status).toBe('healthy');
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('probes again once the last success ages past the interval', async () => {
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
    mocks.redisGet.mockResolvedValue(Date.now() - 61 * 60 * 1_000);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });

  it('falls back to probing when redis is unavailable', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });

  it('falls back to probing when redis throws', async () => {
    mocks.getKeyValueStore.mockImplementation(() => {
      throw new Error('redis unavailable');
    });

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });

  it('never records success on a failed probe, so the next run retries', async () => {
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
    mocks.redisGet.mockResolvedValue(null);
    mocks.neonQuery.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await runHealthChecks();

    expect(result.checks.database.status).toBe('unhealthy');
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });
});
