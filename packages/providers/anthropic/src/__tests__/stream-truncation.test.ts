/**
 * P1-2: Anthropic stream-translator must always emit a `stop` chunk so
 * downstream consumers terminate cleanly even when the SDK iterator is
 * truncated mid-stream (network drop, abort, server-side cutoff).
 *
 * Mirrors the OpenAI stream's `if (!stopEmitted) yield {type:'stop'}` tail.
 */

import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk } from '@agiworkforce/types';

import { translateAnthropicStream } from '../stream';

type Event = Anthropic.MessageStreamEvent;

async function* fromArray(events: Event[]): AsyncIterable<Event> {
  for (const e of events) yield e;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe('translateAnthropicStream — truncation safety (P1-2)', () => {
  it('emits a fallback stop chunk when the SDK iterator drains without message_delta', async () => {
    // Simulate truncation: text deltas arrive but the stream ends WITHOUT
    // a message_delta event (which is what carries `stop_reason`). The
    // translator should still yield a `stop` chunk so consumers terminate.
    const events: Event[] = [
      {
        type: 'message_start',
        message: {
          id: 'msg_x',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-opus-4.7',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 5,
            output_tokens: 0,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
          },
        },
      } as unknown as Event,
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      } as unknown as Event,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      } as unknown as Event,
      // <— stream truncates here. No message_delta, no message_stop.
    ];

    const out = await collect(translateAnthropicStream(fromArray(events)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'end_turn' });
    // The text delta still came through.
    const texts = out.filter((c) => c.type === 'text-delta');
    expect(texts).toHaveLength(1);
  });

  it('does NOT emit a duplicate stop chunk when message_delta closed the stream cleanly', async () => {
    const events: Event[] = [
      {
        type: 'message_start',
        message: {
          id: 'msg_y',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-opus-4.7',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 5,
            output_tokens: 0,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
          },
        },
      } as unknown as Event,
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 3 },
      } as unknown as Event,
      { type: 'message_stop' } as unknown as Event,
    ];
    const out = await collect(translateAnthropicStream(fromArray(events)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
  });

  it('still emits a fallback stop when the iterator throws partway through', async () => {
    async function* throwingStream(): AsyncIterable<Event> {
      yield {
        type: 'message_start',
        message: {
          id: 'msg_z',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-opus-4.7',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 5,
            output_tokens: 0,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
          },
        },
      } as unknown as Event;
      throw new Error('network drop');
    }

    const collected: StreamChunk[] = [];
    let caught: unknown = null;
    try {
      for await (const c of translateAnthropicStream(throwingStream())) {
        collected.push(c);
      }
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    // The finally block must have yielded the fallback stop chunk before
    // re-raising the upstream error.
    const stops = collected.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'end_turn' });
  });
});
