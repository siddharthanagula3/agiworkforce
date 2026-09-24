import { describe, expect, it } from 'vitest';
import { EmptyStreamError } from '@agiworkforce/provider-runtime';
import type { StreamChunk } from '@agiworkforce/types';

import { translateOpenAIStream } from '../stream';
import type { OpenAIChatCompletionChunk } from '../types';

const FIXTURE_MODEL_ID = 'fixture-openai-model';

function chunk(overrides: Partial<OpenAIChatCompletionChunk>): OpenAIChatCompletionChunk {
  return {
    id: 'chatcmpl-interrupted',
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

describe('translateOpenAIStream, a stream that ends without a finish signal', () => {
  it('reports an interruption instead of a finished turn when the upstream just stops', async () => {
    const { chunks, error } = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({
            choices: [{ index: 0, delta: { content: 'Half an ans' }, finish_reason: null }],
          }),
        ]),
      ),
    );

    expect(error).toBeInstanceOf(EmptyStreamError);
    expect((error as EmptyStreamError).variant).toBe('started_but_no_completion');
    expect(chunks.filter((c) => c.type === 'stop')).toEqual([]);
  });

  it('keeps every delta the upstream did send before it went away', async () => {
    const { chunks } = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({
            choices: [{ index: 0, delta: { content: 'Half an ans' }, finish_reason: null }],
          }),
        ]),
      ),
    );

    expect(
      chunks
        .filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
        .map((c) => c.delta),
    ).toEqual(['Half an ans']);
  });

  it('reports the tokens the upstream billed for before the interruption', async () => {
    const { chunks, error } = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({ choices: [{ index: 0, delta: { content: 'Partial' }, finish_reason: null }] }),
          chunk({
            choices: [],
            usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 },
          }),
        ]),
      ),
    );

    expect(error).toBeInstanceOf(EmptyStreamError);
    expect(chunks.find((c) => c.type === 'usage')).toMatchObject({
      inputTokens: 9,
      outputTokens: 2,
    });
  });

  it('separates a stream that carried nothing at all from one that was cut off mid-answer', async () => {
    const { error } = await collect(translateOpenAIStream(fromArray([])));

    expect(error).toBeInstanceOf(EmptyStreamError);
    expect((error as EmptyStreamError).variant).toBe('no_message_start');
  });

  it('still reads a finish reason followed by a usage-only chunk as a clean stop', async () => {
    const { chunks, error } = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({ choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' }] }),
          chunk({
            choices: [],
            usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
          }),
        ]),
      ),
    );

    expect(error).toBeNull();
    expect(chunks.filter((c) => c.type === 'stop')).toEqual([{ type: 'stop', reason: 'end_turn' }]);
  });

  it('still reads a tool-call turn closed by the upstream as a clean stop', async () => {
    const { error, chunks } = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    { index: 0, id: 'call_1', function: { name: 'lookup', arguments: '{}' } },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          }),
        ]),
      ),
    );

    expect(error).toBeNull();
    expect(chunks[chunks.length - 1]).toEqual({ type: 'stop', reason: 'tool_use' });
  });
});

describe('translateOpenAIStream, an upstream that names its own failure', () => {
  it('reports a generation the upstream itself finished as failed, rather than as a stop', async () => {
    const { chunks, error } = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({ choices: [{ index: 0, delta: { content: 'Half' }, finish_reason: null }] }),
          chunk({
            choices: [{ index: 0, delta: {}, finish_reason: 'error' as unknown as 'stop' }],
          }),
        ]),
      ),
    );

    expect(error).toBeInstanceOf(EmptyStreamError);
    expect(chunks.filter((c) => c.type === 'stop')).toEqual([]);
    expect(
      chunks.filter(
        (c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta',
      ),
    ).toHaveLength(1);
  });

  it('carries a refusal delta through as a refusal rather than as an empty answer', async () => {
    const { chunks, error } = await collect(
      translateOpenAIStream(
        fromArray([
          chunk({
            choices: [
              {
                index: 0,
                delta: { refusal: 'I cannot help with that.' } as never,
                finish_reason: null,
              },
            ],
          }),
          chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
        ]),
      ),
    );

    expect(error).toBeNull();
    expect(chunks[chunks.length - 1]).toEqual({ type: 'stop', reason: 'refusal' });
  });
});
