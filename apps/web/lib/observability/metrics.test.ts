import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type DataPoint,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  METRIC_NAME,
  recordFailure,
  recordHttpRequest,
  recordSpanMetrics,
  recordToolOutcome,
} from './metrics';
import { withSpan } from './span';

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

afterAll(() => {
  metrics.disable();
});

beforeEach(() => {
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

type Point = DataPoint<unknown>;

async function points(name: string): Promise<Point[]> {
  const { resourceMetrics } = await reader.collect();
  return resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === name)
    .flatMap((metric) => metric.dataPoints as Point[]);
}

function countWhere(series: Point[], attributes: Record<string, unknown>): number {
  return series
    .filter((point) =>
      Object.entries(attributes).every(([key, value]) => point.attributes[key] === value),
    )
    .reduce((sum, point) => sum + (typeof point.value === 'number' ? point.value : 0), 0);
}

describe('span metrics', () => {
  it('counts every withSpan call by name, domain and outcome', async () => {
    await withSpan('unit.ok', { domain: 'tool' }, () => 'done');
    await expect(
      withSpan('unit.fail', { domain: 'tool' }, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const series = await points(METRIC_NAME.spanCount);
    expect(countWhere(series, { 'span.name': 'unit.ok', 'span.status': 'ok' })).toBe(1);
    expect(
      countWhere(series, { 'span.name': 'unit.fail', 'span.status': 'error', span_domain: 'tool' }),
    ).toBe(1);
    expect((await points(METRIC_NAME.spanDuration)).length).toBeGreaterThan(0);
  });

  it('never exports a negative duration', async () => {
    recordSpanMetrics({ name: 'clock.skew', domain: 'task', outcome: 'ok', durationMs: -5 });
    const [point] = await points(METRIC_NAME.spanDuration);
    expect((point?.value as { min?: number }).min).toBe(0);
  });
});

describe('http request metrics', () => {
  it('counts requests by status and a 5xx as an api failure', async () => {
    recordHttpRequest({ method: 'GET', statusCode: 200, durationMs: 12 });
    recordHttpRequest({ method: 'POST', statusCode: 503, durationMs: 40 });

    const requests = await points(METRIC_NAME.httpRequests);
    expect(countWhere(requests, { 'http.response.status_code': 200 })).toBe(1);
    expect(countWhere(requests, { 'http.response.status_code': 503, 'error.type': '5xx' })).toBe(1);
    const failures = await points(METRIC_NAME.failures);
    expect(countWhere(failures, { 'agi.failure.kind': 'api' })).toBe(1);
  });

  it('does not count a client error as a failure', async () => {
    recordHttpRequest({ method: 'GET', statusCode: 404, durationMs: 3 });
    expect(await points(METRIC_NAME.failures)).toHaveLength(0);
  });
});

describe('tool outcome metrics', () => {
  it('attributes a failed mcp, connector and browser call to its own failure kind', async () => {
    recordToolOutcome({ category: 'mcp', status: 'failed', durationMs: 5 });
    recordToolOutcome({ category: 'connector', status: 'failed', durationMs: 5 });
    recordToolOutcome({ category: 'computer-use', status: 'failed' });
    recordToolOutcome({ category: 'web-search', status: 'completed', durationMs: 9 });

    const failures = await points(METRIC_NAME.failures);
    expect(countWhere(failures, { 'agi.failure.kind': 'tool' })).toBe(3);
    expect(countWhere(failures, { 'agi.failure.kind': 'mcp' })).toBe(1);
    expect(countWhere(failures, { 'agi.failure.kind': 'connector' })).toBe(1);
    expect(countWhere(failures, { 'agi.failure.kind': 'browser' })).toBe(1);
    const calls = await points(METRIC_NAME.toolCalls);
    expect(countWhere(calls, { 'agi.tool.category': 'web-search' })).toBe(1);
  });

  it('files a failed device step under remote, not the tool category', async () => {
    recordToolOutcome({ category: 'filesystem', status: 'failed', remote: true });
    const failures = await points(METRIC_NAME.failures);
    expect(countWhere(failures, { 'agi.failure.kind': 'remote' })).toBe(1);
  });

  it('scrubs a secret-shaped error type before it becomes a metric attribute', async () => {
    recordFailure('worker', 'sk-live-abcdefghijklmnopqrstuvwxyz');
    const [point] = await points(METRIC_NAME.failures);
    expect(point?.attributes['error.type']).toBe('[redacted]');
  });
});
