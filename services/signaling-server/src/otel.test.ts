import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SERVICE_NAME,
  DEFAULT_SLOW_SPAN_THRESHOLD_MS,
  keepSpanForExport,
  resolveOtelExportConfig,
  traceIdInRatio,
} from './otel-config.js';
import { shutdownOtel, spanTraceparent, startOtel, startSpan } from './otel.js';
import { formatTraceparent, parseTraceparent } from './trace-context.js';

const ENDPOINT = 'https://collector.example.invalid';
const INBOUND = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const ALWAYS_KEPT_INTERVAL_MS = 3_600_000;

interface CapturedPost {
  url: string;
  body: unknown;
}

function envWith(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { AGI_OTEL_EXPORTER_ENDPOINT: ENDPOINT, ...extra } as NodeJS.ProcessEnv;
}

describe('resolveOtelExportConfig', () => {
  it('is null without an endpoint, so the service runs untraced', () => {
    expect(resolveOtelExportConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('derives both signal endpoints from the one collector url', () => {
    const config = resolveOtelExportConfig(envWith());
    expect(config?.tracesEndpoint).toBe(`${ENDPOINT}/v1/traces`);
    expect(config?.metricsEndpoint).toBe(`${ENDPOINT}/v1/metrics`);
    expect(config?.serviceName).toBe(DEFAULT_SERVICE_NAME);
    expect(config?.slowSpanThresholdMs).toBe(DEFAULT_SLOW_SPAN_THRESHOLD_MS);
  });

  it('reads the same headers and ratio envs as the web tier', () => {
    const config = resolveOtelExportConfig(
      envWith({ AGI_OTEL_HEADERS: 'x-key=secret-value', AGI_OTEL_SAMPLE_RATIO: '0.25' }),
    );
    expect(config?.headers).toEqual({ 'x-key': 'secret-value' });
    expect(config?.sampleRatio).toBe(0.25);
  });
});

describe('keepSpanForExport', () => {
  const dropped = '0'.repeat(31) + '1';

  it('keeps a failed span the ratio would have dropped', () => {
    expect(traceIdInRatio(dropped, 0)).toBe(false);
    expect(
      keepSpanForExport({
        traceId: dropped,
        errored: true,
        durationMs: 1,
        ratio: 0,
        slowThresholdMs: DEFAULT_SLOW_SPAN_THRESHOLD_MS,
      }),
    ).toBe(true);
  });

  it('keeps a slow span the ratio would have dropped', () => {
    expect(
      keepSpanForExport({
        traceId: dropped,
        errored: false,
        durationMs: DEFAULT_SLOW_SPAN_THRESHOLD_MS,
        ratio: 0,
        slowThresholdMs: DEFAULT_SLOW_SPAN_THRESHOLD_MS,
      }),
    ).toBe(true);
  });

  it('drops a fast, healthy span outside the ratio', () => {
    expect(
      keepSpanForExport({
        traceId: dropped,
        errored: false,
        durationMs: 1,
        ratio: 0,
        slowThresholdMs: DEFAULT_SLOW_SPAN_THRESHOLD_MS,
      }),
    ).toBe(false);
  });

  it('keys the baseline share off the trace id, so one trace is kept whole', () => {
    const traceId = 'a'.repeat(32);
    expect(traceIdInRatio(traceId, 1)).toBe(traceIdInRatio(traceId, 1));
    expect(traceIdInRatio('0'.repeat(32), 0.5)).toBe(true);
    expect(traceIdInRatio('f'.repeat(32), 0.5)).toBe(false);
  });
});

describe('signaling-server otel pipeline', () => {
  let posts: CapturedPost[];

  beforeEach(() => {
    posts = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return new Response('', { status: 200 });
      }),
    );
  });

  afterEach(async () => {
    await shutdownOtel();
    vi.unstubAllGlobals();
  });

  it('does not start without a collector endpoint', () => {
    expect(startOtel({} as NodeJS.ProcessEnv)).toBe(false);
    expect(spanTraceparent(startSpan('noop', 'server', null))).toBeNull();
  });

  it('continues an inbound trace rather than starting a new one', async () => {
    expect(startOtel(envWith(), ALWAYS_KEPT_INTERVAL_MS)).toBe(true);
    const parent = parseTraceparent(INBOUND);
    expect(parent).not.toBeNull();

    const span = startSpan('GET /health', 'server', parent);
    expect(span.context.traceId).toBe(parent?.traceId);
    expect(span.context.spanId).not.toBe(parent?.spanId);
    expect(spanTraceparent(span)).toBe(formatTraceparent(span.context));

    span.setAttributes({ 'http.response.status_code': 500 });
    span.end('error');
    await shutdownOtel();

    const traces = posts.find((post) => post.url.endsWith('/v1/traces'));
    expect(traces).toBeDefined();
    const [exported] = (
      traces?.body as {
        resourceSpans: [{ scopeSpans: [{ spans: Record<string, unknown>[] }] }];
      }
    ).resourceSpans[0].scopeSpans[0].spans;
    expect(exported?.['traceId']).toBe(parent?.traceId);
    expect(exported?.['parentSpanId']).toBe(parent?.spanId);
    expect(exported?.['name']).toBe('GET /health');
    expect(exported?.['status']).toEqual({ code: 2 });
  });

  it('exports service-name-tagged metrics to the shared collector', async () => {
    expect(startOtel(envWith({ AGI_OTEL_SERVICE_NAME: 'signal-a' }), ALWAYS_KEPT_INTERVAL_MS)).toBe(
      true,
    );
    await shutdownOtel();

    const metricsPost = posts.find((post) => post.url.endsWith('/v1/metrics'));
    expect(metricsPost).toBeDefined();
    const payload = metricsPost?.body as {
      resourceMetrics: [
        {
          resource: { attributes: { key: string; value: { stringValue: string } }[] };
          scopeMetrics: [{ metrics: { name: string }[] }];
        },
      ];
    };
    expect(payload.resourceMetrics[0].resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'signal-a' },
    });
    const names = payload.resourceMetrics[0].scopeMetrics[0].metrics.map((metric) => metric.name);
    expect(names).toContain('signaling.connections.active');
    expect(names).toContain('signaling.errors');
    expect(names).toContain('signaling.pairing.requests');
  });
});
