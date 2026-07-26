import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import {
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { createOpenRouterUsageNormalizer } from '../usage';

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
    model: 'anthropic/example-model',
    choices: [{ index: 0, delta: {}, finish_reason: null }],
    ...overrides,
  };
}

function findUsage(chunks: StreamChunk[]): Extract<StreamChunk, { type: 'usage' }> {
  const usage = chunks.find((c) => c.type === 'usage');
  if (!usage || usage.type !== 'usage') throw new Error('no usage chunk emitted');
  return usage;
}

describe('createOpenRouterUsageNormalizer — Anthropic-routed usage shape', () => {
  it('normalizes cache_read_input_tokens/cache_creation_input_tokens end-to-end', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({ choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }] }),
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 20,
          cache_read_input_tokens: 300,
          cache_creation_input_tokens: 150,
        } as never,
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const translated = translateOpenAIStream(normalized);
    const enriched = normalizer.enrichOutput(translated);
    const out = await collect(enriched);
    const usage = findUsage(out);
    expect(usage.cacheReadTokens).toBe(300);
    expect(usage.cacheWriteTokens).toBe(150);
    expect(usage.inputTokens).toBe(500);
  });
});

describe('createOpenRouterUsageNormalizer — non-Anthropic-routed usage shape', () => {
  it('normalizes the alternate input_tokens_details.cached_tokens nesting', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 10,
          input_tokens_details: { cached_tokens: 64 },
        } as never,
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(translateOpenAIStream(normalized));
    const usage = findUsage(out);
    expect(usage.cacheReadTokens).toBe(64);
  });

  it('leaves an already-nested prompt_tokens_details.cached_tokens untouched', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        model: 'openai/gpt-5.4',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 10,
          prompt_tokens_details: { cached_tokens: 90 },
        },
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(translateOpenAIStream(normalized));
    const usage = findUsage(out);
    expect(usage.cacheReadTokens).toBe(90);
  });

  it('does not set cacheWriteTokens when no cache_creation_input_tokens was ever seen', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        model: 'openai/gpt-5.4',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 200, completion_tokens: 10 },
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const translated = translateOpenAIStream(normalized);
    const out = await collect(normalizer.enrichOutput(translated));
    const usage = findUsage(out);
    expect(usage.cacheWriteTokens).toBeUndefined();
  });
});
