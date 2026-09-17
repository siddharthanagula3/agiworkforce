import 'server-only';

import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { OBSERVABILITY_ATTRIBUTE } from '@/lib/observability/attributes';
import { captureModelFailure } from '@/lib/observability/error-capture';
import { withSpan, type ActiveSpan } from '@/lib/observability/span';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import { computeAnthropicCacheConfig } from './canonical-request';
import type { ProcessedRequest } from './request-processor';

const MODEL_FAILURE_UNKNOWN_CODE = 'unknown';

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

export function buildGroqAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('groq');
}

export function buildNvidiaNimAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('nvidia_nim');
}

export function buildWorkersAiAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('workers_ai');
}

export function buildVercelGatewayAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('vercel_gateway');
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
        [OBSERVABILITY_ATTRIBUTE.requestModel]: chatRequest.model,
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
  if (!first.done && first.value.type === 'response-meta') {
    span.setAttributes({
      [OBSERVABILITY_ATTRIBUTE.providerRequestId]: first.value.id,
      [OBSERVABILITY_ATTRIBUTE.responseModel]: first.value.model,
      [OBSERVABILITY_ATTRIBUTE.providerName]: first.value.provider,
    });
  }
  if (!first.done && first.value.type === 'error') {
    const mapped = mapError(first.value);
    const errorCode = first.value.code ?? MODEL_FAILURE_UNKNOWN_CODE;
    span.setAttributes({ 'gen_ai.response.error_code': errorCode });
    captureModelFailure(mapped, {
      provider: adapter.id,
      model: chatRequest.model,
      errorCode,
    });
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
