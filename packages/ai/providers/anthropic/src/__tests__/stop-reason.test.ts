/**
 * `mapStopReason` (internal to `translateAnthropicStream`) must surface every
 * Anthropic `stop_reason` as an explicit, correct `StreamChunkStop['reason']`
 * -- never silently fall back to `'end_turn'` for a reason it doesn't
 * recognize by name. `'refusal'` (streaming safety classifiers intervened,
 * see the SDK's `StopReason` JSDoc) is the case this regression-tests: it
 * must NOT be reported as a normal successful completion.
 */

import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk } from '@agiworkforce/types';

import { translateAnthropicStream } from '../stream';
import { ANTHROPIC_DEFAULT_MODEL_ID } from './model-fixtures';

type Event = Anthropic.MessageStreamEvent;

async function* fromArray(events: Event[]): AsyncIterable<Event> {
  for (const e of events) yield e;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

function messageStart(id: string): Event {
  return {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [],
      model: ANTHROPIC_DEFAULT_MODEL_ID,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 0,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    },
  } as unknown as Event;
}

describe('translateAnthropicStream — stop_reason mapping', () => {
  it('maps a refusal stop_reason to the first-class refusal outcome, not error or a silent end_turn', async () => {
    const events: Event[] = [
      messageStart('msg_refusal'),
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      } as unknown as Event,
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'I can' },
      } as unknown as Event,
      {
        type: 'message_delta',
        delta: { stop_reason: 'refusal', stop_sequence: null },
        usage: { output_tokens: 2 },
      } as unknown as Event,
      { type: 'message_stop' } as unknown as Event,
    ];

    const out = await collect(translateAnthropicStream(fromArray(events)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'refusal' });

    // Only one stop chunk -- the truncation-safety `finally` fallback must
    expect(out.filter((c) => c.type === 'stop')).toHaveLength(1);
  });

  it.each([
    ['end_turn', 'end_turn'],
    ['max_tokens', 'max_tokens'],
    ['tool_use', 'tool_use'],
    ['stop_sequence', 'stop_sequence'],
  ] as const)(
    'maps stop_reason %s to %s (unaffected by the refusal fix)',
    async (raw, expected) => {
      const events: Event[] = [
        messageStart('msg_known'),
        {
          type: 'message_delta',
          delta: { stop_reason: raw, stop_sequence: null },
          usage: { output_tokens: 1 },
        } as unknown as Event,
      ];

      const out = await collect(translateAnthropicStream(fromArray(events)));
      const stop = out.find((c) => c.type === 'stop');
      expect(stop).toEqual({ type: 'stop', reason: expected });
    },
  );

  it('documents the untouched pause_turn gap: still falls back to end_turn (tracked, not fixed here)', async () => {
    const events: Event[] = [
      messageStart('msg_pause'),
      {
        type: 'message_delta',
        delta: { stop_reason: 'pause_turn', stop_sequence: null },
        usage: { output_tokens: 1 },
      } as unknown as Event,
    ];

    const out = await collect(translateAnthropicStream(fromArray(events)));
    const stop = out.find((c) => c.type === 'stop');
    expect(stop).toEqual({ type: 'stop', reason: 'end_turn' });
  });
});
