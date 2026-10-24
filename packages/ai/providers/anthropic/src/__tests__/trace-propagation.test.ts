import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, propagation, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { getModelsForProvider } from '@agiworkforce/types';

import { createAnthropicAdapter } from '../index';

const model = getModelsForProvider('anthropic')[0];

if (!model) {
  throw new Error('The catalogue must hold an Anthropic model');
}

const contextManager = new AsyncLocalStorageContextManager();

function sse(events: object[]): string {
  return events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join('');
}

function streamResponse(): Response {
  return new Response(
    sse([
      {
        type: 'message_start',
        message: {
          id: 'msg_trace',
          type: 'message',
          role: 'assistant',
          content: [],
          model: model!.id,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 1 },
      },
      { type: 'message_stop' },
    ]),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

describe('Anthropic adapter trace context', () => {
  beforeEach(() => {
    context.setGlobalContextManager(contextManager.enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  });

  afterEach(() => {
    propagation.disable();
    context.disable();
  });

  it('sends no trace context headers to the provider while the host traces the request', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      streamResponse(),
    );
    const adapter = createAnthropicAdapter({
      apiKey: 'test-key',
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const active = trace.setSpanContext(context.active(), {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: TraceFlags.SAMPLED,
    });
    const carrier: Record<string, string> = {};
    propagation.inject(active, carrier);
    expect(carrier.traceparent).toBeDefined();

    await context.with(active, async () => {
      for await (const _chunk of adapter.stream(
        { model: model.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
        new AbortController().signal,
      )) {
        void _chunk;
      }
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetch.mock.calls[0]![1]!.headers);
    expect(headers.get('traceparent')).toBeNull();
    expect(headers.get('tracestate')).toBeNull();
    expect(headers.get('baggage')).toBeNull();
  });
});
