import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { estimateTextTokens } from '@agiworkforce/agent-core';
import { EmptyStreamError } from '@agiworkforce/provider-runtime';
import type { StreamChunk } from '@agiworkforce/types';

import { translateAnthropicStream } from '../stream';

type Event = Anthropic.MessageStreamEvent;

async function* fromArray(events: Event[]): AsyncIterable<Event> {
  for (const event of events) yield event;
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<{ chunks: StreamChunk[]; error: unknown }> {
  const chunks: StreamChunk[] = [];
  let error: unknown = null;
  try {
    for await (const item of stream) chunks.push(item);
  } catch (caught) {
    error = caught;
  }
  return { chunks, error };
}

const MESSAGE_START = {
  type: 'message_start',
  message: { usage: { input_tokens: 12 } },
} as unknown as Event;

function textDelta(text: string): Event {
  return {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text },
  } as unknown as Event;
}

describe('translateAnthropicStream, a stream that ends without a stop reason', () => {
  it('reports an interruption instead of a finished turn', async () => {
    const { chunks, error } = await collect(
      translateAnthropicStream(fromArray([MESSAGE_START, textDelta('Half an ans')])),
    );

    expect(error).toBeInstanceOf(EmptyStreamError);
    expect((error as EmptyStreamError).variant).toBe('started_but_no_completion');
    expect(chunks.filter((c) => c.type === 'stop')).toEqual([]);
  });

  it('keeps the text the upstream did send before it went away', async () => {
    const { chunks } = await collect(
      translateAnthropicStream(fromArray([MESSAGE_START, textDelta('Half an ans')])),
    );

    expect(
      chunks
        .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
        .map((c) => c.delta),
    ).toEqual(['Half an ans']);
  });

  it('separates a stream that carried nothing at all from one cut off mid-answer', async () => {
    const { error } = await collect(translateAnthropicStream(fromArray([])));

    expect(error).toBeInstanceOf(EmptyStreamError);
    expect((error as EmptyStreamError).variant).toBe('no_message_start');
  });

  it('reports an interruption when the turn closes with message_stop but no stop reason', async () => {
    const { error } = await collect(
      translateAnthropicStream(
        fromArray([MESSAGE_START, textDelta('Half'), { type: 'message_stop' } as unknown as Event]),
      ),
    );

    expect(error).toBeInstanceOf(EmptyStreamError);
  });

  it('leaves a turn the upstream closed properly alone', async () => {
    const { chunks, error } = await collect(
      translateAnthropicStream(
        fromArray([
          MESSAGE_START,
          textDelta('Answer.'),
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 3 },
          } as unknown as Event,
          { type: 'message_stop' } as unknown as Event,
        ]),
      ),
    );

    expect(error).toBeNull();
    expect(chunks[chunks.length - 1]).toEqual({ type: 'stop', reason: 'end_turn' });
  });

  it('does not report an interruption when the consumer stops reading early', async () => {
    const stream = translateAnthropicStream(
      fromArray([MESSAGE_START, textDelta('One'), textDelta('Two')]),
    );
    const seen: StreamChunk[] = [];
    let error: unknown = null;
    try {
      for await (const chunk of stream) {
        seen.push(chunk);
        break;
      }
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeNull();
    expect(seen).toHaveLength(1);
  });
});

describe('translateAnthropicStream, usage of a turn that did not finish', () => {
  async function* abortedAfter(events: Event[]): AsyncIterable<Event> {
    for (const event of events) yield event;
    throw Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
  }

  function usageChunks(chunks: StreamChunk[]): StreamChunk[] {
    return chunks.filter((chunk) => chunk.type === 'usage');
  }

  it('reports what the provider measured and the output shown before a stopped stream ended', async () => {
    const { chunks, error } = await collect(
      translateAnthropicStream(abortedAfter([MESSAGE_START, textDelta('Half an ans')])),
    );

    expect((error as Error).message).toBe('Request was aborted.');
    expect(usageChunks(chunks)).toEqual([
      { type: 'usage', inputTokens: 12, outputTokens: estimateTextTokens('Half an ans') },
    ]);
  });

  it('counts every streamed delta, thinking and tool input included, in a stopped turn', async () => {
    const thinking = {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'thinking_delta', thinking: 'Weighing the two options first.' },
    } as unknown as Event;
    const toolStart = {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: {} },
    } as unknown as Event;
    const toolInput = {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"path":"src/index.ts"}' },
    } as unknown as Event;
    const { chunks } = await collect(
      translateAnthropicStream(
        abortedAfter([MESSAGE_START, thinking, textDelta('Reading it now.'), toolStart, toolInput]),
      ),
    );

    expect(usageChunks(chunks)).toEqual([
      {
        type: 'usage',
        inputTokens: 12,
        outputTokens: estimateTextTokens(
          'Weighing the two options first.Reading it now.{"path":"src/index.ts"}',
        ),
      },
    ]);
  });

  it('reports what the provider measured and the output shown before a stream was cut off', async () => {
    const { chunks, error } = await collect(
      translateAnthropicStream(fromArray([MESSAGE_START, textDelta('Half an ans')])),
    );

    expect(error).toBeInstanceOf(EmptyStreamError);
    expect(usageChunks(chunks)).toEqual([
      { type: 'usage', inputTokens: 12, outputTokens: estimateTextTokens('Half an ans') },
    ]);
  });

  it('adds no output estimate when nothing was streamed before the stop', async () => {
    const { chunks } = await collect(translateAnthropicStream(abortedAfter([MESSAGE_START])));

    expect(usageChunks(chunks)).toEqual([{ type: 'usage', inputTokens: 12 }]);
  });

  it('reports nothing when the stream stopped before the provider measured anything', async () => {
    const { chunks } = await collect(translateAnthropicStream(abortedAfter([])));

    expect(usageChunks(chunks)).toEqual([]);
  });
});
