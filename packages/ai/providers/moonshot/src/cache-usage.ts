
import type { OpenAIChatCompletionChunk } from '@agiworkforce/providers-openai';

interface MoonshotChatCompletionChunk extends OpenAIChatCompletionChunk {
  usage?:
    | (NonNullable<OpenAIChatCompletionChunk['usage']> & {
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
