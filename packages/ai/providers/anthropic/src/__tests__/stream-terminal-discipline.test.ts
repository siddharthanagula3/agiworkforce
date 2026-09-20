import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk } from '@agiworkforce/types';

import { translateAnthropicStream } from '../stream';

type MessageStreamEvent = Anthropic.MessageStreamEvent;

async function* fromArray(events: MessageStreamEvent[]): AsyncIterable<MessageStreamEvent> {
  for (const event of events) yield event;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const item of stream) out.push(item);
  return out;
}

const MESSAGE_START = {
  type: 'message_start',
  message: { usage: { input_tokens: 12 } },
} as unknown as MessageStreamEvent;

function textDelta(text: string): MessageStreamEvent {
  return {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text },
  } as unknown as MessageStreamEvent;
}

function messageDelta(stopReason: string, outputTokens: number): MessageStreamEvent {
  return {
    type: 'message_delta',
    delta: { stop_reason: stopReason },
    usage: { output_tokens: outputTokens },
  } as unknown as MessageStreamEvent;
}

describe('translateAnthropicStream terminal discipline', () => {
  it('ends a clean turn with usage then a single stop', async () => {
    const out = await collect(
      translateAnthropicStream(
        fromArray([
          MESSAGE_START,
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          } as unknown as MessageStreamEvent,
          textDelta('Answer.'),
          messageDelta('end_turn', 3),
          { type: 'message_stop' } as unknown as MessageStreamEvent,
        ]),
      ),
    );

    expect(out.map((c) => c.type)).toEqual(['text-delta', 'usage', 'stop']);
    expect(out[1]).toMatchObject({ inputTokens: 12, outputTokens: 3 });
    expect(out[2]).toEqual({ type: 'stop', reason: 'end_turn' });
  });

  it('emits one stop when the upstream repeats its message delta', async () => {
    const out = await collect(
      translateAnthropicStream(
        fromArray([MESSAGE_START, messageDelta('end_turn', 3), messageDelta('max_tokens', 4)]),
      ),
    );

    expect(out.filter((c) => c.type === 'stop')).toHaveLength(1);
    expect(out.filter((c) => c.type === 'usage')).toHaveLength(1);
    expect(out[out.length - 1]).toEqual({ type: 'stop', reason: 'end_turn' });
  });

  it('never emits a second stop, however many times the upstream closes the turn', async () => {
    const out = await collect(
      translateAnthropicStream(
        fromArray([
          MESSAGE_START,
          textDelta('first'),
          messageDelta('end_turn', 2),
          messageDelta('refusal', 3),
          messageDelta('max_tokens', 4),
        ]),
      ),
    );

    expect(out.filter((c) => c.type === 'stop')).toEqual([{ type: 'stop', reason: 'end_turn' }]);
    expect(out.filter((c) => c.type === 'usage')).toHaveLength(1);
  });

  it('carries a refusal through as its own stop reason', async () => {
    const out = await collect(
      translateAnthropicStream(fromArray([MESSAGE_START, messageDelta('refusal', 1)])),
    );

    expect(out[out.length - 1]).toEqual({ type: 'stop', reason: 'refusal' });
  });
});
