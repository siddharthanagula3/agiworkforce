import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  neonQuery: vi.fn(),
  getKeyValueStore: vi.fn(),
  listAvailableManagedProviderIds: vi.fn(),
  getProviderAvailabilityMap: vi.fn(),
  readJobQueueStats: vi.fn(),
  getStripeClientOrNull: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({ query: mocks.neonQuery })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('@/lib/server/stripe-client', () => ({
  getStripeClientOrNull: mocks.getStripeClientOrNull,
}));
vi.mock('@/lib/price-tier-mapping', () => ({ getConfiguredStripePriceIds: vi.fn(() => []) }));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  listAvailableManagedProviderIds: mocks.listAvailableManagedProviderIds,
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  getProviderAvailabilityMap: mocks.getProviderAvailabilityMap,
}));
vi.mock('@/lib/jobs/job-service', () => ({ readJobQueueStats: mocks.readJobQueueStats }));

import { PRODUCTION_DEPENDENCIES } from '@/lib/config/dependency-readiness';
import {
  OBSERVABILITY_ATTRIBUTE,
  resetDeploymentAttributesCache,
} from '@/lib/observability/attributes';
import { resetLabelCardinality } from '@/lib/observability/cardinality';
import { METRIC_NAME } from '@/lib/observability/metrics';
import { DEPENDENCY_SIGNALS, dependencySignal } from '@/lib/observability/signal-coverage';

import { runHealthChecks } from '../health-check';

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

/** Every component the configuration gauge reported, and the value it reported. */
async function configurationStates(): Promise<Map<string, number>> {
  const { resourceMetrics } = await reader.collect();
  const states = new Map<string, number>();
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const metric of scope.metrics) {
      if (metric.descriptor.name !== METRIC_NAME.configurationState) continue;
      for (const point of metric.dataPoints) {
        const component = point.attributes[OBSERVABILITY_ATTRIBUTE.configurationComponent];
        if (typeof component === 'string') states.set(component, Number(point.value));
      }
    }
  }
  return states;
}

/** Every failure kind the run counted, in the order the exporter holds them. */
async function failureKinds(): Promise<string[]> {
  const { resourceMetrics } = await reader.collect();
  const kinds: string[] = [];
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const metric of scope.metrics) {
      if (metric.descriptor.name !== METRIC_NAME.failures) continue;
      for (const point of metric.dataPoints) {
        const kind = point.attributes[OBSERVABILITY_ATTRIBUTE.failureKind];
        if (typeof kind === 'string') kinds.push(kind);
      }
    }
  }
  return kinds;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLabelCardinality();
  resetDeploymentAttributesCache();
  metrics.disable();
  reader = new PeriodicExportingMetricReader({
    exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    exportIntervalMillis: 60_000,
  });
  provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);

  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.test';
  process.env['UPSTASH_REDIS_REST_TOKEN'] = 'test-token';
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = 'pk_test_health';
  process.env['CLERK_SECRET_KEY'] = 'sk_test_health';

  mocks.getKeyValueStore.mockReturnValue(null);
  mocks.getStripeClientOrNull.mockReturnValue(null);
  mocks.neonQuery.mockImplementation(async (sql: string) =>
    sql.includes('to_regclass') ? [{ missing: 0 }] : [{ '?column?': 1 }],
  );
  mocks.listAvailableManagedProviderIds.mockReturnValue(new Set<string>());
  mocks.getProviderAvailabilityMap.mockResolvedValue({});
  mocks.readJobQueueStats.mockResolvedValue([]);
});

afterEach(async () => {
  await provider.shutdown();
  metrics.disable();
});

describe('the health check reports what it resolved', () => {
  it('records one configuration state for every production dependency', async () => {
    await runHealthChecks();

    const reported = await configurationStates();
    const unreported = PRODUCTION_DEPENDENCIES.filter(
      (dependency) => !reported.has(dependency.id),
    ).map((dependency) => dependency.id);
    expect(unreported).toEqual([]);
  });

  it('separates a dependency nothing configured from one configured and failing', async () => {
    delete process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
    delete process.env['CLERK_SECRET_KEY'];
    mocks.neonQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ missing: 0 }];
      throw new Error('connection refused');
    });

    await runHealthChecks();

    const reported = await configurationStates();
    expect(reported.get('identity')).toBe(0);
    expect(reported.get('database')).toBe(-1);
  });

  it('reports a configured and answering dependency as ok', async () => {
    await runHealthChecks();

    const reported = await configurationStates();
    expect(reported.get('database')).toBe(1);
    expect(reported.get('key_value')).toBe(1);
  });

  // The registry decides which counter a fault lands on. Reading the kind from
  // it is what stops this file inventing a second answer to the same question.
  it('counts a configured dependency that will not answer under the kind the registry names', async () => {
    mocks.neonQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ missing: 0 }];
      throw new Error('connection refused');
    });

    await runHealthChecks();

    const signal = dependencySignal('database');
    expect(signal?.failureKind).toBe('database');
    expect(await failureKinds()).toContain(signal!.failureKind);
  });

  it('counts no fault for a dependency that is simply not configured', async () => {
    delete process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'];
    delete process.env['CLERK_SECRET_KEY'];

    await runHealthChecks();

    const identity = dependencySignal('identity');
    expect(identity?.failureKind).toBe('api');
    const reported = await configurationStates();
    expect(reported.get('identity')).toBe(0);
    expect(await failureKinds()).not.toContain('identity');
  });

  it('leaves a dependency the registry declares unwatched to its stated reason', async () => {
    const unwatched = DEPENDENCY_SIGNALS.filter((signal) => signal.failureKind === null);
    expect(unwatched.length).toBeGreaterThan(0);
    for (const signal of unwatched) expect(signal.why, signal.dependency).toBeTruthy();

    await runHealthChecks();

    const reported = await configurationStates();
    for (const signal of unwatched) {
      expect(reported.has(signal.dependency), signal.dependency).toBe(true);
    }
  });
});
