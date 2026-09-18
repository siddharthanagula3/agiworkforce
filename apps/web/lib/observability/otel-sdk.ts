import { SpanStatusCode, metrics, type Context } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { initOpenTelemetry, type NodeClient } from '@sentry/nextjs';

import type { OtelExportConfig } from './otel-config';
import { keepSpanForExport } from './trace-sampling';

export type SentryTracingClient = NodeClient;

export interface OtelTracing {
  shutdown(): Promise<void>;
}

const FULL_SAMPLE_RATIO = 1;
const NO_INSTRUMENTATIONS = Object.freeze([]);
const NANOS_PER_MS = 1e6;
const MS_PER_SECOND = 1e3;

function durationMsOf(span: ReadableSpan): number {
  const [seconds, nanos] = span.duration;
  return seconds * MS_PER_SECOND + nanos / NANOS_PER_MS;
}

/**
 * Every span is recorded so that `onEnd` can see its status and duration, and
 * this decides there which ones are worth the exporter's budget. Filtering here
 * rather than at the sampler is what lets a failed or slow span survive a ratio
 * that would have dropped its trace at the head, where neither was knowable.
 */
export class TailBiasedSpanProcessor implements SpanProcessor {
  constructor(
    private readonly inner: SpanProcessor,
    private readonly ratio: number,
    private readonly slowThresholdMs: number,
  ) {}

  onStart(span: Span, parentContext: Context): void {
    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    const keep = keepSpanForExport({
      traceId: span.spanContext().traceId,
      errored: span.status.code === SpanStatusCode.ERROR,
      durationMs: durationMsOf(span),
      ratio: this.ratio,
      slowThresholdMs: this.slowThresholdMs,
    });
    if (!keep) return;
    this.inner.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }
}

function otlpMetricReader(config: OtelExportConfig): PeriodicExportingMetricReader {
  return new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: config.metricsEndpoint,
      headers: { ...config.headers },
    }),
  });
}

function otlpSpanProcessor(config: OtelExportConfig): SpanProcessor {
  return new TailBiasedSpanProcessor(
    new BatchSpanProcessor(
      new OTLPTraceExporter({ url: config.tracesEndpoint, headers: { ...config.headers } }),
    ),
    config.sampleRatio ?? FULL_SAMPLE_RATIO,
    config.slowSpanThresholdMs,
  );
}

/**
 * Sentry's Node SDK registers its own tracer provider and the OpenTelemetry API
 * refuses a second global registration, so when both are configured Sentry keeps
 * the provider and takes the OTLP exporter as an extra span processor. Building a
 * parallel provider here instead would leave Sentry's sampler, propagator and
 * context manager unregistered from the copy of its OpenTelemetry package that
 * Sentry itself reads.
 */
export function startOtelSdk(
  config: OtelExportConfig,
  sentryClient?: SentryTracingClient | undefined,
): OtelTracing {
  const processor = otlpSpanProcessor(config);
  const metricReader = otlpMetricReader(config);

  if (sentryClient) {
    if (!process.env['OTEL_SERVICE_NAME']) process.env['OTEL_SERVICE_NAME'] = config.serviceName;
    initOpenTelemetry(sentryClient, { spanProcessors: [processor] });
    const meterProvider = new MeterProvider({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: config.serviceName }),
      readers: [metricReader],
    });
    metrics.setGlobalMeterProvider(meterProvider);
    return {
      shutdown: async () => {
        await Promise.all([processor.shutdown(), meterProvider.shutdown()]);
      },
    };
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: config.serviceName }),
    instrumentations: [...NO_INSTRUMENTATIONS],
    sampler: new ParentBasedSampler({ root: new AlwaysOnSampler() }),
    spanProcessors: [processor],
    metricReaders: [metricReader],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}
