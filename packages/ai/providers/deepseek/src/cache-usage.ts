import type { OpenAIChatCompletionChunk } from '@agiworkforce/providers-openai';

interface DeepSeekChatCompletionChunk extends OpenAIChatCompletionChunk {
  usage?:
    | (NonNullable<OpenAIChatCompletionChunk['usage']> & {
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
      })
    | null;
}

function normalizeChunk(chunk: DeepSeekChatCompletionChunk): OpenAIChatCompletionChunk {
  const usage = chunk.usage;
  if (!usage || usage.prompt_cache_hit_tokens === undefined) {
    return chunk;
  }
  if (usage.prompt_tokens_details?.cached_tokens !== undefined) {
    return chunk;
  }
  return {
    ...chunk,
    usage: {
      ...usage,
      prompt_tokens_details: {
        ...usage.prompt_tokens_details,
        cached_tokens: usage.prompt_cache_hit_tokens,
      },
    },
  };
}

export async function* withDeepSeekCacheUsageNormalization(
  chunks: AsyncIterable<DeepSeekChatCompletionChunk>,
): AsyncIterable<OpenAIChatCompletionChunk> {
  for await (const chunk of chunks) {
    yield normalizeChunk(chunk);
  }
}
