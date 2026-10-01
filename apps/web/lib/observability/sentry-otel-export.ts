import { scrubAttributes, scrubText } from '@agiworkforce/observability';
import {
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  type Attributes,
  type HrTime,
} from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import { resourceFromAttributes, type Resource } from '@opentelemetry/resources';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { spanToStaticSpanJSON, suppressTracing, type Span as SentrySpan } from '@sentry/nextjs';

import {
  scrubSpan,
  scrubTransactionEvent,
  type SpanJSON,
  type TransactionEvent,
} from '../sentry-shared';
import {
  getTraceContext,
  runWithTraceContext,
  ORGANIZATION_TRACE_ATTRIBUTE,
  type TraceContext,
} from './trace-context';
import { takeSpanEvents } from './span-events';
import type { SentryTracingClient } from './otel-sdk';

const NANOS_PER_SECOND = 1e9;
const SENTRY_SPAN_KIND: Readonly<Record<string, SpanKind>> = {
  server: SpanKind.SERVER,
  client: SpanKind.CLIENT,
  internal: SpanKind.INTERNAL,
  producer: SpanKind.PRODUCER,
  consumer: SpanKind.CONSUMER,
};

function hrTime(seconds: number): HrTime {
  const whole = Math.floor(seconds);
  return [whole, Math.round((seconds - whole) * NANOS_PER_SECOND)];
}

function seconds(time: HrTime): number {
  return time[0] + time[1] / NANOS_PER_SECOND;
}

function staticSpan(span: ReadableSpan): SpanJSON {
  return {
    description: span.name,
    data: span.attributes,
    trace_id: span.spanContext().traceId,
    span_id: span.spanContext().spanId,
    parent_span_id: span.parentSpanContext?.spanId,
    start_timestamp: seconds(span.startTime),
    timestamp: seconds(span.endTime),
    status: span.status.code === SpanStatusCode.ERROR ? 'internal_error' : 'ok',
  };
}

function scrubExportData(span: SpanJSON, data: Attributes): Attributes {
  const scrubbed = scrubSpan({ ...span, data }).data;
  const attributes: Attributes = scrubAttributes(scrubbed);
  for (const [key, value] of Object.entries(scrubbed)) {
    if (Array.isArray(value)) {
      attributes[key] = value.map((entry) =>
        typeof entry === 'string' ? scrubText(entry) : entry,
      ) as Attributes[string];
    }
  }
  return attributes;
}

async function filterSpan(
  span: ReadableSpan,
  client?: SentryTracingClient,
): Promise<ReadableSpan | null> {
  const serialized = scrubSpan(staticSpan(span));
  const event: TransactionEvent = {
    type: 'transaction',
    transaction: serialized.description,
    start_timestamp: serialized.start_timestamp,
    timestamp: serialized.timestamp,
    contexts: {
      trace: {
        trace_id: serialized.trace_id,
        span_id: serialized.span_id,
        parent_span_id: serialized.parent_span_id,
        status: serialized.status,
        data: serialized.data,
      },
    },
    spans: [serialized],
  };
  const scrubbed = scrubTransactionEvent(event);
  if (!scrubbed) return null;
  const policy = client?.getOptions().beforeSendTransaction;
  const decision = policy ? await policy(scrubbed, {}) : scrubbed;
  const approved = decision ? scrubTransactionEvent(decision) : null;
  const filtered = approved?.spans?.[0];
  if (!approved || !filtered) return null;
  const attributes = {
    ...filtered.data,
    ...approved.contexts?.trace?.data,
  };
  delete attributes[ORGANIZATION_TRACE_ATTRIBUTE];
  return {
    ...span,
    spanContext: () => span.spanContext(),
    name: scrubText(filtered.description ?? span.name),
    attributes: scrubExportData(filtered, { ...attributes, ...approved.tags }),
    status: {
      ...span.status,
      ...(span.status.message ? { message: scrubText(span.status.message) } : {}),
    },
    resource: resourceFromAttributes(scrubExportData(filtered, span.resource.attributes)),
    links: span.links.map((link) => ({
      ...link,
      attributes: scrubExportData(filtered, link.attributes ?? {}),
    })),
    events: span.events.map((event) => ({
      ...event,
      name: scrubText(event.name),
      attributes: scrubExportData(filtered, event.attributes ?? {}),
    })),
  };
}

