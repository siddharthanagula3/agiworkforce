import { logger } from '@/lib/logger';
import { SPAN_DOMAIN_ATTRIBUTE, startBridgedSpan, type SpanKind } from './otel-span-bridge';
import { recordSpanMetrics } from './metrics';
import { redactAttributes, redactValue, type SpanAttributeValue } from './redact';
import { getTraceContext, runWithTraceContext, type TraceContext } from './trace-context';

export type { SpanKind };

export type SpanDomain =
  | 'approval'
  | 'billing'
  | 'database'
  | 'external'
  | 'http'
  | 'model'
  | 'queue'
  | 'retrieval'
  | 'sandbox'
  | 'task'
  | 'tool';

export interface SpanOptions {
  readonly kind?: SpanKind;
  readonly domain: SpanDomain;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ActiveSpan {
  readonly traceId: string;
  readonly spanId: string;
  setAttributes(attributes: Readonly<Record<string, unknown>>): void;
}

const DEFAULT_SPAN_KIND: SpanKind = 'internal';
const QUIET_SPAN_DOMAIN: SpanDomain = 'database';

const activeSpans = new WeakMap<TraceContext, ActiveSpan>();

export function annotateActiveSpan(attributes: Readonly<Record<string, unknown>>): void {
  const context = getTraceContext();
  if (!context) return;
  activeSpans.get(context)?.setAttributes(attributes);
}

export async function withSpan<R>(
  name: string,
  options: SpanOptions,
  fn: (span: ActiveSpan) => Promise<R> | R,
): Promise<R> {
  const parent = getTraceContext();
  const kind = options.kind ?? DEFAULT_SPAN_KIND;
  const bridged = startBridgedSpan(name, kind, parent);
  const context: TraceContext = {
    traceId: bridged.traceId,
    spanId: bridged.spanId,
    sampled: bridged.sampled,
  };
  const extra: Record<string, unknown> = {};
  const span: ActiveSpan = {
    traceId: context.traceId,
    spanId: context.spanId,
    setAttributes(attributes) {
      Object.assign(extra, attributes);
    },
  };
  activeSpans.set(context, span);

  const startedAt = Date.now();
  const emit = (status: 'ok' | 'error', error?: unknown): void => {
    const durationMs = Date.now() - startedAt;
    recordSpanMetrics({ name, domain: options.domain, outcome: status, durationMs });
    const attributes = redactAttributes({ ...options.attributes, ...extra });
    const record: Record<string, SpanAttributeValue | undefined> = {
      event: 'span',
      span_name: name,
      span_kind: kind,
      [SPAN_DOMAIN_ATTRIBUTE]: options.domain,
      trace_id: context.traceId,
      span_id: context.spanId,
      parent_span_id: parent?.spanId,
      duration_ms: durationMs,
      status,
      ...attributes,
    };
    bridged.setAttributes({ ...attributes, [SPAN_DOMAIN_ATTRIBUTE]: options.domain });
    if (status === 'error') {
      const type = error instanceof Error ? error.name : typeof error;
      const message = redactValue(error instanceof Error ? error.message : String(error));
      record['error.type'] = type;
      record['error.message'] = message;
      bridged.setError(type, message);
      bridged.end();
      logger.error(record, `span ${name} failed`);
      return;
    }
    bridged.end();
    // A line per query would dwarf every other log in production, and the span
    // still reaches the collector, where the tail processor decides.
    if (options.domain === QUIET_SPAN_DOMAIN) logger.debug(record, `span ${name}`);
    else logger.info(record, `span ${name}`);
  };

  try {
    const result = await runWithTraceContext(context, () => bridged.runWith(() => fn(span)));
    emit('ok');
    return result;
  } catch (error) {
    emit('error', error);
    throw error;
  }
}
