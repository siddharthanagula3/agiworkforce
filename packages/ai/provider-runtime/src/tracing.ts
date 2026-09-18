export const TRACEPARENT_HEADER = 'traceparent';

export interface ProviderCallDescriptor {
  readonly providerId: string;
  readonly operation: string;
  readonly model?: string | undefined;
  readonly attributes?: Readonly<Record<string, unknown>> | undefined;
}

export interface ProviderTracer {
  /** Wraps one adapter call so the turn's trace owns a span for it. */
  runInSpan<R>(call: ProviderCallDescriptor, fn: () => Promise<R> | R): Promise<R>;
  /** The W3C traceparent for the span in flight, or null outside a trace. */
  currentTraceparent(): string | null;
}

const TRACER_KEY = Symbol.for('agiworkforce.provider-runtime.tracer');

type TracerHost = typeof globalThis & { [TRACER_KEY]?: ProviderTracer };

export function installProviderTracer(tracer: ProviderTracer | null): void {
  const host = globalThis as TracerHost;
  if (tracer) {
    host[TRACER_KEY] = tracer;
    return;
  }
  delete host[TRACER_KEY];
}

export function getProviderTracer(): ProviderTracer | null {
  return (globalThis as TracerHost)[TRACER_KEY] ?? null;
}

// Only the web host has an OpenTelemetry SDK, so the span comes from whatever
// tracer the host installed and the call runs untouched when there is none.
export async function withProviderSpan<R>(
  call: ProviderCallDescriptor,
  fn: () => Promise<R> | R,
): Promise<R> {
  const tracer = getProviderTracer();
  return tracer ? tracer.runInSpan(call, fn) : fn();
}

export function traceHeaders(): Record<string, string> {
  const traceparent = getProviderTracer()?.currentTraceparent() ?? null;
  return traceparent ? { [TRACEPARENT_HEADER]: traceparent } : {};
}
