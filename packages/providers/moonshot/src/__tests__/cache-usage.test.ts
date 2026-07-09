import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import {
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { withMoonshotCacheUsageNormalization } from '../cache-usage';

async function* fromArray<T>(items: T[]): AsyncIterable<T> {
  for (const i of items) yield i;
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

function baseChunk(overrides: Partial<OpenAIChatCompletionChunk>): OpenAIChatCompletionChunk {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'kimi-k2.6',
    choices: [{ index: 0, delta: {}, finish_reason: null }],
    ...overrides,
  };
}

describe('withMoonshotCacheUsageNormalization', () => {
  it('rewrites a flat usage.cached_tokens into prompt_tokens_details.cached_tokens', async () => {
    const chunk = baseChunk({
      usage: { prompt_tokens: 100, completion_tokens: 5, cached_tokens: 80 } as never,
    });
    const [out] = await collect(withMoonshotCacheUsageNormalization(fromArray([chunk])));
    expect(out?.usage?.prompt_tokens_details?.cached_tokens).toBe(80);
  });

  it('leaves an already-nested cached_tokens field untouched', async () => {
    const chunk = baseChunk({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 42 },
      },
    });
    const [out] = await collect(withMoonshotCacheUsageNormalization(fromArray([chunk])));
    expect(out?.usage?.prompt_tokens_details?.cached_tokens).toBe(42);
  });

  it('passes through chunks with no usage unchanged', async () => {
    const chunk = baseChunk({});
    const [out] = await collect(withMoonshotCacheUsageNormalization(fromArray([chunk])));
    expect(out).toEqual(chunk);
  });

  it('passes through usage with no cached_tokens at all unchanged', async () => {
    const chunk = baseChunk({ usage: { prompt_tokens: 100, completion_tokens: 5 } });
    const [out] = await collect(withMoonshotCacheUsageNormalization(fromArray([chunk])));
    expect(out?.usage?.prompt_tokens_details).toBeUndefined();
  });

  it('end-to-end: translateOpenAIStream surfaces cacheReadTokens after normalization', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({ choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }] }),
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 5, cached_tokens: 80 } as never,
      }),
    ];
    const normalized = withMoonshotCacheUsageNormalization(fromArray(chunks));
    const out = await collect<StreamChunk>(translateOpenAIStream(normalized));
    const usage = out.find((c) => c.type === 'usage');
    expect(usage).toBeDefined();
    if (usage?.type === 'usage') {
      expect(usage.cacheReadTokens).toBe(80);
      expect(usage.inputTokens).toBe(100);
    }
  });
});
