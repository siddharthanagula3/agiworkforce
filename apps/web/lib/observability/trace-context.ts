/**
 * W3C trace context for the web API surface.
 *
 * SCALE-VER-006: before this module the web app emitted structured logs with no
 * correlation field of any kind, so a single user request produced N unrelated
 * log lines across auth, model, tool, billing and provider code with nothing
 * joining them. This holds the (traceId, spanId) pair for the current async
 * chain so every emit — span records from `span.ts` and every pre-existing
 * `logger.*` call, via the pino mixin in `lib/logger.ts` — carries the same
 * `trace_id`.
 *
 * Propagation is W3C `traceparent` (https://www.w3.org/TR/trace-context/) so an
 * upstream proxy, a browser fetch, or a future OpenTelemetry SDK can join the
 * same trace without a translation layer. This file deliberately has no
 * OpenTelemetry dependency: it stores and formats ids, it does not export spans
 * to a collector. Choosing a collector/vendor is a separate decision.
 *
 * `node:async_hooks` is aliased to `shared/lib/async-hooks-stub.ts` for browser
 * bundles (see `next.config.ts`), where the stub degrades to a synchronous
 * single-slot store. Client components therefore get correct behaviour for
 * synchronous chains and no isolation guarantee beyond that — server routes,
 * the only place spans are emitted, run against the real AsyncLocalStorage.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { secureTokenHex } from '@/lib/secure-random';

export interface TraceContext {
  /** 32 lowercase hex chars, never all-zero. Shared by every span in a request. */
  readonly traceId: string;
  /** 16 lowercase hex chars, never all-zero. Identifies the innermost active span. */
  readonly spanId: string;
  /** W3C sampled flag, propagated verbatim from an inbound traceparent. */
  readonly sampled: boolean;
}

const storage = new AsyncLocalStorage<TraceContext>();

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/u;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/u;
const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);

/** Generate a fresh 32-hex-char trace id. */
export function newTraceId(): string {
  return secureTokenHex(16);
}

/** Generate a fresh 16-hex-char span id. */
export function newSpanId(): string {
  return secureTokenHex(8);
}

/** The trace context bound to the current async chain, or `null` outside one. */
export function getTraceContext(): TraceContext | null {
  return storage.getStore() ?? null;
}

/** Run `fn` with `context` bound to its async chain. */
export function runWithTraceContext<R>(context: TraceContext, fn: () => R): R {
  return storage.run(context, fn);
}

/**
 * Parse a W3C `traceparent` header.
 *
 * Returns `null` for anything that is not a well-formed, non-zero id pair in a
 * version the spec says we may read. An unparseable header must start a new
 * trace rather than poison one, because these values are attacker-controlled:
 * they arrive on a public HTTP request and end up in log fields.
 */
export function parseTraceparent(header: string | null | undefined): TraceContext | null {
  if (!header) return null;
  const parts = header.trim().toLowerCase().split('-');
  if (parts.length < 4) return null;
  const [version, traceId, spanId, flags] = parts as [string, string, string, string];
  // Version `ff` is forbidden by the spec; future versions keep the first four
  // fields, so anything else that matches the field shapes is readable.
  if (!/^[0-9a-f]{2}$/u.test(version) || version === 'ff') return null;
  if (version === '00' && parts.length !== 4) return null;
  if (!TRACE_ID_PATTERN.test(traceId) || traceId === INVALID_TRACE_ID) return null;
  if (!SPAN_ID_PATTERN.test(spanId) || spanId === INVALID_SPAN_ID) return null;
  if (!/^[0-9a-f]{2}$/u.test(flags)) return null;
  return { traceId, spanId, sampled: (Number.parseInt(flags, 16) & 0x01) === 0x01 };
}

/** Render `context` as a version-00 W3C `traceparent` header value. */
export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`;
}

/**
 * Correlation fields for the current async chain, or `{}` outside one.
 *
 * Wired as the pino `mixin` in `lib/logger.ts`, which is why every existing
 * `logger.*` call in the app gained `trace_id` without being edited.
 */
export function traceLogFields(): Record<string, string> {
  const context = storage.getStore();
  if (!context) return {};
  return { trace_id: context.traceId, span_id: context.spanId };
}
