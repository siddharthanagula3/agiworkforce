import { formatTraceparent, getTraceContext } from './trace-context';

export const TRACEPARENT_HEADER = 'traceparent';

export function outboundTraceparent(): string | null {
  const context = getTraceContext();
  return context ? formatTraceparent(context) : null;
}
