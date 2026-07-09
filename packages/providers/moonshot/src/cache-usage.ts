/**
 * Moonshot cache-usage normalization.
 *
 * Moonshot's Chat Completions response reports cache-read tokens on a flat
 * `usage.cached_tokens` field, not OpenAI's nested
 * `usage.prompt_tokens_details.cached_tokens` shape (confirmed in
 * `apps/web/lib/llm-providers/moonshot.ts`, which reads
 * `data.usage?.cached_tokens` directly). `translateOpenAIStream` from
 * `@agiworkforce/providers-openai` only reads the nested field, so without
 * this normalization Moonshot's cache-read counter would be silently
 * dropped. Rewrite the flat field into the nested shape before handing the
 * stream to `translateOpenAIStream` — a no-op passthrough for chunks that
 * already carry the nested shape (e.g., if Moonshot changes its API to
 * match OpenAI in the future).
 */

import type { OpenAIChatCompletionChunk } from '@agiworkforce/providers-openai';

interface MoonshotChatCompletionChunk extends OpenAIChatCompletionChunk {
  usage?:
    | (NonNullable<OpenAIChatCompletionChunk['usage']> & {
        /** Flat cache-read counter — Moonshot's non-standard usage field. */
        cached_tokens?: number;
      })
    | null;
}

function normalizeChunk(chunk: MoonshotChatCompletionChunk): OpenAIChatCompletionChunk {
  const usage = chunk.usage;
  if (!usage || usage.cached_tokens === undefined) {
    return chunk;
  }
  if (usage.prompt_tokens_details?.cached_tokens !== undefined) {
    // Already nested (future API alignment) — nothing to normalize.
    return chunk;
  }
  return {
    ...chunk,
    usage: {
      ...usage,
      prompt_tokens_details: {
        ...usage.prompt_tokens_details,
        cached_tokens: usage.cached_tokens,
      },
    },
  };
}

export async function* withMoonshotCacheUsageNormalization(
  chunks: AsyncIterable<MoonshotChatCompletionChunk>,
): AsyncIterable<OpenAIChatCompletionChunk> {
  for await (const chunk of chunks) {
    yield normalizeChunk(chunk);
  }
}