export class PrivacyFilteredSpanExporter implements SpanExporter {
  private readonly contexts = new WeakMap<ReadableSpan, TraceContext>();
  private closed = false;
  private shutdownPromise: Promise<void> | undefined;

  constructor(
    private readonly inner: SpanExporter,
    private readonly client?: SentryTracingClient,
  ) {}

  captureContext(span: ReadableSpan): void {
    const current = getTraceContext();
    const context = span.spanContext();
    this.contexts.set(span, {
      traceId: context.traceId,
      spanId: context.spanId,
      sampled: (context.traceFlags & TraceFlags.SAMPLED) !== 0,
      ...(current?.requestId === undefined ? {} : { requestId: current.requestId }),
      ...(current?.organizationId === undefined ? {} : { organizationId: current.organizationId }),
      ...(current?.userId === undefined ? {} : { userId: current.userId }),
    });
  }

  export(spans: ReadableSpan[], callback: Parameters<SpanExporter['export']>[1]): void {
    if (this.closed) {
      callback({ code: ExportResultCode.FAILED, error: new Error('Trace exporter is closed') });
      return;
    }
    let completed = false;
    const complete: typeof callback = (result) => {
      if (completed) return;
      completed = true;
      callback(result);
    };
    void Promise.all(
      spans.map((span) => {
        const captured = this.contexts.get(span);
        return captured
          ? runWithTraceContext(captured, () => filterSpan(span, this.client))
          : filterSpan(span, this.client);
      }),
    )
      .then((filtered) => {
        if (this.closed) {
          complete({ code: ExportResultCode.FAILED, error: new Error('Trace exporter is closed') });
          return;
        }
        const allowed = filtered.filter((span): span is ReadableSpan => span !== null);
        if (allowed.length === 0) complete({ code: ExportResultCode.SUCCESS });
        else suppressTracing(() => this.inner.export(allowed, complete));
      })
      .catch(() => {
        complete({ code: ExportResultCode.FAILED, error: new Error('Trace export refused') });
      });
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }

  shutdown(): Promise<void> {
    this.closed = true;
    return (this.shutdownPromise ??= this.inner.shutdown());
  }
}

export function readableSentrySpan(span: SentrySpan, resource: Resource): ReadableSpan | null {
  const recorded = takeSpanEvents(span);
  const context = span.spanContext();
  if ((context.traceFlags & TraceFlags.SAMPLED) === 0) return null;
  const json = spanToStaticSpanJSON(span);
  if (!Number.isFinite(json.start_timestamp) || !Number.isFinite(json.timestamp)) return null;
  const end = json.timestamp!;
  if (end < json.start_timestamp) return null;
  const attributes = scrubExportData(json, json.data);
  return {
    name: json.description ?? '',
    kind: SENTRY_SPAN_KIND[String(json.data['sentry.kind'])] ?? SpanKind.INTERNAL,
    spanContext: () => context,
    ...(json.parent_span_id
      ? { parentSpanContext: { ...context, spanId: json.parent_span_id } }
      : {}),
    startTime: hrTime(json.start_timestamp),
    endTime: hrTime(end),
    duration: hrTime(end - json.start_timestamp),
    status: {
      code:
        json.status === 'ok'
          ? SpanStatusCode.OK
          : json.status
            ? SpanStatusCode.ERROR
            : SpanStatusCode.UNSET,
    },
    attributes,
    links: (json.links ?? []).map((link) => ({
      context: {
        traceId: link.trace_id,
        spanId: link.span_id,
        traceFlags: link.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
      },
      attributes: scrubExportData(json, link.attributes ?? {}),
    })),
    events: recorded.events,
    ended: true,
    resource,
    instrumentationScope: { name: '@sentry/nextjs' },
    droppedAttributesCount: 0,
    droppedEventsCount: recorded.dropped,
    droppedLinksCount: 0,
  };
}
