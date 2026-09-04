import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  neonQuery: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  getSharedRedisClient: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: mocks.neonQuery })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ getSharedRedisClient: mocks.getSharedRedisClient }));
vi.mock('stripe', () => ({
  default: class MockStripe {
    products = { list: vi.fn().mockResolvedValue({ data: [] }) };
    prices = { retrieve: vi.fn() };
  },
}));
vi.mock('@/lib/price-tier-mapping', () => ({ getConfiguredStripePriceIds: vi.fn(() => []) }));

import { runHealthChecks } from './health-check';

const DATABASE_PROBE_LAST_SUCCESS_REDIS_KEY = 'agi-health-probe:database-last-success-at';

function fakeRedis() {
  return { get: mocks.redisGet, set: mocks.redisSet };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  delete process.env['STRIPE_SECRET_KEY'];
  mocks.neonQuery.mockResolvedValue([{ '?column?': 1 }]);
  mocks.getSharedRedisClient.mockReturnValue(null);
});

describe('runHealthChecks database throttle', () => {
  it('probes and records success when redis has no prior probe', async () => {
    mocks.getSharedRedisClient.mockReturnValue(fakeRedis());
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
    mocks.getSharedRedisClient.mockReturnValue(fakeRedis());
    mocks.redisGet.mockResolvedValue(Date.now() - 10 * 60 * 1_000);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).not.toHaveBeenCalled();
    expect(result.checks.database.status).toBe('healthy');
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('probes again once the last success ages past the interval', async () => {
    mocks.getSharedRedisClient.mockReturnValue(fakeRedis());
    mocks.redisGet.mockResolvedValue(Date.now() - 61 * 60 * 1_000);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });

  it('falls back to probing when redis is unavailable', async () => {
    mocks.getSharedRedisClient.mockReturnValue(null);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });

  it('falls back to probing when redis throws', async () => {
    mocks.getSharedRedisClient.mockImplementation(() => {
      throw new Error('redis unavailable');
    });

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });

  it('never records success on a failed probe, so the next run retries', async () => {
    mocks.getSharedRedisClient.mockReturnValue(fakeRedis());
    mocks.redisGet.mockResolvedValue(null);
    mocks.neonQuery.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await runHealthChecks();

    expect(result.checks.database.status).toBe('unhealthy');
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });
});
