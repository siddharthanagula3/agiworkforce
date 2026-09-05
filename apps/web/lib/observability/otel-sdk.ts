import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { initOpenTelemetry, type NodeClient } from '@sentry/nextjs';

import type { OtelExportConfig } from './otel-config';

export type SentryTracingClient = NodeClient;

export interface OtelTracing {
  shutdown(): Promise<void>;
}

const FULL_SAMPLE_RATIO = 1;
const NO_INSTRUMENTATIONS = Object.freeze([]);

function otlpSpanProcessor(config: OtelExportConfig): SpanProcessor {
  return new BatchSpanProcessor(
    new OTLPTraceExporter({ url: config.tracesEndpoint, headers: { ...config.headers } }),
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

  if (sentryClient) {
    if (!process.env['OTEL_SERVICE_NAME']) process.env['OTEL_SERVICE_NAME'] = config.serviceName;
    initOpenTelemetry(sentryClient, { spanProcessors: [processor] });
    return { shutdown: () => processor.shutdown() };
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: config.serviceName }),
    instrumentations: [...NO_INSTRUMENTATIONS],
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(config.sampleRatio ?? FULL_SAMPLE_RATIO),
    }),
    spanProcessors: [processor],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}
