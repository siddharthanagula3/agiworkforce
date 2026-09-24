import { logger } from '@/lib/logger';
import { OBSERVABILITY_ATTRIBUTE } from './attributes';
import { SPAN_DOMAIN_ATTRIBUTE, startBridgedSpan, type SpanKind } from './otel-span-bridge';
import { recordSpanMetrics } from './metrics';
import { redactAttributes, redactValue, type SpanAttributeValue } from './redact';
import { getTraceContext, runWithTraceContext, type TraceContext } from './trace-context';

export type { SpanKind };

export const SPAN_DOMAINS = [
  'approval',
  'billing',
  'database',
  'external',
  'http',
  'model',
  'queue',
  'retrieval',
  'sandbox',
  'task',
  'tool',
] as const;

export type SpanDomain = (typeof SPAN_DOMAINS)[number];

export interface SpanOptions {
  readonly kind?: SpanKind;
  readonly domain: SpanDomain;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ActiveSpan {
  readonly traceId: string;
  readonly spanId: string;
  setAttributes(attributes: Readonly<Record<string, unknown>>): void;
  /**
   * The work was declined on purpose and the caller was answered normally
   * rather than raised at. Without this the span closes ok, so a refusal is
   * counted as a success and the rate of the thing failing never moves. The
   * reason comes from the caller's own closed set, never from provider text.
   */
  refuse(reason: string, detail: string): void;
}

interface SpanFailure {
  readonly type: string;
  readonly message: string;
}

const DEFAULT_SPAN_KIND: SpanKind = 'internal';
const QUIET_SPAN_DOMAIN: SpanDomain = 'database';

const activeSpans = new WeakMap<TraceContext, ActiveSpan>();

function spanLabel(value: SpanAttributeValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function annotateActiveSpan(attributes: Readonly<Record<string, unknown>>): void {
  const context = getTraceContext();
  if (!context) return;
  activeSpans.get(context)?.setAttributes(attributes);
}

/**
 * The span this call is running inside, so an operation that decides its
 * outcome deep in nested work can settle its OWN span rather than whichever
 * span happens to be active at the moment it decides.
 */
export function activeSpan(): ActiveSpan | null {
  const context = getTraceContext();
  if (!context) return null;
  return activeSpans.get(context) ?? null;
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
    ...(parent?.requestId === undefined ? {} : { requestId: parent.requestId }),
    ...(parent?.organizationId === undefined ? {} : { organizationId: parent.organizationId }),
    ...(parent?.userId === undefined ? {} : { userId: parent.userId }),
  };
  const extra: Record<string, unknown> = {};
  let refusal: SpanFailure | null = null;
  const span: ActiveSpan = {
    traceId: context.traceId,
    spanId: context.spanId,
    setAttributes(attributes) {
      Object.assign(extra, attributes);
    },
    refuse(reason, detail) {
      refusal ??= { type: reason, message: detail };
    },
  };
  activeSpans.set(context, span);

  const startedAt = Date.now();
  const emit = (status: 'ok' | 'error', failure?: SpanFailure): void => {
    const durationMs = Date.now() - startedAt;
    const attributes = redactAttributes({ ...options.attributes, ...extra });
    recordSpanMetrics({
      name,
      domain: options.domain,
      outcome: status,
      durationMs,
      provider: spanLabel(attributes[OBSERVABILITY_ATTRIBUTE.providerName]),
      model: spanLabel(attributes[OBSERVABILITY_ATTRIBUTE.requestModel]),
    });
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
    if (failure) {
      const message = redactValue(failure.message);
      record['error.type'] = failure.type;
      record['error.message'] = message;
      bridged.setError(failure.type, message);
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
    if (refusal) emit('error', refusal);
    else emit('ok');
    return result;
  } catch (error) {
    emit('error', {
      type: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
