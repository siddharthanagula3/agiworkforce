import { randomBytes } from 'node:crypto';

export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly sampled: boolean;
}

export const TRACEPARENT_HEADER = 'traceparent';

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/u;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/u;
const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;
const TRACEPARENT_PARTS = 4;
const VERSION_PATTERN = /^[0-9a-f]{2}$/u;
const SAMPLED_FLAG = 0x01;

export function newTraceId(): string {
  return randomBytes(TRACE_ID_BYTES).toString('hex');
}

export function newSpanId(): string {
  return randomBytes(SPAN_ID_BYTES).toString('hex');
}

export function parseTraceparent(header: string | null | undefined): TraceContext | null {
  if (!header) return null;
  const parts = header.trim().toLowerCase().split('-');
  if (parts.length < TRACEPARENT_PARTS) return null;
  const [version, traceId, spanId, flags] = parts as [string, string, string, string];
  if (!VERSION_PATTERN.test(version) || version === 'ff') return null;
  if (version === '00' && parts.length !== TRACEPARENT_PARTS) return null;
  if (!TRACE_ID_PATTERN.test(traceId) || traceId === INVALID_TRACE_ID) return null;
  if (!SPAN_ID_PATTERN.test(spanId) || spanId === INVALID_SPAN_ID) return null;
  if (!VERSION_PATTERN.test(flags)) return null;
  return { traceId, spanId, sampled: (Number.parseInt(flags, 16) & SAMPLED_FLAG) === SAMPLED_FLAG };
}

export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`;
}
