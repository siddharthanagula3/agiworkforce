
import { logger } from '@/lib/logger';
import { redactAttributes, redactValue, type SpanAttributeValue } from './redact';
import { getTraceContext, newSpanId, newTraceId, runWithTraceContext } from './trace-context';

export type SpanKind = 'server' | 'client' | 'internal' | 'producer' | 'consumer';

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
  readonly kind?: SpanKind;
  readonly domain: SpanDomain;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ActiveSpan {
  readonly traceId: string;
  readonly spanId: string;
  setAttributes(attributes: Readonly<Record<string, unknown>>): void;
}

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
