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

import { DEPENDENCY_LIVE_CHECKS, runHealthChecks } from './health-check';
function asKeyValueStore(client: unknown): KeyValueStore {
  return createUpstashKeyValueStore(client as UpstashRedisLike);
}

function fakeRedis() {
  return { get: mocks.redisGet, set: mocks.redisSet };
}

interface RetrievalCatalogueRow {
  missing_relations: number;
  full_text_index: boolean;
  embedding_index: boolean;
  vector_extension: boolean;
}

const RETRIEVAL_READY: RetrievalCatalogueRow = {
  missing_relations: 0,
  full_text_index: true,
  embedding_index: true,
  vector_extension: true,
};

function isRetrievalQuery(sql: string): boolean {
  return sql.includes('missing_relations');
}

/**
 * The default database is a healthy one: `select 1` answers, the retrieval
 * catalogue is complete and the queue aggregate returns nothing. A case that
 * wants a fault states only that fault.
 */
function respondingDatabase(overrides: Partial<RetrievalCatalogueRow> = {}) {
  return async (sql: string) => {
    if (isRetrievalQuery(sql)) return [{ ...RETRIEVAL_READY, ...overrides }];
    return [{ '?column?': 1 }];
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.test';
  process.env['UPSTASH_REDIS_REST_TOKEN'] = 'test-token';
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_health';
  process.env['CLERK_SECRET_KEY'] = 'sk_test_health';
  delete process.env['STRIPE_SECRET_KEY'];
  mocks.neonQuery.mockImplementation(respondingDatabase());
  mocks.redisSet.mockResolvedValue('OK');
  mocks.redisGet.mockResolvedValue('2026-09-21T00:00:00.000Z');
  mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeRedis()));
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
    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });

  it('reports the database unhealthy however recently a probe last succeeded', async () => {
    mocks.neonQuery.mockImplementation(async (sql: string) => {
      if (sql === 'select 1') throw new Error('ECONNREFUSED');
      if (isRetrievalQuery(sql)) return [RETRIEVAL_READY];
      return [{ '?column?': 1 }];
    });

    const result = await runHealthChecks();

    expect(result.checks.database).toEqual({ status: 'unhealthy', message: 'unavailable' });
    expect(result.status).toBe('unhealthy');
  });

  it('reports the search index from the index itself however recently it answered', async () => {
    mocks.neonQuery.mockImplementation(respondingDatabase({ missing_relations: 2 }));

    const result = await runHealthChecks();

    expect(result.checks.search).toEqual({ status: 'unhealthy', message: 'index schema missing' });
  });

  it('answers from the live catalogue rather than from anything it stored', async () => {
    mocks.redisGet.mockResolvedValue('an older run said everything was fine');

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(mocks.neonQuery).toHaveBeenCalledWith(
      expect.stringContaining('missing_relations'),
      expect.anything(),
    );
    expect(result.checks.search.status).toBe('healthy');
  });

  it('queries the queue table on the same run, so the probe adds no connection', async () => {
    await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith(
      expect.stringContaining('from public.background_jobs'),
      [],
    );
    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
  });

  it('probes the database when no key-value store is configured', async () => {
    mocks.getKeyValueStore.mockReturnValue(null);

    const result = await runHealthChecks();

    expect(mocks.neonQuery).toHaveBeenCalledWith('select 1');
    expect(result.checks.database.status).toBe('healthy');
  });
});

