import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  neonQuery: vi.fn(),
  getKeyValueStore: vi.fn(),
  getDefaultModelFor: vi.fn(),
  getModelMetadataById: vi.fn(),
  isModelLive: vi.fn(),
  listManagedRoutesForModel: vi.fn(),
  listAvailableManagedProviderIds: vi.fn(),
  getProviderAvailabilityMap: vi.fn(),
  readJobQueueStats: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({ query: mocks.neonQuery })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('@/lib/server/stripe-client', () => ({ getStripeClientOrNull: vi.fn(() => null) }));
vi.mock('@/lib/price-tier-mapping', () => ({ getConfiguredStripePriceIds: vi.fn(() => []) }));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  getDefaultModelFor: mocks.getDefaultModelFor,
  getModelMetadataById: mocks.getModelMetadataById,
  isModelLive: mocks.isModelLive,
  listManagedRoutesForModel: mocks.listManagedRoutesForModel,
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: mocks.listAvailableManagedProviderIds,
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  getProviderAvailabilityMap: mocks.getProviderAvailabilityMap,
}));
vi.mock('@/lib/jobs/job-service', () => ({ readJobQueueStats: mocks.readJobQueueStats }));

import { createMemoryKeyValueStore } from '@agiworkforce/key-value';

import { runHealthChecks } from '../health-check';

const ROUTED_PROVIDER = 'provider-under-test';
const OTHER_PROVIDER = 'second-provider';

const RETRIEVAL_READY = {
  missing_relations: 0,
  full_text_index: true,
  embedding_index: true,
  vector_extension: true,
} as const;

function healthyQueue(queue: string) {
  return { queue, queued: 0, running: 0, dead: 0, oldestQueuedAgeMs: 0, stuck: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.test';
  process.env['UPSTASH_REDIS_REST_TOKEN'] = 'test-token';
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_health';
  process.env['CLERK_SECRET_KEY'] = 'sk_test_health';
  mocks.getKeyValueStore.mockReturnValue(createMemoryKeyValueStore());
  mocks.neonQuery.mockImplementation(async (sql: string) =>
    sql.includes('missing_relations') ? [RETRIEVAL_READY] : [{ '?column?': 1 }],
  );
  mocks.getDefaultModelFor.mockReturnValue('model-under-test');
  mocks.getModelMetadataById.mockReturnValue({ id: 'model-under-test' });
  mocks.isModelLive.mockReturnValue(true);
  mocks.listManagedRoutesForModel.mockReturnValue([
    { routeId: 'route-a', provider: ROUTED_PROVIDER },
    { routeId: 'route-b', provider: OTHER_PROVIDER },
  ]);
  mocks.listAvailableManagedProviderIds.mockReturnValue(new Set([ROUTED_PROVIDER, OTHER_PROVIDER]));
  mocks.getProviderAvailabilityMap.mockResolvedValue({});
  mocks.readJobQueueStats.mockResolvedValue([healthyQueue('default')]);
});

