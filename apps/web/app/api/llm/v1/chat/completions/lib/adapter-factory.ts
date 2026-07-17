import 'server-only';

import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import { computeAnthropicCacheConfig } from './canonical-request';
import type { ProcessedRequest } from './request-processor';

/**
 * Route-local builders keep the chat dispatch table stable while delegating
 * server-managed credentials, base-URL validation, and SDK construction to
 * `provider-adapter-service`. This file owns only request-specific adaptation
 * and stream-start behavior; it never accepts BYOK credentials.
 */

/**
 * Builds a configured Anthropic `ProviderAdapter` for one request.
 *
 * `enableCacheControl`/`cacheRetention` come from `computeAnthropicCacheConfig`
 * because prompt-cache policy varies per request. The shared service owns all
 * other construction inputs.
 */
export function buildAnthropicAdapter(processed: ProcessedRequest): ProviderAdapter {
  const cacheConfig = computeAnthropicCacheConfig(processed);
  return buildServerProviderAdapter('anthropic', {
    anthropicCache: cacheConfig,
  });
}

/**
 * Builds a configured Google `ProviderAdapter` for one request.
 *
 * Google has no route-specific construction options.
 */
export function buildGoogleAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('google');
}

/**
 * Builds a configured OpenAI `ProviderAdapter` for one request.
 *
 * The shared service preserves this route family's Chat Completions wire
 * contract by constructing OpenAI adapters with `useResponsesApi: false`.
 */
export function buildOpenAIAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('openai');
}

export function buildGroqAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('groq');
}

export function buildMistralAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('mistral');
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

export function buildOpenRouterAdapter(): ProviderAdapter {
  return buildServerProviderAdapter('openrouter');
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

/**
 * Start a provider stream for one request, restoring the pre-migration
 * "a request that fails immediately throws" contract.
 *
 * `ProviderAdapter.stream()` is an async generator: calling it runs no code
 * and issues no HTTP request until the first `.next()` (i.e. the first
 * `for await` iteration) -- unlike the old `await LLMProviderFactory.
 * streamRequest(...)`, which performed the fetch and awaited response
 * headers before route.ts ever committed to a 200 streaming response. And
 * per `buildAnthropicAdapter`'s docstring, the adapter's `.stream()` never
 * throws at all -- upstream failures become a `{type:'error'}` chunk
 * instead (see `./adapter-errors.ts`). Left alone, a request that fails
 * before producing any content would silently become a 200 SSE/JSON
 * response with empty content and no refund of the caller's reserved
 * credits or free-trial prompt.
 *
 * Fix: eagerly pull the FIRST chunk here (still inside route.ts's existing
 * try/catch, before any response is constructed). If it's an error, throw
 * via the caller-supplied `mapError` (`toUpstreamError` for Anthropic,
 * `toGoogleUpstreamError` for Google -- provider-specific message text, see
 * adapter-errors.ts) -- route.ts's catch block then runs
 * `refundFailedReservation` + `buildUpstreamErrorResponse` exactly as it
 * does for the legacy path. Otherwise, transparently replay the already-
 * pulled first chunk back onto the returned iterable so no data is lost.
 *
 * Only covers a failure on the FIRST chunk (auth/rate-limit/network errors
 * connecting -- by far the common case, and the only case the legacy
 * non-streaming-style `await ... streamRequest()` call could ever catch
 * before committing to a response). A failure that occurs after some
 * content was already streamed is NOT specially handled here -- the legacy
 * raw-SSE pipeline had no special handling for that case either (the
 * connection just ends); disclosed gap, not a silent regression on the
 * common path.
 *
 * Generic across providers (originally Anthropic-only as `startAnthropic
 * Stream`; genericized when Google was wired in -- task #34's Google slice).
 * The peek-and-throw MECHANICS never depended on which provider produced the
 * chunks; only the error message text did, hence `mapError` as a parameter
 * instead of a hardcoded import.
 */
export async function startProviderStream(
  adapter: ProviderAdapter,
  chatRequest: ChatRequest,
  signal: AbortSignal,
  mapError: (chunk: Extract<StreamChunk, { type: 'error' }>) => Error,
): Promise<AsyncIterable<StreamChunk>> {
  const iterator = adapter.stream(chatRequest, signal)[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (!first.done && first.value.type === 'error') {
    throw mapError(first.value);
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
