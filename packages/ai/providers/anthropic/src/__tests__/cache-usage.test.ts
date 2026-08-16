
import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk } from '@agiworkforce/types';

import { translateAnthropicStream } from '../stream';
import { ANTHROPIC_PREMIUM_MODEL_ID } from './model-fixtures';

type Event = Anthropic.MessageStreamEvent;

async function* fromArray(events: Event[]): AsyncIterable<Event> {
  for (const e of events) yield e;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

function findUsageChunk(chunks: StreamChunk[]): Extract<StreamChunk, { type: 'usage' }> {
  const usage = chunks.find((c) => c.type === 'usage');
  if (!usage || usage.type !== 'usage') throw new Error('no usage chunk emitted');
  return usage;
}

describe('translateAnthropicStream — 1h/5m cache-write split', () => {
  it('surfaces cacheWrite1hTokens when the response mixes 5m and 1h breakpoints', async () => {
    const events: Event[] = [
      {
        type: 'message_start',
        message: {
          id: 'msg_a',
          type: 'message',
          role: 'assistant',
          content: [],
          model: ANTHROPIC_PREMIUM_MODEL_ID,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 100,
            output_tokens: 0,
            cache_creation_input_tokens: 900,
            cache_read_input_tokens: 200,
            cache_creation: {
              ephemeral_1h_input_tokens: 600,
              ephemeral_5m_input_tokens: 300,
            },
          },
        },
      } as unknown as Event,
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 42 },
      } as unknown as Event,
    ];

    const out = await collect(translateAnthropicStream(fromArray(events)));
    const usage = findUsageChunk(out);
    expect(usage.cacheWriteTokens).toBe(900);
    expect(usage.cacheWrite1hTokens).toBe(600);
    expect(usage.cacheReadTokens).toBe(200);
  });

  it('omits cacheWrite1hTokens when the vendor response has no cache_creation breakdown', async () => {
    const events: Event[] = [
      {
        type: 'message_start',
        message: {
          id: 'msg_b',
          type: 'message',
          role: 'assistant',
          content: [],
          model: ANTHROPIC_PREMIUM_MODEL_ID,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 100,
            output_tokens: 0,
            cache_creation_input_tokens: 300,
            cache_read_input_tokens: 0,
          },
        },
      } as unknown as Event,
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 10 },
      } as unknown as Event,
    ];

    const out = await collect(translateAnthropicStream(fromArray(events)));
    const usage = findUsageChunk(out);
    expect(usage.cacheWriteTokens).toBe(300);
    expect(usage.cacheWrite1hTokens).toBeUndefined();
  });

  it('omits all cache fields when the request has no caching at all', async () => {
    const events: Event[] = [
      {
        type: 'message_start',
        message: {
          id: 'msg_c',
          type: 'message',
          role: 'assistant',
          content: [],
          model: ANTHROPIC_PREMIUM_MODEL_ID,
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 50,
            output_tokens: 0,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
          },
        },
      } as unknown as Event,
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5 },
      } as unknown as Event,
    ];

    const out = await collect(translateAnthropicStream(fromArray(events)));
    const usage = findUsageChunk(out);
    expect(usage.cacheWriteTokens).toBeUndefined();
    expect(usage.cacheWrite1hTokens).toBeUndefined();
    expect(usage.cacheReadTokens).toBeUndefined();
  });
});
