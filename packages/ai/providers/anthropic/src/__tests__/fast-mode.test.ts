import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { getModelsForProvider, type StreamChunk } from '@agiworkforce/types';

import { ANTHROPIC_FAST_MODE_BETA, createAnthropicAdapter } from '../index';
import { translateAnthropicStream } from '../stream';
import { translateChatRequest } from '../translate';

const fastModel = getModelsForProvider('anthropic').find((model) => model.fastTier);
const standardModel = getModelsForProvider('anthropic').find((model) => !model.fastTier);

if (!fastModel || !standardModel) {
  throw new Error('The catalogue must hold an Anthropic model with and without a fast tier');
}

const message = { role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] };

function sse(events: object[]): string {
  return events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join('');
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

describe('Anthropic fast mode', () => {
  it('sends speed fast only to a model with a fast tier', () => {
    expect(
      translateChatRequest({ model: fastModel.id, messages: [message], speed: 'fast' }).speed,
    ).toBe('fast');
    expect(
      translateChatRequest({ model: fastModel.id, messages: [message] }).speed,
    ).toBeUndefined();
    expect(() =>
      translateChatRequest({ model: standardModel.id, messages: [message], speed: 'fast' }),
    ).toThrow(/no fast output tier/);
  });

  it('reports the speed the provider says served the call', async () => {
    async function* events(): AsyncIterable<Anthropic.MessageStreamEvent> {
      yield {
        type: 'message_start',
        message: {
          id: 'msg_fast',
          type: 'message',
          role: 'assistant',
          content: [],
          model: fastModel!.id,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0, speed: 'fast' },
        },
      } as unknown as Anthropic.MessageStreamEvent;
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5 },
      } as unknown as Anthropic.MessageStreamEvent;
    }
    const usage = (await collect(translateAnthropicStream(events()))).find(
      (chunk) => chunk.type === 'usage',
    );
    expect(usage).toMatchObject({ type: 'usage', speed: 'fast' });
  });

  it('adds the fast mode beta to the call and keeps the configured betas', async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          sse([
            {
              type: 'message_start',
              message: {
                id: 'msg_fast',
                type: 'message',
                role: 'assistant',
                content: [],
                model: fastModel.id,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 10, output_tokens: 0, speed: 'fast' },
              },
            },
            {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn', stop_sequence: null },
              usage: { output_tokens: 5 },
            },
            { type: 'message_stop' },
          ]),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const adapter = createAnthropicAdapter({
      apiKey: 'test-key',
      fetch: fetch as unknown as typeof globalThis.fetch,
      betaFeatures: ['context-management-2025-06-27'],
    });

    await collect(
      adapter.stream(
        { model: fastModel.id, messages: [message], speed: 'fast' },
        new AbortController().signal,
      ),
    );

    const init = fetch.mock.calls[0]![1]!;
    const beta = new Headers(init.headers).get('anthropic-beta') ?? '';
    expect(beta.split(',')).toEqual(['context-management-2025-06-27', ANTHROPIC_FAST_MODE_BETA]);
    expect(JSON.parse(String(init.body))).toMatchObject({ speed: 'fast' });
  });
});
