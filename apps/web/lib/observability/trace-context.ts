import { secureTokenHex } from '@/lib/secure-random';

export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly sampled: boolean;
  organizationId?: string;
  userId?: string;
}

export interface TenantScope {
  organizationId?: string;
  userId?: string;
}

export interface TraceStorage {
  getStore(): TraceContext | undefined;
  run<R>(store: TraceContext, fn: () => R): R;
}

const STORAGE_KEY = Symbol.for('agiworkforce.trace-context.storage');

type StorageHost = typeof globalThis & { [STORAGE_KEY]?: TraceStorage };

export function installTraceStorage(candidate: TraceStorage): void {
  (globalThis as StorageHost)[STORAGE_KEY] = candidate;
}

function storageOrNull(): TraceStorage | null {
  return (globalThis as StorageHost)[STORAGE_KEY] ?? null;
}

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/u;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/u;
const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);

export function newTraceId(): string {
  return secureTokenHex(16);
}

export function newSpanId(): string {
  return secureTokenHex(8);
}

export function getTraceContext(): TraceContext | null {
  return storageOrNull()?.getStore() ?? null;
}

export function runWithTraceContext<R>(context: TraceContext, fn: () => R): R {
  const storage = storageOrNull();
  return storage ? storage.run(context, fn) : fn();
}

export function parseTraceparent(header: string | null | undefined): TraceContext | null {
  if (!header) return null;
  const parts = header.trim().toLowerCase().split('-');
  if (parts.length < 4) return null;
  const [version, traceId, spanId, flags] = parts as [string, string, string, string];
  if (!/^[0-9a-f]{2}$/u.test(version) || version === 'ff') return null;
  if (version === '00' && parts.length !== 4) return null;
  if (!TRACE_ID_PATTERN.test(traceId) || traceId === INVALID_TRACE_ID) return null;
  if (!SPAN_ID_PATTERN.test(spanId) || spanId === INVALID_SPAN_ID) return null;
  if (!/^[0-9a-f]{2}$/u.test(flags)) return null;
  return { traceId, spanId, sampled: (Number.parseInt(flags, 16) & 0x01) === 0x01 };
}

export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`;
}

export function traceLogFields(): Record<string, string> {
  const context = storageOrNull()?.getStore();
  if (!context) return {};
  const fields: Record<string, string> = { trace_id: context.traceId, span_id: context.spanId };
  if (context.organizationId) fields['organization_id'] = context.organizationId;
  if (context.userId) fields['user_id'] = context.userId;
  return fields;
}

export function setTenantScope(scope: TenantScope): void {
  const context = storageOrNull()?.getStore();
  if (!context) return;
  if (scope.organizationId) context.organizationId = scope.organizationId;
  if (scope.userId) context.userId = scope.userId;
}

export function getTenantScope(): TenantScope {
  const context = storageOrNull()?.getStore();
  return { organizationId: context?.organizationId, userId: context?.userId };
}
