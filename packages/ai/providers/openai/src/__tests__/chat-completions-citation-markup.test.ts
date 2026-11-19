import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { translateOpenAIStream } from '../stream';
import type { OpenAIChatCompletionChunk } from '../types';

const FIXTURE_MODEL_ID = 'fixture-openai-model';
const SINGLE_REFERENCE = 'citeturn620734view2';

function chunk(
  content: string | null,
  finishReason: OpenAIChatCompletionChunk['choices'][number]['finish_reason'] = null,
): OpenAIChatCompletionChunk {
  return {
    id: 'chatcmpl-citation-markup',
    object: 'chat.completion.chunk',
    created: 0,
    model: FIXTURE_MODEL_ID,
    choices: [
      { index: 0, delta: content === null ? {} : { content }, finish_reason: finishReason },
    ],
  };
}

async function* fromArray(records: OpenAIChatCompletionChunk[]) {
  for (const record of records) yield record;
}

async function collect(records: OpenAIChatCompletionChunk[]): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const item of translateOpenAIStream(fromArray(records))) chunks.push(item);
  return chunks;
}

function text(chunks: StreamChunk[]): string {
  return chunks.map((item) => (item.type === 'text-delta' ? item.delta : '')).join('');
}

describe('OpenAI citation markup in Chat Completions text', () => {
  it('removes a citation span split across deltas', async () => {
    const chunks = await collect([
      chunk('Starship flew again. '),
      chunk(SINGLE_REFERENCE.slice(0, 4)),
      chunk(SINGLE_REFERENCE.slice(4)),
      chunk(' Next.'),
      chunk(null, 'stop'),
    ]);
    expect(text(chunks)).toBe('Starship flew again.  Next.');
  });

  it('releases held text before the stop chunk', async () => {
    const chunks = await collect([chunk('Done.'), chunk('note', 'stop')]);
    const stopIndex = chunks.findIndex((item) => item.type === 'stop');
    const lastTextIndex = chunks.findLastIndex((item) => item.type === 'text-delta');
    expect(text(chunks)).toBe('Done.note');
    expect(lastTextIndex).toBeLessThan(stopIndex);
  });

  it('drops a citation span the stream cut off at the stop', async () => {
    const chunks = await collect([chunk('Done.'), chunk('cit', 'stop')]);
    expect(text(chunks)).toBe('Done.');
  });
});
