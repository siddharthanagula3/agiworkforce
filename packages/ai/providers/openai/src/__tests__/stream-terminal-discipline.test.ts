import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { translateOpenAIStream } from '../stream';
import type { OpenAIChatCompletionChunk } from '../types';

const FIXTURE_MODEL_ID = 'fixture-openai-model';

function chunk(overrides: Partial<OpenAIChatCompletionChunk>): OpenAIChatCompletionChunk {
  return {
    id: 'chatcmpl-terminal',
    object: 'chat.completion.chunk',
    created: 0,
    model: FIXTURE_MODEL_ID,
    choices: [{ index: 0, delta: {}, finish_reason: null }],
    ...overrides,
  };
}

async function* fromArray(records: OpenAIChatCompletionChunk[]) {
  for (const record of records) yield record;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const item of stream) out.push(item);
  return out;
}

describe('translateOpenAIStream terminal discipline', () => {
  // The trailing usage follows the stop on purpose. The openai-passthrough wire
  // is byte-compared against the legacy path, which emits finish_reason first.
  it('carries the trailing usage-only chunk after the stop, in the order the wire owes', async () => {
    const out = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }] }),
          chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
          chunk({
            choices: [],
            usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 },
          }),
        ]),
      ),
    );

    expect(out.filter((c) => c.type === 'stop')).toEqual([{ type: 'stop', reason: 'end_turn' }]);
    expect(out.map((c) => c.type)).toEqual(['response-meta', 'text-delta', 'stop', 'usage']);
    expect(out.find((c) => c.type === 'usage')).toMatchObject({
      inputTokens: 11,
      outputTokens: 2,
    });
  });

  it('emits one stop when the upstream repeats its finish reason', async () => {
    const out = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }] }),
          chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
          chunk({
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
          }),
        ]),
      ),
    );

    expect(out.filter((c) => c.type === 'stop')).toHaveLength(1);
    expect(out.filter((c) => c.type === 'usage')).toHaveLength(1);
  });

  it('never emits a second stop, however many times the upstream closes the turn', async () => {
    const out = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({ choices: [{ index: 0, delta: { content: 'first' }, finish_reason: 'stop' }] }),
          chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }),
          chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }] }),
        ]),
      ),
    );

    expect(out.filter((c) => c.type === 'stop')).toEqual([{ type: 'stop', reason: 'end_turn' }]);
  });

  it('carries a content filter stop through as a refusal', async () => {
    const out = await collect(
      translateOpenAIStream(
        fromArray([chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }] })]),
      ),
    );

    expect(out[out.length - 1]).toEqual({ type: 'stop', reason: 'refusal' });
  });

  it('closes every open tool call before the stop', async () => {
    const out = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    { index: 0, id: 'call_1', function: { name: 'lookup', arguments: '' } },
                  ],
                },
                finish_reason: null,
              },
            ],
          }),
          chunk({
            choices: [
              {
                index: 0,
                delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":1}' } }] },
                finish_reason: null,
              },
            ],
          }),
          chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
        ]),
      ),
    );

    expect(out.map((c) => c.type)).toEqual([
      'response-meta',
      'tool-use-start',
      'tool-use-delta',
      'tool-use-end',
      'stop',
    ]);
    expect(out[out.length - 1]).toEqual({ type: 'stop', reason: 'tool_use' });
  });
});
