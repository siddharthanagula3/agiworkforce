import {
  SpanKind as OtelSpanKind,
  SpanStatusCode,
  TraceFlags,
  context as otelContext,
  isSpanContextValid,
  trace,
  type Attributes,
  type Context,
} from '@opentelemetry/api';
import { ATTR_EXCEPTION_MESSAGE, ATTR_EXCEPTION_TYPE } from '@opentelemetry/semantic-conventions';

import { newSpanId, newTraceId, type TraceContext } from './trace-context';

export type SpanKind = 'server' | 'client' | 'internal' | 'producer' | 'consumer';

export const TRACER_NAME = 'agiworkforce.web';

export const SPAN_DOMAIN_ATTRIBUTE = 'span_domain';

const OTEL_SPAN_KIND: Record<SpanKind, OtelSpanKind> = {
  server: OtelSpanKind.SERVER,
  client: OtelSpanKind.CLIENT,
  internal: OtelSpanKind.INTERNAL,
  producer: OtelSpanKind.PRODUCER,
  consumer: OtelSpanKind.CONSUMER,
};

export interface BridgedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly sampled: boolean;
  setAttributes(attributes: Attributes): void;
  setError(type: string, message: string): void;
  end(): void;
  runWith<R>(fn: () => R): R;
}

function startContextFor(parent: TraceContext | null): Context {
  const active = otelContext.active();
  if (!parent) return active;
  const current = trace.getSpanContext(active);
  if (current && current.traceId === parent.traceId && current.spanId === parent.spanId) {
    return active;
  }
  return trace.setSpanContext(active, {
    traceId: parent.traceId,
    spanId: parent.spanId,
    traceFlags: parent.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
    isRemote: true,
  });
}

/**
 * A tracer with no SDK installed answers `startSpan` with a non-recording span
 * carrying either an all-zero context or the parent's own context, so a span id
 * that is valid and distinct from the parent's is the exact signal that the
 * SDK, not this module, owns id generation for this process.
 */
export function startBridgedSpan(
  name: string,
  kind: SpanKind,
  parent: TraceContext | null,
): BridgedSpan {
  const startContext = startContextFor(parent);
  const span = trace
    .getTracer(TRACER_NAME)
    .startSpan(name, { kind: OTEL_SPAN_KIND[kind] }, startContext);
  const spanContext = span.spanContext();
  const sdkOwnsIds = isSpanContextValid(spanContext) && spanContext.spanId !== parent?.spanId;
  const activeContext = trace.setSpan(startContext, span);

  return {
    traceId: sdkOwnsIds ? spanContext.traceId : (parent?.traceId ?? newTraceId()),
    spanId: sdkOwnsIds ? spanContext.spanId : newSpanId(),
    sampled: sdkOwnsIds
      ? (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
      : (parent?.sampled ?? true),
    setAttributes(attributes) {
      span.setAttributes(attributes);
    },
    setError(type, message) {
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      span.setAttributes({ [ATTR_EXCEPTION_TYPE]: type, [ATTR_EXCEPTION_MESSAGE]: message });
    },
    end() {
      span.end();
    },
    runWith(fn) {
      return otelContext.with(activeContext, fn);
    },
  };
}

export function recordSpanEvent(name: string, attributes: Attributes): void {
  const span = trace.getActiveSpan();
  if (!span?.isRecording()) return;
  span.addEvent(name, attributes);
}
