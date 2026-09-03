import type { StreamChunk } from '@agiworkforce/types';
import type { OpenAIChatCompletionChunk } from '@agiworkforce/providers-openai';

interface OpenRouterPromptTokensDetails {
  cached_tokens?: number;
  cache_write_tokens?: number;
}

interface OpenRouterChunkUsage extends NonNullable<OpenAIChatCompletionChunk['usage']> {
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  prompt_tokens_details?: OpenRouterPromptTokensDetails;
  cost?: number;
  cache_discount?: number;
}

interface OpenRouterChunk extends OpenAIChatCompletionChunk {
  usage?: OpenRouterChunkUsage | null;
  provider?: string;
}

interface OpenRouterUsageState {
  cacheWriteTokens?: number;
  costUsd?: number;
  cacheDiscountUsd?: number;
  provider?: string;
  providerAttached: boolean;
}

function normalizeReadShape(chunk: OpenRouterChunk): OpenAIChatCompletionChunk {
  const usage = chunk.usage;
  if (!usage) return chunk;
  if (usage.prompt_tokens_details?.cached_tokens !== undefined) {
    return chunk;
  }
  const cachedRead = usage.cache_read_input_tokens ?? usage.input_tokens_details?.cached_tokens;
  if (cachedRead === undefined) return chunk;
  return {
    ...chunk,
    usage: {
      ...usage,
      prompt_tokens_details: { ...usage.prompt_tokens_details, cached_tokens: cachedRead },
    },
  };
}

function captureUsageAccounting(usage: OpenRouterChunkUsage, state: OpenRouterUsageState): void {
  const currentShapeWrite = usage.prompt_tokens_details?.cache_write_tokens;
  const legacyShapeWrite = usage.cache_creation_input_tokens;
  if (currentShapeWrite !== undefined) {
    state.cacheWriteTokens = currentShapeWrite;
  } else if (legacyShapeWrite !== undefined) {
    state.cacheWriteTokens = legacyShapeWrite;
  }
  if (usage.cost !== undefined) {
    state.costUsd = usage.cost;
  }
  if (usage.cache_discount !== undefined) {
    state.cacheDiscountUsd = usage.cache_discount;
  }
}

export interface OpenRouterUsageNormalizer {
  normalizeSource(chunks: AsyncIterable<OpenRouterChunk>): AsyncIterable<OpenAIChatCompletionChunk>;
  enrichOutput(chunks: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>;
}

export function createOpenRouterUsageNormalizer(): OpenRouterUsageNormalizer {
  const state: OpenRouterUsageState = { providerAttached: false };

  return {
    async *normalizeSource(chunks) {
      for await (const chunk of chunks) {
        if (typeof chunk.provider === 'string' && state.provider === undefined) {
          state.provider = chunk.provider;
        }
        if (chunk.usage) {
          captureUsageAccounting(chunk.usage, state);
        }
        yield normalizeReadShape(chunk);
      }
    },
    async *enrichOutput(chunks) {
      for await (const chunk of chunks) {
        if (
          chunk.type === 'response-meta' &&
          state.provider !== undefined &&
          !state.providerAttached
        ) {
          state.providerAttached = true;
          yield { ...chunk, provider: state.provider };
          continue;
        }
        if (chunk.type === 'usage') {
          if (state.provider !== undefined && !state.providerAttached) {
            state.providerAttached = true;
            yield { type: 'response-meta', provider: state.provider };
          }
          yield {
            ...chunk,
            ...(chunk.cacheWriteTokens === undefined && state.cacheWriteTokens !== undefined
              ? { cacheWriteTokens: state.cacheWriteTokens }
              : {}),
            ...(chunk.costUsd === undefined && state.costUsd !== undefined
              ? { costUsd: state.costUsd }
              : {}),
            ...(chunk.cacheDiscountUsd === undefined && state.cacheDiscountUsd !== undefined
              ? { cacheDiscountUsd: state.cacheDiscountUsd }
              : {}),
          };
        } else {
          yield chunk;
        }
      }
    },
  };
}