describe('capability health checks', () => {
  it('reports every capability healthy when each dependency answers', async () => {
    const result = await runHealthChecks();

    expect(result.checks.chat.status).toBe('healthy');
    expect(result.checks.work.status).toBe('healthy');
    expect(result.checks.voice.status).toBe('healthy');
    expect(result.checks.search.status).toBe('healthy');
  });

  it('marks chat and voice unhealthy when no route has a configured provider', async () => {
    mocks.listAvailableManagedProviderIds.mockReturnValue(new Set<string>());

    const result = await runHealthChecks();

    expect(result.checks.chat).toEqual({ status: 'unhealthy', message: 'no configured route' });
    expect(result.checks.voice).toEqual({ status: 'unhealthy', message: 'no configured route' });
  });

  it('marks chat unhealthy when every configured route is degraded', async () => {
    mocks.getProviderAvailabilityMap.mockResolvedValue({
      [ROUTED_PROVIDER]: { state: 'degraded', reason: 'overloaded', until: 'later' },
      [OTHER_PROVIDER]: { state: 'degraded', reason: 'overloaded', until: 'later' },
    });

    const result = await runHealthChecks();

    expect(result.checks.chat).toEqual({ status: 'unhealthy', message: 'every route degraded' });
  });

  it('keeps chat healthy while one configured route is still serving', async () => {
    mocks.getProviderAvailabilityMap.mockResolvedValue({
      [ROUTED_PROVIDER]: { state: 'degraded', reason: 'overloaded', until: 'later' },
    });

    const result = await runHealthChecks();

    expect(result.checks.chat.status).toBe('healthy');
  });

  it('marks a capability unhealthy when its default route is no longer live', async () => {
    mocks.isModelLive.mockReturnValue(false);

    const result = await runHealthChecks();

    expect(result.checks.chat).toEqual({ status: 'unhealthy', message: 'no live default route' });
  });

  it('marks work unhealthy when a queue has stopped draining', async () => {
    mocks.readJobQueueStats.mockResolvedValue([
      {
        queue: 'default',
        queued: 40,
        running: 0,
        dead: 0,
        oldestQueuedAgeMs: 90 * 60_000,
        stuck: 0,
      },
    ]);

    const result = await runHealthChecks();

    expect(result.checks.work).toEqual({
      status: 'unhealthy',
      message: '1 queue(s) not draining',
    });
  });

  it('keeps work healthy for a warning-level backlog, which is not an outage', async () => {
    mocks.readJobQueueStats.mockResolvedValue([
      {
        queue: 'default',
        queued: 3,
        running: 1,
        dead: 0,
        oldestQueuedAgeMs: 20 * 60_000,
        stuck: 0,
      },
    ]);

    const result = await runHealthChecks();

    expect(result.checks.work.status).toBe('healthy');
  });

  it('marks work unhealthy when the queue read itself fails', async () => {
    mocks.readJobQueueStats.mockRejectedValue(new Error('queue unreachable'));

    const result = await runHealthChecks();

    expect(result.checks.work).toEqual({ status: 'unhealthy', message: 'unavailable' });
  });

  it('marks search unhealthy when the retrieval index is absent', async () => {
    mocks.neonQuery.mockImplementation(async (sql: string) =>
      sql.includes('to_regclass') ? [{ missing: 2 }] : [{ '?column?': 1 }],
    );

    const result = await runHealthChecks();

    expect(result.checks.search).toEqual({ status: 'unhealthy', message: 'index schema missing' });
  });

  it('marks search unhealthy when the index probe cannot run', async () => {
    mocks.neonQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) throw new Error('relation lookup failed');
      return [{ '?column?': 1 }];
    });

    const result = await runHealthChecks();

    expect(result.checks.search).toEqual({ status: 'unhealthy', message: 'unavailable' });
  });
});

describe('overall status', () => {
  it('refuses to report healthy while a capability is down', async () => {
    mocks.readJobQueueStats.mockResolvedValue([
      {
        queue: 'default',
        queued: 40,
        running: 0,
        dead: 0,
        oldestQueuedAgeMs: 90 * 60_000,
        stuck: 0,
      },
    ]);

    const result = await runHealthChecks();

    expect(result.status).toBe('degraded');
  });

  it('reports unhealthy when core serving fails, whatever the capabilities say', async () => {
    mocks.neonQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ missing: 0 }];
      throw new Error('database unreachable');
    });

    const result = await runHealthChecks();

    expect(result.status).toBe('unhealthy');
  });

  it('never calls a provider to decide whether chat is serving', async () => {
    await runHealthChecks();

    expect(mocks.getProviderAvailabilityMap).toHaveBeenCalled();
    expect(mocks.listManagedRoutesForModel).toHaveBeenCalled();
    for (const call of mocks.neonQuery.mock.calls) {
      expect(String(call[0])).not.toMatch(/insert|update|delete/i);
    }
  });
});
