import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';
import {
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { createVercelGatewayUsageNormalizer } from '../usage';
import { VERCEL_GATEWAY_ANTHROPIC_MODEL } from './model-fixtures';

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
    model: VERCEL_GATEWAY_ANTHROPIC_MODEL,
    choices: [{ index: 0, delta: {}, finish_reason: null }],
    ...overrides,
  };
}

function findUsage(chunks: StreamChunk[]): Extract<StreamChunk, { type: 'usage' }> {
  const usage = chunks.find((c) => c.type === 'usage');
  if (!usage || usage.type !== 'usage') throw new Error('no usage chunk emitted');
  return usage;
}

describe('createVercelGatewayUsageNormalizer, standard OpenAI-compat usage fields', () => {
  it('passes prompt_tokens_details.cached_tokens and completion_tokens_details.reasoning_tokens through unchanged (gateway already reports the standard shape)', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 300 },
          completion_tokens_details: { reasoning_tokens: 12 },
        },
      }),
    ];
    const normalizer = createVercelGatewayUsageNormalizer();
    const out = await collect(
      normalizer.enrichOutput(translateOpenAIStream(normalizer.normalizeSource(fromArray(chunks)))),
    );
    const usage = findUsage(out);
    expect(usage.cacheReadTokens).toBe(300);
    expect(usage.reasoningTokens).toBe(12);
    expect(usage.inputTokens).toBe(500);
  });
});

describe('createVercelGatewayUsageNormalizer, cost and cache-write accounting', () => {
  it('reads a top-level usage.cost verbatim as costUsd when the gateway inlines it, without deriving it from token counts', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 200, completion_tokens: 10, cost: 0.0007 } as never,
      }),
    ];
    const normalizer = createVercelGatewayUsageNormalizer();
    const out = await collect(
      normalizer.enrichOutput(translateOpenAIStream(normalizer.normalizeSource(fromArray(chunks)))),
    );
    expect(findUsage(out).costUsd).toBe(0.0007);
  });

  it('does not set costUsd when the gateway response never carried a cost field', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 200, completion_tokens: 10 },
      }),
    ];
    const normalizer = createVercelGatewayUsageNormalizer();
    const out = await collect(
      normalizer.enrichOutput(translateOpenAIStream(normalizer.normalizeSource(fromArray(chunks)))),
    );
    expect(findUsage(out).costUsd).toBeUndefined();
  });

  it('reads prompt_tokens_details.cache_write_tokens as cacheWriteTokens, leaving inputTokens as prompt_tokens verbatim (write tokens are informational for tiered pricing, not additive)', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 150 },
        } as never,
      }),
    ];
    const normalizer = createVercelGatewayUsageNormalizer();
    const out = await collect(
      normalizer.enrichOutput(translateOpenAIStream(normalizer.normalizeSource(fromArray(chunks)))),
    );
    const usage = findUsage(out);
    expect(usage.cacheWriteTokens).toBe(150);
    expect(usage.inputTokens).toBe(500);
  });
});

describe('createVercelGatewayUsageNormalizer, provider attribution', () => {
  it('attaches provider_metadata.gateway.provider to the existing response-meta chunk when seen on an early chunk', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      { ...baseChunk({}), provider_metadata: { gateway: { provider: 'anthropic' } } } as never,
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    ];
    const normalizer = createVercelGatewayUsageNormalizer();
    const out = await collect(
      normalizer.enrichOutput(translateOpenAIStream(normalizer.normalizeSource(fromArray(chunks)))),
    );
    const meta = out.find((c) => c.type === 'response-meta');
    expect(meta && meta.type === 'response-meta' ? meta.provider : undefined).toBe('anthropic');
    expect(out.filter((c) => c.type === 'response-meta')).toHaveLength(1);
  });

  it('falls back to a camelCase providerMetadata.gateway.provider field', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      { ...baseChunk({}), providerMetadata: { gateway: { provider: 'vertex' } } } as never,
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    ];
    const normalizer = createVercelGatewayUsageNormalizer();
    const out = await collect(
      normalizer.enrichOutput(translateOpenAIStream(normalizer.normalizeSource(fromArray(chunks)))),
    );
    const meta = out.find((c) => c.type === 'response-meta');
    expect(meta && meta.type === 'response-meta' ? meta.provider : undefined).toBe('vertex');
  });

  it('emits a synthetic response-meta chunk when the provider field only arrives on the terminal chunk alongside usage', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({ choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }] }),
      {
        ...baseChunk({
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }),
        provider_metadata: { gateway: { provider: 'bedrock' } },
      } as never,
    ];
    const normalizer = createVercelGatewayUsageNormalizer();
    const out = await collect(
      normalizer.enrichOutput(translateOpenAIStream(normalizer.normalizeSource(fromArray(chunks)))),
    );
    const metaChunks = out.filter((c) => c.type === 'response-meta');
    expect(metaChunks).toHaveLength(2);
    const lateMeta = metaChunks[1];
    expect(lateMeta && lateMeta.type === 'response-meta' ? lateMeta.provider : undefined).toBe(
      'bedrock',
    );
    const usageIndex = out.findIndex((c) => c.type === 'usage');
    expect(out.indexOf(lateMeta as (typeof out)[number])).toBeLessThan(usageIndex);
  });

  it('does not emit a provider-carrying response-meta chunk when the gateway never reported provider_metadata', async () => {
    const chunks: OpenAIChatCompletionChunk[] = [
      baseChunk({
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    ];
    const normalizer = createVercelGatewayUsageNormalizer();
    const out = await collect(
      normalizer.enrichOutput(translateOpenAIStream(normalizer.normalizeSource(fromArray(chunks)))),
    );
    expect(out.some((c) => c.type === 'response-meta' && c.provider !== undefined)).toBe(false);
  });
});
