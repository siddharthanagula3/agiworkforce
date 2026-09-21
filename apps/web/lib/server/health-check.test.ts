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

import { PRODUCTION_DEPENDENCIES } from '@/lib/config/dependency-readiness';
import { recordConfigurationState } from '@/lib/observability/metrics';

import { runHealthChecks } from './health-check';
function asKeyValueStore(client: unknown): KeyValueStore {
  return createUpstashKeyValueStore(client as UpstashRedisLike);
}

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

describe('runHealthChecks database probe', () => {
  it('observes the database on every run, whatever an earlier run recorded', async () => {
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
    mocks.redisGet.mockResolvedValue(Date.now());

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });

  it('reports the database unhealthy however recently a probe last succeeded', async () => {
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
    mocks.redisGet.mockResolvedValue(Date.now());
    mocks.neonQuery.mockImplementation(async (sql: string) => {
      if (sql === 'select 1') throw new Error('ECONNREFUSED');
      return [{ missing: 0 }];
    });

    const result = await runHealthChecks();

    expect(result.checks.database).toEqual({ status: 'unhealthy', message: 'unavailable' });
    expect(result.status).toBe('unhealthy');
  });

  it('reports the search index from the index itself however recently it answered', async () => {
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
    mocks.redisGet.mockResolvedValue(Date.now());
    mocks.neonQuery.mockImplementation(async (sql: string) =>
      sql.includes('to_regclass') ? [{ missing: 2 }] : [{ '?column?': 1 }],
    );

    const result = await runHealthChecks();

    expect(result.checks.search).toEqual({ status: 'unhealthy', message: 'index schema missing' });
  });

  it('leaves no stored verdict behind for a later run to answer from', async () => {
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
    mocks.redisGet.mockResolvedValue(null);

    await runHealthChecks();

    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('queries the queue table on the same run, so the probe adds no connection', async () => {
    await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith(
      expect.stringContaining('from public.background_jobs'),
      [],
    );
    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
  });

  it('probes when no key-value store is configured', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });
});

describe('runHealthChecks dependency enumeration', () => {
  it('reports one entry per registered production dependency, in registry order', async () => {
    const result = await runHealthChecks();

    expect(result.dependencies).toBeDefined();
    expect((result.dependencies ?? []).map((entry) => entry.id)).toEqual(
      PRODUCTION_DEPENDENCIES.map((dependency) => dependency.id),
    );
  });

  it('says unobserved for a dependency no check here probes, rather than ok', async () => {
    const result = await runHealthChecks();

    const identity = (result.dependencies ?? []).find((entry) => entry.id === 'identity');
    expect(identity).toMatchObject({ criticality: 'core', observation: 'unobserved' });
  });

  it('separates a dependency that is not configured from one that is failing', async () => {
    delete process.env['E2B_API_KEY'];
    mocks.neonQuery.mockImplementation(async (sql: string) => {
      if (sql === 'select 1') throw new Error('ECONNREFUSED');
      return [{ missing: 0 }];
    });

    const result = await runHealthChecks();

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ id: 'database', observation: 'failing' }),
    );
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ id: 'code_execution', observation: 'unconfigured' }),
    );
  });

  it('names the failure counter and dashboard the signal registry declares', async () => {
    const result = await runHealthChecks();

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ id: 'database', signal: 'database', dashboard: 'database-health' }),
    );
  });

  it('carries no environment variable name into the result', async () => {
    delete process.env['E2B_API_KEY'];

    const result = await runHealthChecks();

    expect(JSON.stringify(result.dependencies)).not.toContain('E2B_API_KEY');
  });

  it('makes a boot-time configuration finding readable from the health surface', async () => {
    recordConfigurationState({ component: 'environment-production-values', state: 'invalid' });
    recordConfigurationState({ component: 'platform-keys', state: 'ok' });

    const result = await runHealthChecks();

    expect(result.configuration).toContainEqual(
      expect.objectContaining({ component: 'environment-production-values', state: 'invalid' }),
    );
    expect(result.configuration).toContainEqual(
      expect.objectContaining({ component: 'platform-keys', state: 'ok' }),
    );
  });
});
