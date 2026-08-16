import 'server-only';

import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { withSpan, type ActiveSpan } from '@/lib/observability/span';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import { computeAnthropicCacheConfig } from './canonical-request';
import type { ProcessedRequest } from './request-processor';

export function buildAnthropicAdapter(processed: ProcessedRequest): ProviderAdapter {
  const cacheConfig = computeAnthropicCacheConfig(processed);
  return buildServerProviderAdapter('anthropic', {
    anthropicCache: cacheConfig,
  });
}

export function buildGoogleAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('google');
}

export function buildOpenAIAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('openai');
}

export function buildMinimaxAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('minimax');
}

export function buildMoonshotAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('moonshot');
}

export function buildZhipuAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('zhipu');
}

export function buildQwenAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('qwen');
}

export function buildOpenRouterAdapter(processed?: ProcessedRequest): ProviderAdapter {
  if (!processed) return buildServerProviderAdapter('openrouter');
  const { enableCacheControl, cacheRetention } = computeAnthropicCacheConfig(processed);
  return buildServerProviderAdapter('openrouter', {
    openRouterCacheRetention: enableCacheControl ? cacheRetention : 'none',
  });
}

export function buildDeepSeekAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('deepseek');
}

export function buildXAIAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('xai');
}

export function buildPerplexityAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('perplexity');
}

export async function startProviderStream(
  adapter: ProviderAdapter,
  chatRequest: ChatRequest,
  signal: AbortSignal,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
): Promise<AsyncIterable<StreamChunk>> {
  return withSpan(
    'gen_ai.stream.start',
    {
      kind: 'client',
      domain: 'model',
      attributes: {
        'gen_ai.request.model': chatRequest.model,
        'gen_ai.request.tool_count': chatRequest.tools?.length ?? 0,
        'gen_ai.request.stream': true,
      },
    },
    (span) => startProviderStreamInner(adapter, chatRequest, signal, mapError, span),
  );
}

async function startProviderStreamInner(
  adapter: ProviderAdapter,
  chatRequest: ChatRequest,
  signal: AbortSignal,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
  span: ActiveSpan,
): Promise<AsyncIterable<StreamChunk>> {
  const iterator = adapter.stream(chatRequest, signal)[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (!first.done && first.value.type === 'error') {
    const mapped = mapError(first.value);
    span.setAttributes({ 'gen_ai.response.error_code': first.value.code ?? 'unknown' });
    const status = first.value.code ? Number(first.value.code) : Number.NaN;
    if (Number.isInteger(status) && status >= 100 && status <= 599) {
      (mapped as Error & { status?: number }).status = status;
    }
    throw mapped;
  }
  return {
    [Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
      let firstConsumed = false;
      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          if (!firstConsumed) {
            firstConsumed = true;
            if (!first.done) {
              return { done: false, value: first.value };
            }
            return { done: true, value: undefined };
          }
          return iterator.next();
        },
      };
    },
  };
}
