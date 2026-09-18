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
  recordBrowserTask,
  recordFailure,
  recordHttpRequest,
  recordNotificationDelivery,
  recordQueueDepth,
  recordQueueWait,
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

describe('browser health metrics', () => {
  it('counts a browser task by status and surface', async () => {
    recordBrowserTask({ status: 'handed_off', surface: 'chrome-extension' });
    recordBrowserTask({ status: 'completed', surface: 'chrome-extension' });
    recordBrowserTask({ status: 'failed', surface: 'chrome-extension', errorType: 'browser' });

    const tasks = await points(METRIC_NAME.browserTasks);
    expect(countWhere(tasks, { 'agi.browser.status': 'handed_off' })).toBe(1);
    expect(countWhere(tasks, { 'agi.surface': 'chrome-extension' })).toBe(3);
    const failures = await points(METRIC_NAME.failures);
    expect(countWhere(failures, { 'agi.failure.kind': 'browser' })).toBe(1);
  });

  it('does not count a handed-off task as a failure', async () => {
    recordBrowserTask({ status: 'handed_off', surface: 'web' });
    expect(await points(METRIC_NAME.failures)).toHaveLength(0);
  });
});

describe('notification delivery metrics', () => {
  it('counts delivered and failed attempts per channel', async () => {
    recordNotificationDelivery({ channel: 'email', outcome: 'delivered' });
    recordNotificationDelivery({ channel: 'email', outcome: 'failed', reason: 'timeout' });
    recordNotificationDelivery({ channel: 'push_expo', outcome: 'delivered', count: 4 });

    const deliveries = await points(METRIC_NAME.notificationDeliveries);
    expect(
      countWhere(deliveries, {
        'agi.notification.channel': 'email',
        'agi.notification.outcome': 'delivered',
      }),
    ).toBe(1);
    expect(
      countWhere(deliveries, {
        'agi.notification.channel': 'push_expo',
        'agi.notification.outcome': 'delivered',
      }),
    ).toBe(4);
    const failures = await points(METRIC_NAME.failures);
    expect(countWhere(failures, { 'agi.failure.kind': 'notification' })).toBe(1);
  });

  it('records nothing for a batch with no recipients, so the ratio is not diluted', async () => {
    recordNotificationDelivery({ channel: 'push_web', outcome: 'delivered', count: 0 });
    expect(await points(METRIC_NAME.notificationDeliveries)).toHaveLength(0);
  });

  it('does not count an unconfigured transport as a failed delivery', async () => {
    recordNotificationDelivery({ channel: 'email', outcome: 'not_configured' });
    expect(await points(METRIC_NAME.failures)).toHaveLength(0);
  });
});

describe('queue metrics', () => {
  it('exports depth per queue and status, replacing the last reading', async () => {
    recordQueueDepth({ queue: 'default', status: 'queued', count: 12 });
    recordQueueDepth({ queue: 'default', status: 'running', count: 3 });
    recordQueueDepth({ queue: 'default', status: 'queued', count: 7 });

    const depth = await points(METRIC_NAME.queueDepth);
    expect(
      countWhere(depth, {
        'messaging.destination.name': 'default',
        'agi.queue.status': 'queued',
      }),
    ).toBe(7);
    expect(
      countWhere(depth, {
        'messaging.destination.name': 'default',
        'agi.queue.status': 'running',
      }),
    ).toBe(3);
  });

  it('records how long a job waited before a worker claimed it', async () => {
    recordQueueWait({ queue: 'exports', waitMs: 2_500 });
    const waits = await points(METRIC_NAME.queueWait);
    expect(waits).toHaveLength(1);
    expect(waits[0]?.attributes).toMatchObject({ 'messaging.destination.name': 'exports' });
  });

  it('floors a negative reading rather than exporting it', async () => {
    recordQueueDepth({ queue: 'dead', status: 'dead', count: -1 });
    const depth = await points(METRIC_NAME.queueDepth);
    expect(countWhere(depth, { 'agi.queue.status': 'dead' })).toBe(0);
  });
});
