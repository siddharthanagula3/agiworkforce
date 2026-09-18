import {
  ALLOWED_MANAGED_PROVIDER_HOSTS,
  installProviderTracer,
  streamFromProvider,
  withProviderSpan,
} from '@agiworkforce/provider-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withOutboundTraceHeader } from '@/lib/egress-policy';
import {
  TRACEPARENT_HEADER,
  carriedTraceContext,
  outboundTraceparent,
  runWithCarriedTrace,
  withTraceCarrier,
} from './trace-propagation';
import { runWithTraceContext } from './trace-context';
import { webProviderTracer } from './provider-tracer';

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

describe('queue boundary', () => {
  it('carries the enqueueing request trace in the job payload', () => {
    const payload = runWithTraceContext(CONTEXT, () =>
      withTraceCarrier({ conversationId: 'conv_1' }),
    );
    expect(payload).toMatchObject({ conversationId: 'conv_1' });
    expect(carriedTraceContext(payload)).toEqual(CONTEXT);
  });

  it('leaves a payload enqueued outside a trace alone', () => {
    const payload = withTraceCarrier({ conversationId: 'conv_1' });
    expect(payload).toEqual({ conversationId: 'conv_1' });
    expect(carriedTraceContext(payload)).toBeNull();
  });

  it('never overwrites a carrier the caller already set', () => {
    const supplied = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const payload = runWithTraceContext(CONTEXT, () => withTraceCarrier({ traceparent: supplied }));
    expect(carriedTraceContext(payload)?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
  });

  it('rejoins the enqueueing trace when the worker drains the job', () => {
    const payload = runWithTraceContext(CONTEXT, () => withTraceCarrier({ kind: 'export' }));
    const drained = runWithCarriedTrace(payload, () => outboundTraceparent());
    expect(drained).toBe(`00-${CONTEXT.traceId}-${CONTEXT.spanId}-01`);
  });

  it('runs a job with no carrier outside any trace', () => {
    expect(runWithCarriedTrace({ kind: 'export' }, () => outboundTraceparent())).toBeNull();
    expect(runWithCarriedTrace(null, () => outboundTraceparent())).toBeNull();
  });
});

describe('provider adapter span', () => {
  beforeEach(() => {
    installProviderTracer(webProviderTracer);
  });

  afterEach(() => {
    installProviderTracer(null);
  });

  it('runs the adapter call inside the request trace', async () => {
    const seen = await runWithTraceContext(CONTEXT, () =>
      withProviderSpan({ providerId: 'anthropic', operation: 'stream', model: 'a-model' }, () =>
        outboundTraceparent(),
      ),
    );
    expect(seen).not.toBeNull();
    expect(seen).toContain(CONTEXT.traceId);
    expect(seen).not.toBe(`00-${CONTEXT.traceId}-${CONTEXT.spanId}-01`);
  });

  it('sends the adapter span as the traceparent parent of the provider request', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );

    await runWithTraceContext(CONTEXT, async () => {
      for await (const _chunk of streamFromProvider({
        providerId: 'anthropic',
        authToken: 'token',
        request: { model: 'a-model' },
        clientTag: 'web',
        fetchImpl,
      })) {
        void _chunk;
      }
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const sent = new Headers(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    ).get(TRACEPARENT_HEADER);
    expect(sent).not.toBeNull();
    expect(sent).toContain(CONTEXT.traceId);
    expect(sent?.endsWith('-01')).toBe(true);
  });

  it('leaves the provider request untraced when no tracer is installed', async () => {
    installProviderTracer(null);
    const fetchImpl = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200 }));

    await runWithTraceContext(CONTEXT, async () => {
      for await (const _chunk of streamFromProvider({
        providerId: 'anthropic',
        authToken: 'token',
        request: {},
        clientTag: 'extension',
        fetchImpl,
      })) {
        void _chunk;
      }
    });

    const sent = new Headers(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    ).get(TRACEPARENT_HEADER);
    expect(sent).toBeNull();
  });
});
