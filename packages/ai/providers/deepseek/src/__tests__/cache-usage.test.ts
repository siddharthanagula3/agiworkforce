import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel, type StreamChunk } from '@agiworkforce/types';
import {
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { withDeepSeekCacheUsageNormalization } from '../cache-usage';

const DEEPSEEK_DEFAULT_MODEL_ID = requireProviderDefaultModel('deepseek');

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
    model: DEEPSEEK_DEFAULT_MODEL_ID,
    choices: [{ index: 0, delta: {}, finish_reason: null }],
    ...overrides,
  };
}

describe('withDeepSeekCacheUsageNormalization', () => {
  it('rewrites a flat usage.prompt_cache_hit_tokens into prompt_tokens_details.cached_tokens', async () => {
    const chunk = baseChunk({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 5,
        prompt_cache_hit_tokens: 80,
        prompt_cache_miss_tokens: 20,
      } as never,
    });
    const [out] = await collect(withDeepSeekCacheUsageNormalization(fromArray([chunk])));
    expect(out?.usage?.prompt_tokens_details?.cached_tokens).toBe(80);
  });

  it('leaves an already-nested cached_tokens field untouched', async () => {
    const chunk = baseChunk({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 42 },
      } as never,
    });
    const [out] = await collect(withDeepSeekCacheUsageNormalization(fromArray([chunk])));
    expect(out?.usage?.prompt_tokens_details?.cached_tokens).toBe(42);
  });

  it('passes through chunks with no usage unchanged', async () => {
    const chunk = baseChunk({});
    const [out] = await collect(withDeepSeekCacheUsageNormalization(fromArray([chunk])));
    expect(out).toEqual(chunk);
  });

  it('passes through usage with no prompt_cache_hit_tokens at all unchanged', async () => {
    const chunk = baseChunk({ usage: { prompt_tokens: 100, completion_tokens: 5 } });
    const [out] = await collect(withDeepSeekCacheUsageNormalization(fromArray([chunk])));
    expect(out?.usage?.prompt_tokens_details).toBeUndefined();
  });

  it('end-to-end: translateOpenAIStream surfaces cacheReadTokens after normalization', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({ choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }] }),
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 5,
          prompt_cache_hit_tokens: 80,
          prompt_cache_miss_tokens: 20,
        } as never,
      }),
    ];
    const normalized = withDeepSeekCacheUsageNormalization(fromArray(chunks));
    const out = await collect<StreamChunk>(translateOpenAIStream(normalized));
    const usage = out.find((c) => c.type === 'usage');
    expect(usage).toBeDefined();
    if (usage?.type === 'usage') {
      expect(usage.cacheReadTokens).toBe(80);
      expect(usage.inputTokens).toBe(100);
    }
  });
});
