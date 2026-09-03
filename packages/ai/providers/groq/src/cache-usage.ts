import type { OpenAIChatCompletionChunk } from '@agiworkforce/providers-openai';

interface GroqChatCompletionChunk extends OpenAIChatCompletionChunk {
  x_groq?: {
    id?: string;
    usage?: NonNullable<OpenAIChatCompletionChunk['usage']>;
  };
}

function normalizeChunk(chunk: GroqChatCompletionChunk): OpenAIChatCompletionChunk {
  const legacyUsage = chunk.x_groq?.usage;
  if (!legacyUsage || chunk.usage !== undefined) {
    return chunk;
  }
  return { ...chunk, usage: legacyUsage };
}

export async function* withGroqCacheUsageNormalization(
  chunks: AsyncIterable<GroqChatCompletionChunk>,
): AsyncIterable<OpenAIChatCompletionChunk> {
  for await (const chunk of chunks) {
    yield normalizeChunk(chunk);
  }
}
