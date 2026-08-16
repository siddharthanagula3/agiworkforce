
import type { StreamChunk } from '@agiworkforce/types';
import type { OpenAIChatCompletionChunk } from '@agiworkforce/providers-openai';

interface OpenRouterChunkUsage extends NonNullable<OpenAIChatCompletionChunk['usage']> {
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

interface OpenRouterChunk extends OpenAIChatCompletionChunk {
  usage?: OpenRouterChunkUsage | null;
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

export interface OpenRouterUsageNormalizer {
  normalizeSource(chunks: AsyncIterable<OpenRouterChunk>): AsyncIterable<OpenAIChatCompletionChunk>;
  enrichOutput(chunks: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>;
}

export function createOpenRouterUsageNormalizer(): OpenRouterUsageNormalizer {
  const state: { cacheWriteTokens?: number } = {};

  return {
    async *normalizeSource(chunks) {
      for await (const chunk of chunks) {
        if (chunk.usage?.cache_creation_input_tokens !== undefined) {
          state.cacheWriteTokens = chunk.usage.cache_creation_input_tokens;
        }
        yield normalizeReadShape(chunk);
      }
    },
    async *enrichOutput(chunks) {
      for await (const chunk of chunks) {
        if (chunk.type === 'usage' && state.cacheWriteTokens !== undefined) {
          yield {
            ...chunk,
            ...(chunk.cacheWriteTokens === undefined
              ? { cacheWriteTokens: state.cacheWriteTokens }
              : {}),
          };
        } else {
          yield chunk;
        }
      }
    },
  };
}
