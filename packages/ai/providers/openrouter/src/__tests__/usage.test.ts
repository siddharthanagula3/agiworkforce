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
        model: 'fixture-provider/fixture-model',
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
        model: 'openai/fixture-model',
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
        model: 'openai/fixture-model',
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

describe('createOpenRouterUsageNormalizer — cost accounting', () => {
  it('reads usage.cost verbatim as costUsd without deriving it from token counts (avoids double counting against the token-based cost calculator)', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        model: 'openai/fixture-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 200, completion_tokens: 10, cost: 0.00014 } as never,
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(normalizer.enrichOutput(translateOpenAIStream(normalized)));
    const usage = findUsage(out);
    expect(usage.costUsd).toBe(0.00014);
    expect(usage.inputTokens).toBe(200);
  });

  it('does not set costUsd when the response never carried a cost field', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        model: 'openai/fixture-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 200, completion_tokens: 10 },
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(normalizer.enrichOutput(translateOpenAIStream(normalized)));
    const usage = findUsage(out);
    expect(usage.costUsd).toBeUndefined();
  });

  it('surfaces cache_discount as a separate informational cacheDiscountUsd field, never folded into costUsd', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        model: 'anthropic/example-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 20,
          cost: 0.0009,
          cache_discount: -0.0002,
        } as never,
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(normalizer.enrichOutput(translateOpenAIStream(normalized)));
    const usage = findUsage(out);
    expect(usage.costUsd).toBe(0.0009);
    expect(usage.cacheDiscountUsd).toBe(-0.0002);
  });

  it('reads prompt_tokens_details.cache_write_tokens (current OpenRouter wire shape) as cacheWriteTokens, leaving inputTokens as prompt_tokens verbatim (cache_write_tokens is informational for write-tier pricing, not additive)', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        model: 'anthropic/example-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 150 },
        } as never,
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(normalizer.enrichOutput(translateOpenAIStream(normalized)));
    const usage = findUsage(out);
    expect(usage.cacheWriteTokens).toBe(150);
    expect(usage.inputTokens).toBe(500);
  });
});

describe('createOpenRouterUsageNormalizer — provider attribution', () => {
  it('attaches the response provider slug seen on an early chunk to the existing response-meta chunk', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      { ...baseChunk({}), provider: 'Anthropic' } as never,
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(normalizer.enrichOutput(translateOpenAIStream(normalized)));
    const meta = out.find((c) => c.type === 'response-meta');
    expect(meta && meta.type === 'response-meta' ? meta.provider : undefined).toBe('Anthropic');
    expect(out.filter((c) => c.type === 'response-meta')).toHaveLength(1);
  });

  it('emits a synthetic response-meta chunk carrying the provider when it only arrives on the terminal chunk alongside usage', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({ choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }] }),
      {
        ...baseChunk({
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }),
        provider: 'Google AI Studio',
      } as never,
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(normalizer.enrichOutput(translateOpenAIStream(normalized)));
    const metaChunks = out.filter((c) => c.type === 'response-meta');
    expect(metaChunks).toHaveLength(2);
    const lateMeta = metaChunks[1];
    expect(lateMeta && lateMeta.type === 'response-meta' ? lateMeta.provider : undefined).toBe(
      'Google AI Studio',
    );
    const usageIndex = out.findIndex((c) => c.type === 'usage');
    const lateMetaIndex = out.indexOf(lateMeta as (typeof out)[number]);
    expect(lateMetaIndex).toBeLessThan(usageIndex);
  });

  it('does not emit a response-meta chunk when the response never carried a provider field', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    ];
    const normalizer = createOpenRouterUsageNormalizer();
    const normalized = normalizer.normalizeSource(fromArray(chunks));
    const out = await collect(normalizer.enrichOutput(translateOpenAIStream(normalized)));
    expect(out.some((c) => c.type === 'response-meta' && c.provider !== undefined)).toBe(false);
  });
});
