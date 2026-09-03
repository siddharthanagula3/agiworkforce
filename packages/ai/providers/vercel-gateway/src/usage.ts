import type { StreamChunk } from '@agiworkforce/types';
import type { OpenAIChatCompletionChunk } from '@agiworkforce/providers-openai';

interface VercelGatewayPromptTokensDetails {
  cached_tokens?: number;
  cache_write_tokens?: number;
}

interface VercelGatewayChunkUsage extends NonNullable<OpenAIChatCompletionChunk['usage']> {
  prompt_tokens_details?: VercelGatewayPromptTokensDetails;
  cost?: number;
}

interface VercelGatewayProviderMetadata {
  gateway?: { provider?: string };
}

interface VercelGatewayChunk extends OpenAIChatCompletionChunk {
  usage?: VercelGatewayChunkUsage | null;
  provider_metadata?: VercelGatewayProviderMetadata;
  providerMetadata?: VercelGatewayProviderMetadata;
}

interface VercelGatewayUsageState {
  cacheWriteTokens?: number;
  costUsd?: number;
  provider?: string;
  providerAttached: boolean;
}

function readServingProvider(chunk: VercelGatewayChunk): string | undefined {
  const snakeCase = chunk.provider_metadata?.gateway?.provider;
  if (typeof snakeCase === 'string') return snakeCase;
  const camelCase = chunk.providerMetadata?.gateway?.provider;
  return typeof camelCase === 'string' ? camelCase : undefined;
}

function captureUsageAccounting(
  usage: VercelGatewayChunkUsage,
  state: VercelGatewayUsageState,
): void {
  if (usage.prompt_tokens_details?.cache_write_tokens !== undefined) {
    state.cacheWriteTokens = usage.prompt_tokens_details.cache_write_tokens;
  }
  if (usage.cost !== undefined) {
    state.costUsd = usage.cost;
  }
}

export interface VercelGatewayUsageNormalizer {
  normalizeSource(
    chunks: AsyncIterable<VercelGatewayChunk>,
  ): AsyncIterable<OpenAIChatCompletionChunk>;
  enrichOutput(chunks: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>;
}

export function createVercelGatewayUsageNormalizer(): VercelGatewayUsageNormalizer {
  const state: VercelGatewayUsageState = { providerAttached: false };

  return {
    async *normalizeSource(chunks) {
      for await (const chunk of chunks) {
        const provider = readServingProvider(chunk);
        if (provider !== undefined && state.provider === undefined) {
          state.provider = provider;
        }
        if (chunk.usage) {
          captureUsageAccounting(chunk.usage, state);
        }
        yield chunk;
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
          };
        } else {
          yield chunk;
        }
      }
    },
  };
}
