import 'server-only';

import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { withSpan, type ActiveSpan } from '@/lib/observability/span';
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
 * Catalog-known native OpenAI models use the Responses API internally; the
 * route still returns its existing OpenAI-compatible Chat Completions wire
 * through `OpenAIWireAssembler`.
 */
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

/**
 * Builds the OpenRouter adapter, carrying the request's prompt-cache policy.
 *
 * OpenRouter injects Anthropic `cache_control` on `anthropic/*` routes and
 * defaults to `'short'` retention. A request arriving here by failover already
 * computed its own policy for the direct Anthropic call, and dropping it would
 * mean a request with caching disabled silently getting it back, or a
 * long-retention request being downgraded — invisible except as a change in
 * cost, since the request still succeeds either way.
 *
 * Harmless for non-Anthropic routes: the adapter only injects `cache_control`
 * on `anthropic/*` slugs, so passing retention for a Qwen or GLM route is a
 * no-op rather than a wrong header.
 */
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

/**
 * The stream-start body, split out so the span above wraps exactly the
 * connect-and-peek window.
 *
 * The span's `duration_ms` is therefore time-to-first-chunk (TTFT), NOT the
 * duration of the whole completion — the returned iterable is consumed by the
 * caller long after this resolves. Per-turn token usage is emitted separately
 * by `response-builder.ts`/`stream-transform.ts` and shares the same
 * `trace_id`.
 */
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
    // Carry the structured HTTP status (the error chunk's `code` is
    // `String(res.status)` for HTTP failures) onto the thrown Error so the
    // shared `classifyError` — which reads `.status`, never message text —
    // can categorize it. Managed failover (managed-failover.ts) rotates only
    // on availability-class categories, and without this a 503 would
    // classify as 'unknown' and never rotate. Message text is untouched
    // (buildUpstreamErrorResponse keyword-sniffs it — see this module's
    // docstring).
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
