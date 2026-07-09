/**
 * OpenRouter usage normalization.
 *
 * OpenRouter proxies to hundreds of underlying models and reshapes usage
 * differently depending on which one served the request (confirmed in
 * `apps/web/lib/llm-providers/openrouter.ts`, the source of truth for this
 * port):
 *
 *   - Anthropic-routed models (`anthropic/*`) report Anthropic-style usage:
 *     `usage.cache_read_input_tokens` / `usage.cache_creation_input_tokens`.
 *   - Everything else gets normalized into the OpenAI shape, but OpenRouter
 *     has been observed nesting the cache-read count under EITHER
 *     `usage.prompt_tokens_details.cached_tokens` (what
 *     `translateOpenAIStream` already reads) OR `usage.input_tokens_details.
 *     cached_tokens` — a second nesting key not every vendor uses.
 *
 * `translateOpenAIStream` (from `@agiworkforce/providers-openai`) only reads
 * `prompt_tokens_details.cached_tokens` for cache reads, and has no path at
 * all for cache-creation ("write") tokens — OpenAI's own API has no such
 * concept, so the shared translator never populates
 * `StreamChunkUsage.cacheWriteTokens`. `createOpenRouterUsageNormalizer`
 * closes both gaps without modifying the shared translator:
 *   1. `normalizeSource` rewrites the read-side fields into the nested shape
 *      `translateOpenAIStream` already understands (mirrors Moonshot's
 *      normalizer), and records the source `cache_creation_input_tokens`.
 *   2. `enrichOutput` wraps `translateOpenAIStream`'s output and merges the
 *      recorded write-token count onto the terminal `usage` StreamChunk.
 *
 * Ordering is safe because `normalizeSource` must yield the raw chunk that
 * carries `cache_creation_input_tokens` before `translateOpenAIStream` can
 * derive and yield the `usage` StreamChunk built from it — generators only
 * advance when pulled, so the write-token state is always recorded before
 * `enrichOutput` inspects it.
 */

import type { StreamChunk } from '@agiworkforce/types';
import type { OpenAIChatCompletionChunk } from '@agiworkforce/providers-openai';

interface OpenRouterChunkUsage extends NonNullable<OpenAIChatCompletionChunk['usage']> {
  /** Anthropic-style cache-read counter (present for anthropic/* routes). */
  cache_read_input_tokens?: number;
  /** Anthropic-style cache-write counter (present for anthropic/* routes). */
  cache_creation_input_tokens?: number;
  /** Alternate OpenAI-shape nesting some non-Anthropic routes use. */
  input_tokens_details?: { cached_tokens?: number };
}

interface OpenRouterChunk extends OpenAIChatCompletionChunk {
  usage?: OpenRouterChunkUsage | null;
}

function normalizeReadShape(chunk: OpenRouterChunk): OpenAIChatCompletionChunk {
  const usage = chunk.usage;
  if (!usage) return chunk;
  if (usage.prompt_tokens_details?.cached_tokens !== undefined) {
    return chunk; // already in the shape translateOpenAIStream reads.
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
  /** Wrap the raw SDK stream before handing it to `translateOpenAIStream`. */
  normalizeSource(chunks: AsyncIterable<OpenRouterChunk>): AsyncIterable<OpenAIChatCompletionChunk>;
  /** Wrap `translateOpenAIStream`'s output to merge in the write-token count. */
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
