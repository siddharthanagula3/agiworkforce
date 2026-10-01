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
import { suppressTracing, type init } from '@sentry/nextjs';

import { deploymentAttributes } from './attributes';
import type { OtelExportConfig } from './otel-config';
import { keepSpanForExport } from './trace-sampling';
import { PrivacyFilteredSpanExporter, readableSentrySpan } from './sentry-otel-export';
import { beginSpanEvents } from './span-events';

export type SentryTracingClient = NonNullable<ReturnType<typeof init>>;

export interface OtelTracing {
  shutdown(): Promise<void>;
}

// On the resource rather than per span: every span and metric the process
// exports then names the build it came from, including ones this file never sees.
function telemetryResource(serviceName: string) {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    ...deploymentAttributes(),
  });
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

class SuppressedMetricExporter extends OTLPMetricExporter {
  override export(...args: Parameters<OTLPMetricExporter['export']>): void {
    suppressTracing(() => super.export(...args));
  }
}

function otlpMetricReader(config: OtelExportConfig): PeriodicExportingMetricReader {
  return new PeriodicExportingMetricReader({
    exporter: new SuppressedMetricExporter({
      url: config.metricsEndpoint,
      headers: { ...config.headers },
    }),
  });
}

function otlpSpanProcessor(
  config: OtelExportConfig,
  exporter: PrivacyFilteredSpanExporter,
): SpanProcessor {
  return new TailBiasedSpanProcessor(
    new BatchSpanProcessor(exporter),
    config.sampleRatio ?? FULL_SAMPLE_RATIO,
    config.slowSpanThresholdMs,
  );
}

export function startOtelSdk(
  config: OtelExportConfig,
  sentryClient?: SentryTracingClient | undefined,
): OtelTracing {
  const exporter = new PrivacyFilteredSpanExporter(
    new OTLPTraceExporter({ url: config.tracesEndpoint, headers: { ...config.headers } }),
    sentryClient,
  );
  const processor = otlpSpanProcessor(config, exporter);
  const resource = telemetryResource(config.serviceName);
  if (sentryClient) {
    const unsubscribeStart = sentryClient.on('spanStart', beginSpanEvents);
    const unsubscribe = sentryClient.on('spanEnd', (span) => {
      const readable = readableSentrySpan(span, resource);
      if (readable) {
        exporter.captureContext(readable);
        processor.onEnd(readable);
      }
    });
    const meterProvider = new MeterProvider({
      resource,
      readers: [otlpMetricReader(config)],
    });
    metrics.setGlobalMeterProvider(meterProvider);
    return {
      shutdown: async () => {
        unsubscribe();
        unsubscribeStart();
        const results = await Promise.allSettled([processor.shutdown(), meterProvider.shutdown()]);
        await exporter.shutdown();
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      },
    };
  }
  const sdk = new NodeSDK({
    resource,
    autoDetectResources: false,
    instrumentations: [...NO_INSTRUMENTATIONS],
    sampler: new ParentBasedSampler({ root: new AlwaysOnSampler() }),
    spanProcessors: [processor],
    metricReaders: [otlpMetricReader(config)],
  });
  sdk.start();
  return {
    shutdown: () => sdk.shutdown(),
  };
}
