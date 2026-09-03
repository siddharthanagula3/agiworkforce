import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import {
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { withGroqCacheUsageNormalization } from '../cache-usage';
import { GROQ_MODEL_CATALOG } from '../catalog';

const GROQ_TEST_MODEL_ID = GROQ_MODEL_CATALOG[0]?.id ?? 'groq-test-model';

async function* fromArray<T>(items: T[]): AsyncIterable<T> {
  for (const i of items) yield i;
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

function baseChunk(overrides: Record<string, unknown>): OpenAIChatCompletionChunk {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 0,
    model: GROQ_TEST_MODEL_ID,
    choices: [{ index: 0, delta: {}, finish_reason: null }],
    ...overrides,
  } as OpenAIChatCompletionChunk;
}

describe('withGroqCacheUsageNormalization', () => {
  it('copies x_groq.usage into the top-level usage field when usage is absent', async () => {
    const chunk = baseChunk({
      x_groq: { id: 'req_1', usage: { prompt_tokens: 100, completion_tokens: 5 } },
    });
    const [out] = await collect(withGroqCacheUsageNormalization(fromArray([chunk])));
    expect(out?.usage?.prompt_tokens).toBe(100);
    expect(out?.usage?.completion_tokens).toBe(5);
  });

  it('leaves a top-level usage field untouched when already present', async () => {
    const chunk = baseChunk({
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      x_groq: { id: 'req_1', usage: { prompt_tokens: 100, completion_tokens: 5 } },
    });
    const [out] = await collect(withGroqCacheUsageNormalization(fromArray([chunk])));
    expect(out?.usage?.prompt_tokens).toBe(1);
  });

  it('passes through chunks with neither usage nor x_groq.usage unchanged', async () => {
    const chunk = baseChunk({});
    const [out] = await collect(withGroqCacheUsageNormalization(fromArray([chunk])));
    expect(out).toEqual(chunk);
  });

  it('end-to-end: translateOpenAIStream surfaces token counts sourced from x_groq.usage', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({ choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }] }),
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        x_groq: { id: 'req_1', usage: { prompt_tokens: 40, completion_tokens: 6 } },
      }),
    ];
    const normalized = withGroqCacheUsageNormalization(fromArray(chunks));
    const out = await collect<StreamChunk>(translateOpenAIStream(normalized));
    const usage = out.find((c) => c.type === 'usage');
    expect(usage).toBeDefined();
    if (usage?.type === 'usage') {
      expect(usage.inputTokens).toBe(40);
      expect(usage.outputTokens).toBe(6);
    }
  });
});
