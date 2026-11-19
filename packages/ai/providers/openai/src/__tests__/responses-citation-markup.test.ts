import { describe, expect, it } from 'vitest';

import type { ResponsesStreamEvent } from '../responses-types';
import { translateOpenAIResponsesStream } from '../stream-responses';

const SINGLE_REFERENCE = '\uE200cite\uE202turn620734view2\uE201';
const TWO_REFERENCES = '\uE200cite\uE202turn6search0\uE202turn6view2\uE201';

async function* fromArray(events: ResponsesStreamEvent[]): AsyncIterable<ResponsesStreamEvent> {
  yield* events;
}

function deltas(...parts: string[]): ResponsesStreamEvent[] {
  return parts.map((delta, index) => ({
    type: 'response.output_text.delta',
    item_id: 'msg_1',
    output_index: 0,
    content_index: 0,
    sequence_number: index + 1,
    delta,
  }));
}

async function streamedText(events: ResponsesStreamEvent[]): Promise<string> {
  let text = '';
  for await (const chunk of translateOpenAIResponsesStream(
    fromArray([
      {
        type: 'response.output_item.added',
        output_index: 0,
        sequence_number: 0,
        item: { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress' },
      },
      ...events,
      {
        type: 'response.completed',
        sequence_number: 99,
        response: { id: 'resp_1', status: 'completed' },
      },
    ]),
  )) {
    if (chunk.type === 'text-delta') text += chunk.delta;
  }
  return text;
}

describe('OpenAI citation markup in Responses text', () => {
  it('removes a whole citation span from a text delta', async () => {
    expect(await streamedText(deltas(`Starship flew again. ${SINGLE_REFERENCE}\n\nNext.`))).toBe(
      'Starship flew again. \n\nNext.',
    );
  });

  it('removes a span with several references that arrives split across deltas', async () => {
    const [first, second, third] = [
      TWO_REFERENCES.slice(0, 3),
      TWO_REFERENCES.slice(3, 12),
      TWO_REFERENCES.slice(12),
    ];
    expect(await streamedText(deltas('Mars flybys. ', first!, second!, `${third!} Done.`))).toBe(
      'Mars flybys.  Done.',
    );
  });

  it('removes the span from text recovered from output_text.done', async () => {
    expect(
      await streamedText([
        {
          type: 'response.output_text.done',
          item_id: 'msg_1',
          output_index: 0,
          content_index: 0,
          sequence_number: 1,
          text: `Three headlines. ${SINGLE_REFERENCE}`,
        },
      ]),
    ).toBe('Three headlines. ');
  });

  it('does not repeat text when the done event follows streamed deltas with a span', async () => {
    const full = `Three headlines. ${SINGLE_REFERENCE} More.`;
    expect(
      await streamedText([
        ...deltas(full.slice(0, 20), full.slice(20)),
        {
          type: 'response.output_text.done',
          item_id: 'msg_1',
          output_index: 0,
          content_index: 0,
          sequence_number: 9,
          text: full,
        },
      ]),
    ).toBe('Three headlines.  More.');
  });

  it('drops a citation span still open when the stream ends', async () => {
    expect(await streamedText(deltas('Launch is set. ', '\uE200cite\uE202turn6sea'))).toBe(
      'Launch is set. ',
    );
  });

  it('keeps the text after a stray open mark when the stream ends without a close', async () => {
    expect(await streamedText(deltas('First part.', '\uE200 And the last sentence.'))).toBe(
      'First part. And the last sentence.',
    );
  });

  it('leaves ordinary text, including the word cite, untouched', async () => {
    expect(await streamedText(deltas('Please cite turn 6 of the report.'))).toBe(
      'Please cite turn 6 of the report.',
    );
  });
});
