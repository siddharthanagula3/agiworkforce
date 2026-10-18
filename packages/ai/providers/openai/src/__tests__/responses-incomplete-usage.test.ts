import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

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

describe('translateOpenAIResponsesStream, a truncated response still reports what it billed', () => {
  it('emits the usage carried on response.incomplete before the stop', async () => {
    const events = [
      {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        output_index: 0,
        content_index: 0,
        delta: 'partial',
      },
      {
        type: 'response.incomplete',
        response: {
          id: 'resp_1',
          incomplete_details: { reason: 'max_output_tokens' },
          usage: {
            input_tokens: 120,
            output_tokens: 64,
            input_tokens_details: { cached_tokens: 40 },
            output_tokens_details: { reasoning_tokens: 10 },
          },
        },
      },
    ] as unknown as ResponsesStreamEvent[];

    const out = await collect(translateOpenAIResponsesStream(fromArray(events)));

    expect(out.slice(-2)).toEqual([
      {
        type: 'usage',
        inputTokens: 120,
        outputTokens: 64,
        cacheReadTokens: 40,
        reasoningTokens: 10,
      },
      { type: 'stop', reason: 'max_tokens' },
    ]);
  });
});
