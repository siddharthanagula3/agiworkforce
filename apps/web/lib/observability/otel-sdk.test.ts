import { metrics } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveOtelExportConfig } from './otel-config';
import { startOtelSdk, type SentryTracingClient } from './otel-sdk';

const CLOSED_COLLECTOR = 'http://127.0.0.1:9';

afterEach(() => {
  metrics.disable();
});

describe('startOtelSdk metrics', () => {
  it('registers a meter provider beside the Sentry tracer so span counters export', async () => {
    const config = resolveOtelExportConfig({ AGI_OTEL_EXPORTER_ENDPOINT: CLOSED_COLLECTOR })!;

    const client = {
      getOptions: () => ({ dsn: 'https://publickey@ingest.example.com/1' }),
      on: vi.fn(() => () => undefined),
    };
    const tracing = startOtelSdk(config, client as unknown as SentryTracingClient);

    expect(client.on).toHaveBeenCalledWith('spanEnd', expect.any(Function));
    expect(metrics.getMeterProvider()).toBeInstanceOf(MeterProvider);
    await expect(tracing.shutdown()).resolves.toBeUndefined();
  });

  it('leaves the no-op meter in place when no collector is configured', () => {
    expect(resolveOtelExportConfig({})).toBeNull();
    expect(metrics.getMeterProvider()).not.toBeInstanceOf(MeterProvider);
  });
});
