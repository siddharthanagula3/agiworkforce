import { ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';
import { describe, expect, it } from 'vitest';

import { withOutboundTraceHeader } from '@/lib/egress-policy';
import { TRACEPARENT_HEADER, outboundTraceparent } from './trace-propagation';
import { runWithTraceContext } from './trace-context';

const ALLOWED_HOST = [...ALLOWED_MANAGED_PROVIDER_HOSTS][0]!;
const FOREIGN_HOST = 'reader.untrusted.invalid';

const CONTEXT = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  sampled: true,
};

function headerOn(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get(TRACEPARENT_HEADER);
}

describe('outboundTraceparent', () => {
  it('is null with no ambient trace context', () => {
    expect(outboundTraceparent()).toBeNull();
  });

  it('formats the ambient context as a w3c traceparent', () => {
    const header = runWithTraceContext(CONTEXT, () => outboundTraceparent());
    expect(header).toBe(`00-${CONTEXT.traceId}-${CONTEXT.spanId}-01`);
  });

  it('reports an unsampled context in the flags', () => {
    const header = runWithTraceContext({ ...CONTEXT, sampled: false }, () => outboundTraceparent());
    expect(header?.endsWith('-00')).toBe(true);
  });
});

describe('withOutboundTraceHeader', () => {
  it('adds the header for a host the egress allowlist vouches for', () => {
    const init = runWithTraceContext(CONTEXT, () =>
      withOutboundTraceHeader(`https://${ALLOWED_HOST}/v1/messages`, { method: 'POST' }),
    );
    expect(headerOn(init)).toBe(`00-${CONTEXT.traceId}-${CONTEXT.spanId}-01`);
    expect(init?.method).toBe('POST');
  });

  it('never leaks the trace id to a host outside the allowlist', () => {
    const init = runWithTraceContext(CONTEXT, () =>
      withOutboundTraceHeader(`https://${FOREIGN_HOST}/article`),
    );
    expect(headerOn(init)).toBeNull();
  });

  it('leaves the request untouched when no trace is in flight', () => {
    const init = withOutboundTraceHeader(`https://${ALLOWED_HOST}/v1/messages`);
    expect(headerOn(init)).toBeNull();
  });

  it('keeps a traceparent the caller already set', () => {
    const supplied = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const init = runWithTraceContext(CONTEXT, () =>
      withOutboundTraceHeader(`https://${ALLOWED_HOST}/v1/messages`, {
        headers: { [TRACEPARENT_HEADER]: supplied },
      }),
    );
    expect(headerOn(init)).toBe(supplied);
  });

  it('carries the headers of a Request input through', () => {
    const request = new Request(`https://${ALLOWED_HOST}/v1/messages`, {
      headers: { 'x-caller': 'chat' },
    });
    const init = runWithTraceContext(CONTEXT, () => withOutboundTraceHeader(request));
    expect(headerOn(init)).toBe(`00-${CONTEXT.traceId}-${CONTEXT.spanId}-01`);
    expect(new Headers(init?.headers).get('x-caller')).toBe('chat');
  });
});
