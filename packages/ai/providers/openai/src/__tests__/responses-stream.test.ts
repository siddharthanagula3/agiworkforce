import { describe, expect, it } from 'vitest';

import { translateOpenAIResponsesStream } from '../stream-responses';
import type { ResponsesStreamEvent } from '../responses-types';

async function* fromArray(events: ResponsesStreamEvent[]): AsyncIterable<ResponsesStreamEvent> {
  yield* events;
}

async function collect(events: AsyncIterable<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of events) chunks.push(chunk);
  return chunks;
}

describe('translateOpenAIResponsesStream', () => {
  it('surfaces the documented top-level error event instead of ending as an empty success', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'error',
            code: 'invalid_request_error',
            message: 'The request could not be processed.',
            param: 'tools[0]',
            sequence_number: 3,
          },
        ]),
      ),
    );

    expect(chunks).toEqual([
      {
        type: 'error',
        code: 'invalid_request_error',
        message: 'The request could not be processed.',
      },
      { type: 'stop', reason: 'error' },
    ]);
  });

  it('uses output_text.done when a stream contains no text deltas', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.output_item.added',
            output_index: 0,
            sequence_number: 0,
            item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress' },
          },
          {
            type: 'response.output_text.done',
            item_id: 'msg_1',
            output_index: 0,
            content_index: 0,
            sequence_number: 1,
            text: 'Recovered final text.',
          },
          {
            type: 'response.completed',
            sequence_number: 2,
            response: { id: 'resp_1', status: 'completed' },
          },
        ]),
      ),
    );

    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'Recovered final text.' },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });

  it('does not repeat output_text.done after text deltas were already emitted', async () => {
    const chunks = await collect(
      translateOpenAIResponsesStream(
        fromArray([
          {
            type: 'response.output_text.delta',
            item_id: 'msg_1',
            output_index: 0,
            content_index: 0,
            sequence_number: 0,
            delta: 'Already streamed.',
          },
          {
            type: 'response.output_text.done',
            item_id: 'msg_1',
            output_index: 0,
            content_index: 0,
            sequence_number: 1,
            text: 'Already streamed.',
          },
          {
            type: 'response.completed',
            sequence_number: 2,
            response: { id: 'resp_1', status: 'completed' },
          },
        ]),
      ),
    );

    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'Already streamed.' },
      { type: 'stop', reason: 'end_turn' },
    ]);
  });
});
