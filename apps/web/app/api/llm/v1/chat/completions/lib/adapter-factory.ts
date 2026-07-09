import 'server-only';

import { getOptionalEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { validateBaseUrl } from '@agiworkforce/llm-runtime';
import { createAnthropicAdapter } from '@agiworkforce/providers-anthropic';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import { computeAnthropicCacheConfig } from './canonical-request';
import type { ProcessedRequest } from './request-processor';
import { toUpstreamError } from './adapter-errors';

/**
 * Web-side `packages/providers/*` adapter construction (restructure Wave 2
 * step 5). Reads the SAME env vars `LLMProviderFactory.createProvider`
 * (apps/web/lib/llm-providers/factory.ts) reads for the managed-cloud tier's
 * own API key -- this is never a user BYOK key, matching the existing
 * behavior on this route.
 *
 * Only Anthropic is wired through the adapter path so far -- see task #34.
 * Other providers still dispatch through `LLMProviderFactory` in route.ts.
 */

/**
 * Builds a configured Anthropic `ProviderAdapter` for one request.
 *
 * Mirrors `LLMProviderFactory.createProvider('anthropic', ...)` +
 * `getProviderBaseUrl('anthropic')` exactly:
 *   - `ANTHROPIC_API_KEY` required, thrown as the same "not configured"
 *     message `LLMProviderFactory.sendRequest`/`streamRequest` throw today
 *     (route.ts's error handling / `buildUpstreamErrorResponse` doesn't
 *     branch on message text, but keeping it identical avoids surprises for
 *     any log-scraping or alerting keyed on it).
 *   - `ANTHROPIC_BASE_URL` optional override, validated via
 *     `@agiworkforce/llm-runtime`'s `validateBaseUrl` against
 *     `LLMProviderFactory.ALLOWED_BASE_HOSTS` (the exact set the legacy path
 *     enforces -- WEB-2 SSRF gate) instead of a hardcoded default: an absent
 *     or rejected override means `baseUrl` stays `undefined`, so the SDK
 *     (inside `createAnthropicAdapter`) falls back to ITS OWN trusted
 *     default rather than this file guessing/hardcoding one.
 *
 * `enableCacheControl`/`cacheRetention` come from `computeAnthropicCacheConfig`
 * (canonical-request.ts) -- per-request, since `usePromptCache` varies by
 * request, so the adapter is constructed fresh per call (matching
 * `LLMProviderFactory.createProvider`'s own per-call `new AnthropicProvider()`,
 * not a shared singleton).
 */
export function buildAnthropicAdapter(processed: ProcessedRequest): ProviderAdapter {
  const apiKey = getOptionalEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error(
      'Provider "anthropic" is not configured. ' +
        'Please ensure the ANTHROPIC_API_KEY environment variable is set. ' +
        'Check your .env.local file or deployment environment variables.',
    );
  }

  let baseUrl: string | undefined;
  const candidateBaseUrl = getOptionalEnv('ANTHROPIC_BASE_URL');
  if (candidateBaseUrl) {
    const validated = validateBaseUrl(candidateBaseUrl, {
      allowedHosts: LLMProviderFactory.ALLOWED_BASE_HOSTS,
    });
    if (validated.ok) {
      baseUrl = validated.url;
    } else {
      logger.warn(
        { envKey: 'ANTHROPIC_BASE_URL', reason: validated.reason, host: validated.hostname },
        'Refusing ANTHROPIC_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
      );
    }
  }

  const cacheConfig = computeAnthropicCacheConfig(processed);

  return createAnthropicAdapter({
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    enableCacheControl: cacheConfig.enableCacheControl,
    cacheRetention: cacheConfig.cacheRetention,
  });
}

/**
 * Start an Anthropic stream for one request, restoring the pre-migration
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
 * via `toUpstreamError` -- route.ts's catch block then runs
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
 */
export async function startAnthropicStream(
  adapter: ProviderAdapter,
  chatRequest: ChatRequest,
  signal: AbortSignal,
): Promise<AsyncIterable<StreamChunk>> {
  const iterator = adapter.stream(chatRequest, signal)[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (!first.done && first.value.type === 'error') {
    throw toUpstreamError(first.value);
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
