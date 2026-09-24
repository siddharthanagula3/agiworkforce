import type { StreamChunk, UpstreamFrameShape } from '@agiworkforce/types';
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
  upstreamFrameShape: UpstreamFrameShape;
}

function observeUpstreamFrame(chunk: OpenRouterChunk, shape: UpstreamFrameShape): void {
  shape.frames += 1;
  for (const choice of chunk.choices ?? []) {
    const delta = choice.delta as typeof choice.delta & {
      reasoning?: unknown;
      reasoning_details?: unknown;
    };
    if (typeof delta?.content === 'string' && delta.content.length > 0) {
      shape.contentFrames += 1;
      shape.contentChars += delta.content.length;
    }
    const reasoning =
      typeof delta?.reasoning === 'string' ? delta.reasoning : delta?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      shape.reasoningFrames += 1;
      shape.reasoningChars += reasoning.length;
    }
    if (Array.isArray(delta?.reasoning_details) && delta.reasoning_details.length > 0) {
      shape.reasoningDetailFrames += 1;
      shape.reasoningDetailItems += delta.reasoning_details.length;
    }
    if (delta?.tool_calls?.length) shape.toolCallFrames += 1;
    if (choice.finish_reason) shape.finishFrames += 1;
  }
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
  const state: OpenRouterUsageState = {
    providerAttached: false,
    upstreamFrameShape: {
      frames: 0,
      contentFrames: 0,
      contentChars: 0,
      reasoningFrames: 0,
      reasoningChars: 0,
      reasoningDetailFrames: 0,
      reasoningDetailItems: 0,
      toolCallFrames: 0,
      finishFrames: 0,
    },
  };

  const upstreamTrace = (): StreamChunk => ({
    type: 'response-meta',
    upstreamFrameShape: { ...state.upstreamFrameShape },
  });

  return {
    async *normalizeSource(chunks) {
      for await (const chunk of chunks) {
        observeUpstreamFrame(chunk, state.upstreamFrameShape);
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
      try {
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
      } catch (error) {
        yield upstreamTrace();
        throw error;
      }
      yield upstreamTrace();
    },
  };
}
