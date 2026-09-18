import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type DataPoint,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const logged = vi.hoisted(() => ({
  info: [] as string[],
  debug: [] as string[],
  error: [] as string[],
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (_record: unknown, message: string) => logged.info.push(message),
    debug: (_record: unknown, message: string) => logged.debug.push(message),
    error: (_record: unknown, message: string) => logged.error.push(message),
    warn: () => undefined,
  },
}));

import { METRIC_NAME } from './metrics';
import { traceDatabaseAdapter, withDatabaseSpan } from './database-span';
import { outboundTraceparent } from './trace-propagation';
import { runWithTraceContext } from './trace-context';

const CONTEXT = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  sampled: true,
};

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

afterAll(() => {
  metrics.disable();
});

beforeEach(() => {
  logged.info.length = 0;
  logged.debug.length = 0;
  logged.error.length = 0;
  metrics.disable();
  reader = new PeriodicExportingMetricReader({
    exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
    exportIntervalMillis: 60_000,
  });
  provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);
});

afterEach(async () => {
  await provider.shutdown();
});

async function points(name: string): Promise<DataPoint<unknown>[]> {
  const { resourceMetrics } = await reader.collect();
  return resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === name)
    .flatMap((metric) => metric.dataPoints as DataPoint<unknown>[]);
}

describe('withDatabaseSpan', () => {
  it('runs the query inside the caller trace and returns its result', async () => {
    let seen: string | null = null;
    const rows = await runWithTraceContext(CONTEXT, () =>
      withDatabaseSpan({ operation: 'select', table: 'background_jobs' }, () => {
        seen = outboundTraceparent();
        return ['row'];
      }),
    );

    expect(rows).toEqual(['row']);
    expect(seen).toContain(CONTEXT.traceId);
    expect(seen).not.toBe(`00-${CONTEXT.traceId}-${CONTEXT.spanId}-01`);
  });

  it('records latency and outcome for a successful query', async () => {
    await withDatabaseSpan({ operation: 'select' }, async () => 'ok');

    const counted = await points(METRIC_NAME.databaseOperations);
    expect(counted).toHaveLength(1);
    expect(counted[0]?.attributes).toMatchObject({
      'db.operation.name': 'select',
      'db.operation.outcome': 'ok',
    });
    expect(await points(METRIC_NAME.databaseDuration)).toHaveLength(1);
    expect(await points(METRIC_NAME.failures)).toHaveLength(0);
  });

  it('logs a successful query below info, so a query per request cannot flood the log', async () => {
    await withDatabaseSpan({ operation: 'select' }, async () => 'ok');

    expect(logged.info).toEqual([]);
    expect(logged.debug).toEqual(['span db.select']);
  });

  it('rethrows and counts a failed query as a database failure', async () => {
    await expect(
      withDatabaseSpan({ operation: 'insert' }, async () => {
        throw new Error('deadlock detected');
      }),
    ).rejects.toThrow('deadlock detected');

    const counted = await points(METRIC_NAME.databaseOperations);
    expect(counted[0]?.attributes).toMatchObject({ 'db.operation.outcome': 'error' });
    const failures = await points(METRIC_NAME.failures);
    expect(failures[0]?.attributes).toMatchObject({
      'agi.failure.kind': 'database',
      'error.type': 'Error',
    });
    expect(logged.error).toEqual(['span db.insert failed']);
  });
});

function fakeAdapter(): DatabaseAdapter {
  const adapter: DatabaseAdapter = {
    query: async <T>() => [] as T[],
    execute: async () => 0,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(adapter),
    withUser: () => adapter,
    withOrg: () => adapter,
    dispose: async () => {},
  };
  return adapter;
}

describe('traceDatabaseAdapter', () => {
  it('names the operation and the table from the statement', async () => {
    await traceDatabaseAdapter(fakeAdapter()).query(
      'select id from public.background_jobs where queue = $1',
      ['notifications'],
    );

    const counted = await points(METRIC_NAME.databaseOperations);
    expect(counted[0]?.attributes).toMatchObject({
      'db.operation.name': 'select',
      'db.operation.outcome': 'ok',
    });
  });

  it('collapses a statement it cannot name into one bucket', async () => {
    await traceDatabaseAdapter(fakeAdapter()).execute('explain analyze select 1');

    const counted = await points(METRIC_NAME.databaseOperations);
    expect(counted[0]?.attributes).toMatchObject({ 'db.operation.name': 'other' });
  });

  it('keeps tracing the adapters a scope or a transaction hands back', async () => {
    const traced = traceDatabaseAdapter(fakeAdapter()).withUser('jwt').withOrg(null);
    await traced.transaction((tx) =>
      tx.execute('delete from public.sessions where id = $1', ['s']),
    );

    const names = (await points(METRIC_NAME.databaseOperations)).map(
      (point) => point.attributes['db.operation.name'],
    );
    expect(names).toContain('transaction');
    expect(names).toContain('delete');
  });
});
