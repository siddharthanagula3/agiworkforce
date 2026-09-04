/**
 * OpenAI's wire `content_filter` finish reason means the provider's safety
 * layer stopped the response, the same honest concept as Anthropic's
 * `stop_reason: 'refusal'`. Both translators must surface it as the
 * first-class StreamChunkStop `'refusal'` member (mirroring the agent event
 * envelope's Refusal stop), never as `'error'` (transport/provider failure)
 * and never as a silent normal completion.
 */

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

describe('translateOpenAIStream, content_filter is a first-class refusal', () => {
  it("maps finish_reason 'content_filter' to stop reason 'refusal', not 'error' or 'end_turn'", async () => {
    const chunks = [
      {
        id: 'chatcmpl-1',
        created: 1,
        choices: [{ index: 0, delta: { content: 'I can' }, finish_reason: null }],
      },
      {
        id: 'chatcmpl-1',
        created: 1,
        choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }],
      },
    ] as unknown as OpenAIChatCompletionChunk[];

    const out = await collect(translateOpenAIStream(fromArray(chunks)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'refusal' });
  });

  it("still maps 'stop' to 'end_turn' and 'length' to 'max_tokens' (unaffected)", async () => {
    for (const [wire, expected] of [
      ['stop', 'end_turn'],
      ['length', 'max_tokens'],
    ] as const) {
      const chunks = [
        {
          id: 'chatcmpl-2',
          created: 1,
          choices: [{ index: 0, delta: {}, finish_reason: wire }],
        },
      ] as unknown as OpenAIChatCompletionChunk[];

      const out = await collect(translateOpenAIStream(fromArray(chunks)));
      expect(out.find((c) => c.type === 'stop')).toEqual({ type: 'stop', reason: expected });
    }
  });
});

describe('translateOpenAIResponsesStream, content_filter is a first-class refusal', () => {
  it("maps incomplete_details.reason 'content_filter' to stop reason 'refusal'", async () => {
    const events = [
      {
        type: 'response.incomplete',
        response: { incomplete_details: { reason: 'content_filter' } },
      },
    ] as unknown as ResponsesStreamEvent[];

    const out = await collect(translateOpenAIResponsesStream(fromArray(events)));
    const stops = out.filter((c) => c.type === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toEqual({ type: 'stop', reason: 'refusal' });
  });

  it("still maps 'max_output_tokens' to 'max_tokens' (unaffected)", async () => {
    const events = [
      {
        type: 'response.incomplete',
        response: { incomplete_details: { reason: 'max_output_tokens' } },
      },
    ] as unknown as ResponsesStreamEvent[];

    const out = await collect(translateOpenAIResponsesStream(fromArray(events)));
    expect(out.find((c) => c.type === 'stop')).toEqual({ type: 'stop', reason: 'max_tokens' });
  });
});
