import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type DataPoint,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendTransactionalEmail } from '@/lib/support/handoff/resend-client';

import { METRIC_NAME } from './metrics';

let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;
const fetchMock = vi.fn();

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
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await provider.shutdown();
});

async function deliveries(): Promise<DataPoint<unknown>[]> {
  const { resourceMetrics } = await reader.collect();
  return resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === METRIC_NAME.notificationDeliveries)
    .flatMap((metric) => metric.dataPoints as DataPoint<unknown>[]);
}

function outcomeOf(points: DataPoint<unknown>[]): unknown {
  return points[0]?.attributes['agi.notification.outcome'];
}

const message = {
  from: 'notifications@agiworkforce.com',
  to: 'person@example.com',
  subject: 'Scheduled task completed',
  text: 'body',
  html: '<p>body</p>',
};

describe('email notification delivery is measured at the send chokepoint', () => {
  it('records a delivery when the provider accepts the message', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));

    await expect(sendTransactionalEmail(message)).resolves.toMatchObject({ delivered: true });

    const points = await deliveries();
    expect(points).toHaveLength(1);
    expect(points[0]?.attributes['agi.notification.channel']).toBe('email');
    expect(outcomeOf(points)).toBe('delivered');
  });

  it('records a rejection as a failed delivery with its reason', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));

    await expect(sendTransactionalEmail(message)).resolves.toMatchObject({ delivered: false });

    const points = await deliveries();
    expect(outcomeOf(points)).toBe('failed');
    expect(points[0]?.attributes['agi.notification.reason']).toBe('rejected');
  });

  it('separates an unconfigured transport from a failed delivery', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    await sendTransactionalEmail(message);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcomeOf(await deliveries())).toBe('not_configured');
  });
});