describe('runHealthChecks cache probe', () => {
  it('spends one command on the store per run, and writes nothing', async () => {
    const result = await runHealthChecks();

    expect(mocks.redisGet).toHaveBeenCalledTimes(1);
    expect(mocks.redisSet).not.toHaveBeenCalled();
    expect(result.checks.cache.status).toBe('healthy');
  });

  it('counts an empty key as an answer, because an answer is what it measures', async () => {
    mocks.redisGet.mockResolvedValue(null);

    const result = await runHealthChecks();

    expect(result.checks.cache.status).toBe('healthy');
  });

  it('fails the platform when the store refuses the command, not only when it is unreachable', async () => {
    mocks.redisGet.mockRejectedValue(new Error('max requests limit exceeded'));

    const result = await runHealthChecks();

    expect(result.checks.cache).toEqual({ status: 'unhealthy', message: 'unavailable' });
    expect(result.status).toBe('unhealthy');
  });

  it('gives up rather than holding the endpoint open when the store never answers', async () => {
    mocks.redisGet.mockImplementation(() => new Promise(() => {}));

    const result = await runHealthChecks();

    expect(result.checks.cache).toEqual({ status: 'unhealthy', message: 'unavailable' });
  });

  it('reports the core dependency failing rather than unobserved when the cache is down', async () => {
    mocks.redisGet.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await runHealthChecks();

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ id: 'key_value', criticality: 'core', observation: 'failing' }),
    );
  });

  it('spends nothing and reports unconfigured when no store is configured', async () => {
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['KV_REST_API_URL'];
    delete process.env['KV_REST_API_TOKEN'];
    mocks.getKeyValueStore.mockReturnValue(null);

    const result = await runHealthChecks();

    expect(mocks.redisGet).not.toHaveBeenCalled();
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ id: 'key_value', observation: 'unconfigured' }),
    );
    expect(result.checks.cache).toEqual({ status: 'healthy', message: 'not configured' });
  });

  it('survives a store that throws on resolution rather than on the command', async () => {
    mocks.getKeyValueStore.mockImplementation(() => {
      throw new Error('no key-value runtime');
    });

    const result = await runHealthChecks();

    expect(result.checks.cache).toEqual({ status: 'unhealthy', message: 'unavailable' });
    expect(result.checks.database.status).toBe('healthy');
  });

  it('names no key and no vendor response in the result a stranger can read', async () => {
    mocks.redisGet.mockRejectedValue(new Error('max requests limit exceeded'));

    const result = await runHealthChecks();

    const body = JSON.stringify(result);
    expect(body).not.toContain('health:probe');
    expect(body).not.toContain('max requests limit exceeded');
  });
});

describe('runHealthChecks retrieval probe', () => {
  it('separates semantic retrieval from full text, which fail apart', async () => {
    mocks.neonQuery.mockImplementation(respondingDatabase({ embedding_index: false }));

    const result = await runHealthChecks();

    expect(result.checks.search.status).toBe('healthy');
    expect(result.checks.vector).toEqual({
      status: 'unhealthy',
      message: 'embedding index missing',
    });
  });

  it('reports the extension as its own fault, not as a missing index', async () => {
    mocks.neonQuery.mockImplementation(respondingDatabase({ vector_extension: false }));

    const result = await runHealthChecks();

    expect(result.checks.vector).toEqual({ status: 'unhealthy', message: 'extension missing' });
  });

  it('fails the core context engine when either half of retrieval is broken', async () => {
    mocks.neonQuery.mockImplementation(respondingDatabase({ embedding_index: false }));

    const result = await runHealthChecks();

    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ id: 'context_engine', observation: 'failing' }),
    );
  });

  it('degrades rather than pages when only retrieval is broken', async () => {
    mocks.neonQuery.mockImplementation(respondingDatabase({ full_text_index: false }));

    const result = await runHealthChecks();

    expect(result.checks.database.status).toBe('healthy');
    expect(result.status).toBe('degraded');
  });
});

describe('what the health surface claims to probe', () => {
  it('probes every dependency the registry says this endpoint probes', () => {
    const claimed = PRODUCTION_DEPENDENCIES.filter(
      (dependency) => dependency.liveProbe === 'api/health',
    )
      .map((dependency) => dependency.id)
      .sort();
    const implemented = Object.keys(DEPENDENCY_LIVE_CHECKS)
      .filter(
        (id) =>
          PRODUCTION_DEPENDENCIES.find((dependency) => dependency.id === id)?.liveProbe ===
          'api/health',
      )
      .sort();

    expect(implemented).toEqual(claimed);
  });

  it('claims no dependency the registry says nothing probes', () => {
    const contradicted = Object.keys(DEPENDENCY_LIVE_CHECKS).filter(
      (id) =>
        PRODUCTION_DEPENDENCIES.find((dependency) => dependency.id === id)?.liveProbe === null,
    );

    expect(contradicted).toEqual([]);
  });

  it('gives every dependency without a live check a stated reason', () => {
    const unexplained = PRODUCTION_DEPENDENCIES.filter(
      (dependency) =>
        DEPENDENCY_LIVE_CHECKS[dependency.id] === undefined &&
        (dependency.liveProbeGap ?? '').trim().length === 0,
    ).map((dependency) => dependency.id);

    expect(unexplained).toEqual([]);
  });

  it('names a check that exists for every dependency it maps', async () => {
    const result = await runHealthChecks();

    for (const [dependency, names] of Object.entries(DEPENDENCY_LIVE_CHECKS)) {
      expect(PRODUCTION_DEPENDENCIES.map((entry) => entry.id)).toContain(dependency);
      for (const name of names) {
        expect(result.checks[name], `${dependency} -> ${name}`).toBeDefined();
      }
    }
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
