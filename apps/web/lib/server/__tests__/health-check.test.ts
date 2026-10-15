import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@agiworkforce/types');

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
  getStripeClientOrNull: vi.fn(),
  getConfiguredStripePriceIds: vi.fn(),
  getPricePointForPriceId: vi.fn(),
  checkIdentityReachable: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({ query: mocks.neonQuery })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('@/lib/server/stripe-client', () => ({
  getStripeClientOrNull: mocks.getStripeClientOrNull,
}));
vi.mock('@/lib/price-tier-mapping', () => ({
  getConfiguredStripePriceIds: mocks.getConfiguredStripePriceIds,
  isGrandfatheredPriceId: vi.fn(() => false),
}));
vi.mock('@/lib/pricing', async (importOriginal) => ({
  ...(await importOriginal<PricingModule>()),
  getPricePointForPriceId: mocks.getPricePointForPriceId,
}));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
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
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityProvider: () => ({
    canVerifySessionTokens: () => Boolean(process.env['CLERK_SECRET_KEY']),
    checkReachable: mocks.checkIdentityReachable,
  }),
  getIdentityUser: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
}));

import { createMemoryKeyValueStore } from '@agiworkforce/key-value';

import { NOT_CONFIGURED, runHealthChecks } from '../health-check';

type PricingModule = typeof import('@/lib/pricing');

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
  mocks.getStripeClientOrNull.mockReturnValue(null);
  mocks.getConfiguredStripePriceIds.mockReturnValue([]);
  mocks.getPricePointForPriceId.mockReturnValue(null);
  mocks.checkIdentityReachable.mockResolvedValue(undefined);
});

describe('capability health checks', () => {
  it('reports every capability healthy when each dependency answers', async () => {
    const result = await runHealthChecks();

    expect(result.checks.chat.status).toBe('healthy');
    expect(result.checks.work.status).toBe('healthy');
    expect(result.checks.voice.status).toBe('healthy');
    expect(result.checks.search.status).toBe('healthy');
  });

  it('reports account email as not configured, without degrading the platform, while no sender is set', async () => {
    mocks.getStripeClientOrNull.mockReturnValue({
      products: { list: vi.fn().mockResolvedValue({ data: [] }) },
      prices: { retrieve: vi.fn() },
    });
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('AGI_NOTIFICATIONS_FROM_EMAIL', '');

    const unsent = await runHealthChecks();

    expect(unsent.checks.email).toEqual({ status: 'healthy', message: NOT_CONFIGURED });
    expect(unsent.status).toBe('healthy');

    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('AGI_NOTIFICATIONS_FROM_EMAIL', 'notices@agiworkforce.com');

    expect((await runHealthChecks()).checks.email).toEqual({ status: 'healthy' });
    vi.unstubAllEnvs();
  });

  it('reports sign-in healthy once the identity provider answers', async () => {
    const result = await runHealthChecks();

    expect(result.checks.identity).toEqual({ status: 'healthy' });
    expect(mocks.checkIdentityReachable).toHaveBeenCalledTimes(1);
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ id: 'identity', observation: 'ok' }),
    );
  });

  it('marks sign-in unhealthy when the identity provider misses the probe and its retry', async () => {
    mocks.checkIdentityReachable.mockRejectedValue(new Error('503 Service Unavailable'));

    const result = await runHealthChecks();

    expect(mocks.checkIdentityReachable).toHaveBeenCalledTimes(2);
    expect(result.checks.identity).toEqual({ status: 'unhealthy', message: 'unavailable' });
    expect(result.status).toBe('degraded');
    expect(result.dependencies).toContainEqual(
      expect.objectContaining({ id: 'identity', observation: 'failing' }),
    );
  });

  it('keeps sign-in healthy when one identity probe misses and the retry answers', async () => {
    mocks.checkIdentityReachable
      .mockRejectedValueOnce(new Error('probe timed out'))
      .mockResolvedValue(undefined);

    const result = await runHealthChecks();

    expect(result.checks.identity).toEqual({ status: 'healthy' });
    expect(mocks.checkIdentityReachable).toHaveBeenCalledTimes(2);
  });

  it('gives up on an identity provider that never answers instead of holding the endpoint', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mocks.checkIdentityReachable.mockImplementation(() => new Promise(() => undefined));

    try {
      const pending = runHealthChecks();
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await pending;

      expect(result.checks.identity).toEqual({ status: 'unhealthy', message: 'unavailable' });
      expect(mocks.checkIdentityReachable).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves an unconfigured identity provider to the environment check and calls out to nothing', async () => {
    delete process.env['CLERK_SECRET_KEY'];

    const result = await runHealthChecks();

    expect(mocks.checkIdentityReachable).not.toHaveBeenCalled();
    expect(result.checks.identity).toEqual({ status: 'healthy', message: 'not configured' });
    expect(result.checks.environment.status).toBe('unhealthy');
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

describe('billing health', () => {
  const SOLD_PRICE = 'price_sold_monthly';
  const RETIRED_PRICE = 'price_retired_yearly';

  function stripeAnswering({
    inactive = [],
    apiDown = false,
  }: {
    inactive?: readonly string[];
    apiDown?: boolean;
  } = {}) {
    return {
      products: {
        list: apiDown
          ? vi.fn().mockRejectedValue(new Error('stripe unreachable'))
          : vi.fn().mockResolvedValue({ data: [] }),
      },
      prices: {
        retrieve: vi.fn(async (id: string) => ({
          id,
          active: !inactive.includes(id),
          type: 'recurring',
          recurring: { interval: 'month' },
        })),
      },
    };
  }

  beforeEach(() => {
    mocks.getConfiguredStripePriceIds.mockReturnValue([SOLD_PRICE, RETIRED_PRICE]);
    mocks.getPricePointForPriceId.mockImplementation((priceId: string) =>
      priceId === SOLD_PRICE
        ? { plan: 'basic', interval: 'monthly', currency: 'usd', envVar: 'STRIPE_PRICE_SOLD' }
        : null,
    );
  });

  it('reports billing healthy when every configured price can be sold', async () => {
    mocks.getStripeClientOrNull.mockReturnValue(stripeAnswering());

    const result = await runHealthChecks();

    expect(result.checks.stripe).toEqual({ status: 'healthy' });
  });

  it('flags a stale price no plan on sale uses without calling billing blocked', async () => {
    mocks.getStripeClientOrNull.mockReturnValue(stripeAnswering({ inactive: [RETIRED_PRICE] }));

    const result = await runHealthChecks();

    expect(result.checks.stripe).toEqual({
      status: 'unhealthy',
      message: 'unavailable',
      blocksBilling: false,
    });
  });

  it('calls billing blocked when a plan on sale has no usable price', async () => {
    mocks.getStripeClientOrNull.mockReturnValue(stripeAnswering({ inactive: [SOLD_PRICE] }));

    const result = await runHealthChecks();

    expect(result.checks.stripe).toEqual({
      status: 'unhealthy',
      message: 'unavailable',
      blocksBilling: true,
    });
  });

  it('calls billing blocked when Stripe itself does not answer', async () => {
    mocks.getStripeClientOrNull.mockReturnValue(stripeAnswering({ apiDown: true }));

    const result = await runHealthChecks();

    expect(result.checks.stripe).toEqual({
      status: 'unhealthy',
      message: 'unavailable',
      blocksBilling: true,
    });
  });
});
