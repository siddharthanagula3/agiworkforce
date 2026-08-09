/**
 * Span emission for the web API surface.
 *
 * SCALE-VER-006 asks for model, retrieval, tool, approval, task, billing and
 * external-call spans sharing a correlation id. `withSpan` is how a call site
 * gets one: it derives a child span from whatever trace context is active,
 * binds it for the duration of the callback so nested spans and every ordinary
 * `logger.*` line inside inherit the same `trace_id`, and emits one completion
 * record with the wall duration and outcome.
 *
 * SCOPE — what this does NOT do. There is no OpenTelemetry SDK and no exporter
 * here; records land in the pino stream alongside every other log line and are
 * correlated by `trace_id` at query time. Attribute names follow OTel semantic
 * conventions (matching `lib/cost-tracker.ts` `toOtelAttributes`) so a real SDK
 * can be dropped in later without rewriting call sites, but nothing in this
 * repo ships spans to a collector today. Do not read this module as evidence
 * that distributed tracing is wired up.
 *
 * Only a completion record is emitted, not a start record. A span whose process
 * dies mid-flight therefore leaves no trace of having begun; the request-level
 * span in `withErrorHandler` is the backstop for that case only when the process
 * survives to return a response.
 */

import { logger } from '@/lib/logger';
import { redactAttributes, redactValue, type SpanAttributeValue } from './redact';
import { getTraceContext, newSpanId, newTraceId, runWithTraceContext } from './trace-context';

/** OTel span kind. `client` marks a call leaving this process. */
export type SpanKind = 'server' | 'client' | 'internal' | 'producer' | 'consumer';

/**
 * The span categories SCALE-VER-006 enumerates. Kept as a closed union so a new
 * category is a deliberate edit rather than a typo that silently splits a
 * dashboard in two.
 */
export type SpanDomain =
  | 'approval'
  | 'billing'
  | 'external'
  | 'http'
  | 'model'
  | 'retrieval'
  | 'task'
  | 'tool';

export interface SpanOptions {
  /** Defaults to `internal`. */
  readonly kind?: SpanKind;
  readonly domain: SpanDomain;
  /** Passed through `redactAttributes` before emission. */
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ActiveSpan {
  readonly traceId: string;
  readonly spanId: string;
  /**
   * Add attributes discovered while the span runs (a resolved model id, a
   * provider status code). Redacted at emission, like the initial bag.
   */
  setAttributes(attributes: Readonly<Record<string, unknown>>): void;
}

/**
 * Run `fn` inside a new span.
 *
 * The span joins the active trace when there is one and starts a new trace when
 * there is not, so a background job or a route that skipped `withErrorHandler`
 * still produces correlated records instead of nothing.
 *
 * Errors are re-thrown unchanged after the span is emitted with
 * `status: 'error'` — this is instrumentation, it must not alter control flow.
 */
export async function withSpan<R>(
  name: string,
  options: SpanOptions,
  fn: (span: ActiveSpan) => Promise<R> | R,
): Promise<R> {
  const parent = getTraceContext();
  const context = {
    traceId: parent?.traceId ?? newTraceId(),
    spanId: newSpanId(),
    sampled: parent?.sampled ?? true,
  };
  const extra: Record<string, unknown> = {};
  const span: ActiveSpan = {
    traceId: context.traceId,
    spanId: context.spanId,
    setAttributes(attributes) {
      Object.assign(extra, attributes);
    },
  };

  const startedAt = Date.now();
  const emit = (status: 'ok' | 'error', error?: unknown): void => {
    const record: Record<string, SpanAttributeValue | undefined> = {
      event: 'span',
      span_name: name,
      span_kind: options.kind ?? 'internal',
      span_domain: options.domain,
      trace_id: context.traceId,
      span_id: context.spanId,
      parent_span_id: parent?.spanId,
      duration_ms: Date.now() - startedAt,
      status,
      ...redactAttributes({ ...options.attributes, ...extra }),
    };
    if (status === 'error') {
      record['error.type'] = error instanceof Error ? error.name : typeof error;
      record['error.message'] = redactValue(error instanceof Error ? error.message : String(error));
      logger.error(record, `span ${name} failed`);
      return;
    }
    logger.info(record, `span ${name}`);
  };

  try {
    const result = await runWithTraceContext(context, () => fn(span));
    emit('ok');
    return result;
  } catch (error) {
    emit('error', error);
    throw error;
  }
}
