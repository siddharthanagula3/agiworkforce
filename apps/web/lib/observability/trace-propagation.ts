import {
  formatTraceparent,
  getTraceContext,
  parseTraceparent,
  runWithTraceContext,
  type TraceContext,
} from './trace-context';

export const TRACEPARENT_HEADER = 'traceparent';

export const TRACE_CARRIER_KEY = 'traceparent';

export interface TraceCarrier {
  readonly [TRACE_CARRIER_KEY]: string;
}

export function outboundTraceparent(): string | null {
  const context = getTraceContext();
  return context ? formatTraceparent(context) : null;
}

export function traceCarrier(): TraceCarrier | null {
  const traceparent = outboundTraceparent();
  return traceparent ? { [TRACE_CARRIER_KEY]: traceparent } : null;
}

/**
 * A queued job outlives the request that enqueued it, so the trace has to travel
 * in the payload the worker reads back rather than in ambient storage.
 */
export function withTraceCarrier<T extends Record<string, unknown>>(payload: T): T {
  const carrier = traceCarrier();
  if (!carrier || TRACE_CARRIER_KEY in payload) return payload;
  return { ...payload, ...carrier };
}

export function carriedTraceContext(payload: unknown): TraceContext | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = (payload as Record<string, unknown>)[TRACE_CARRIER_KEY];
  return typeof raw === 'string' ? parseTraceparent(raw) : null;
}

export function runWithCarriedTrace<R>(payload: unknown, fn: () => R): R {
  const parent = carriedTraceContext(payload);
  return parent ? runWithTraceContext(parent, fn) : fn();
}
