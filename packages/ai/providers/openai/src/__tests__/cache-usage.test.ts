import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { translateOpenAIStream } from '../stream';
import type { OpenAIChatCompletionChunk } from '../types';
import { translateOpenAIResponsesStream } from '../stream-responses';
import type { ResponsesStreamEvent } from '../responses-types';

async function* fromArray<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe('translateOpenAIStream — cache token usage', () => {
  it('maps prompt_tokens_details.cache_write_tokens alongside cached_tokens into a usage chunk', async () => {
    const chunks = [
      {
        id: 'chatcmpl-1',
        created: 1,
        choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
      },
      {
        id: 'chatcmpl-1',
        created: 1,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 8525,
          completion_tokens: 12,
          total_tokens: 8537,
          prompt_tokens_details: { cached_tokens: 3945, cache_write_tokens: 4580 },
        },
      },
    ] as unknown as OpenAIChatCompletionChunk[];

    const out = await collect(translateOpenAIStream(fromArray(chunks)));
    const usage = out.find((c) => c.type === 'usage');
    expect(usage).toMatchObject({ cacheReadTokens: 3945, cacheWriteTokens: 4580 });
  });

  it('omits cacheWriteTokens when the wire usage never carries it', async () => {
    const chunks = [
      {
        id: 'chatcmpl-2',
        created: 1,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          prompt_tokens_details: { cached_tokens: 0 },
        },
      },
    ] as unknown as OpenAIChatCompletionChunk[];

    const out = await collect(translateOpenAIStream(fromArray(chunks)));
    const usage = out.find((c) => c.type === 'usage');
    expect(usage).not.toHaveProperty('cacheWriteTokens');
  });

  it('maps cache_write_tokens on the trailing-usage fallback path (usage arrives without a finish_reason chunk)', async () => {
    const chunks = [
      {
        id: 'chatcmpl-3',
        created: 1,
        choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
        usage: {
          prompt_tokens: 8525,
          completion_tokens: 12,
          total_tokens: 8537,
          prompt_tokens_details: { cached_tokens: 3945, cache_write_tokens: 4580 },
        },
      },
    ] as unknown as OpenAIChatCompletionChunk[];

    const out = await collect(translateOpenAIStream(fromArray(chunks)));
    const usage = out.find((c) => c.type === 'usage');
    expect(usage).toMatchObject({ cacheReadTokens: 3945, cacheWriteTokens: 4580 });
  });
});

describe('translateOpenAIResponsesStream — cache token usage', () => {
  it('maps input_tokens_details.cache_write_tokens alongside cached_tokens into a usage chunk', async () => {
    const events = [
      {
        type: 'response.completed',
        response: {
          id: 'resp_1',
          status: 'completed',
          output: [
            {
              type: 'message',
              id: 'msg_1',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'hi', annotations: [] }],
            },
          ],
          usage: {
            input_tokens: 8525,
            output_tokens: 12,
            total_tokens: 8537,
            input_tokens_details: { cache_write_tokens: 4580, cached_tokens: 3945 },
          },
        },
      },
    ] as unknown as ResponsesStreamEvent[];

    const out = await collect(translateOpenAIResponsesStream(fromArray(events)));
    const usage = out.find((c) => c.type === 'usage');
    expect(usage).toMatchObject({ cacheReadTokens: 3945, cacheWriteTokens: 4580 });
  });

  it('omits cacheWriteTokens when the wire usage never carries it', async () => {
    const events = [
      {
        type: 'response.completed',
        response: {
          id: 'resp_2',
          status: 'completed',
          output: [
            {
              type: 'message',
              id: 'msg_1',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'hi', annotations: [] }],
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
            input_tokens_details: { cached_tokens: 0 },
          },
        },
      },
    ] as unknown as ResponsesStreamEvent[];

    const out = await collect(translateOpenAIResponsesStream(fromArray(events)));
    const usage = out.find((c) => c.type === 'usage');
    expect(usage).not.toHaveProperty('cacheWriteTokens');
  });
});
