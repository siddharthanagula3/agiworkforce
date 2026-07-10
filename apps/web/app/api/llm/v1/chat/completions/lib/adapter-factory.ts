import 'server-only';

import { getOptionalEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { validateBaseUrl, ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/llm-runtime';
import { createAnthropicAdapter } from '@agiworkforce/providers-anthropic';
import { createGoogleAdapter } from '@agiworkforce/providers-google';
import { createOpenAIAdapter } from '@agiworkforce/providers-openai';
import { createGroqAdapter } from '@agiworkforce/providers-groq';
import { createMistralAdapter } from '@agiworkforce/providers-mistral';
import { createMoonshotAdapter } from '@agiworkforce/providers-moonshot';
import { createZhipuAdapter } from '@agiworkforce/providers-zhipu';
import { createQwenAdapter } from '@agiworkforce/providers-qwen';
import { createOpenRouterAdapter } from '@agiworkforce/providers-openrouter';
import { createDeepSeekAdapter } from '@agiworkforce/providers-deepseek';
import { createXAIAdapter } from '@agiworkforce/providers-xai';
import { createPerplexityAdapter } from '@agiworkforce/providers-perplexity';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import { computeAnthropicCacheConfig } from './canonical-request';
import type { ProcessedRequest } from './request-processor';

/**
 * Web-side `packages/providers/*` adapter construction (restructure Wave 2
 * step 5). Reads the SAME env vars `LLMProviderFactory.createProvider`
 * (apps/web/lib/llm-providers/factory.ts) reads for the managed-cloud tier's
 * own API key -- this is never a user BYOK key, matching the existing
 * behavior on this route.
 *
 * Anthropic, Google, OpenAI, and the 9 openai-compat providers (groq,
 * mistral, moonshot, zhipu, qwen, openrouter, deepseek, xai, perplexity) are
 * wired through the adapter path -- see task #34. That is every provider the
 * model catalog resolves a chat request to (`getProviderFromModel`'s catalog
 * lookup + heuristic fallback chain never produces anything outside this
 * set), so route.ts no longer carries a `LLMProviderFactory` dispatch
 * fallback for "every other provider".
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
 *     `@agiworkforce/llm-runtime`'s `validateBaseUrl` against that package's
 *     own `ALLOWED_MANAGED_PROVIDER_HOSTS` (WEB-2 SSRF gate; canonicalized
 *     there from the legacy `LLMProviderFactory.ALLOWED_BASE_HOSTS` during
 *     lib/llm-providers's retirement, task #34) instead of a hardcoded
 *     default: an absent or rejected override means `baseUrl` stays
 *     `undefined`, so the SDK
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
      allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
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
 * Builds a configured Google `ProviderAdapter` for one request.
 *
 * Mirrors `buildAnthropicAdapter`'s structure exactly, reading `GOOGLE_API_
 * KEY`/`GOOGLE_BASE_URL` (same env keys `LLMProviderFactory.getProviderBase
 * Url`/`getEnvKeyForProvider` use for 'google') against the SAME shared
 * `ALLOWED_BASE_HOSTS` SSRF allowlist. No cache-config equivalent -- Google
 * has no `cache_control`-style knob the legacy provider ever set.
 */
export function buildGoogleAdapter(): ProviderAdapter {
  // Accept GOOGLE_API_KEY, plus the legacy cloud-chat name (GOOGLE_AI_API_KEY)
  // and Google's own current preferred name (GEMINI_API_KEY) as aliases.
  const apiKey =
    getOptionalEnv('GOOGLE_API_KEY') ||
    getOptionalEnv('GOOGLE_AI_API_KEY') ||
    getOptionalEnv('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'Provider "google" is not configured. ' +
        'Please set GOOGLE_API_KEY (or GEMINI_API_KEY). ' +
        'Check your .env.local file or deployment environment variables.',
    );
  }

  let baseUrl: string | undefined;
  const candidateBaseUrl = getOptionalEnv('GOOGLE_BASE_URL');
  if (candidateBaseUrl) {
    const validated = validateBaseUrl(candidateBaseUrl, {
      allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
    });
    if (validated.ok) {
      baseUrl = validated.url;
    } else {
      logger.warn(
        { envKey: 'GOOGLE_BASE_URL', reason: validated.reason, host: validated.hostname },
        'Refusing GOOGLE_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
      );
    }
  }

  return createGoogleAdapter({
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
  });
}

/**
 * Builds a configured OpenAI `ProviderAdapter` for one request.
 *
 * Mirrors `buildAnthropicAdapter`/`buildGoogleAdapter`'s structure, reading
 * `OPENAI_API_KEY`/`OPENAI_BASE_URL` against the same shared
 * `ALLOWED_BASE_HOSTS` SSRF allowlist.
 *
 * `useResponsesApi: false` is REQUIRED, not a style choice:
 * `createOpenAIAdapter` defaults to routing any catalog-known model with
 * tool/vision/thinking/etc. capabilities through the Responses API
 * (`shouldUseOpenAIResponsesApi` in packages/providers/openai/src/index.ts)
 * -- i.e. most real GPT models. Legacy `apps/web/lib/llm-providers/
 * openai.ts` is hardcoded to `/chat/completions` for every model. Without
 * forcing this off, the web v1 route would silently dispatch most OpenAI
 * requests through a different vendor endpoint than legacy ever used, and
 * every Chat-Completions-specific fix in `packages/providers/openai/src/
 * translate.ts` (hasTools-gates-reasoning_effort, web_search_preview
 * stripping) would simply never fire for them.
 */
export function buildOpenAIAdapter(): ProviderAdapter {
  const apiKey = getOptionalEnv('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'Provider "openai" is not configured. ' +
        'Please ensure the OPENAI_API_KEY environment variable is set. ' +
        'Check your .env.local file or deployment environment variables.',
    );
  }

  let baseUrl: string | undefined;
  const candidateBaseUrl = getOptionalEnv('OPENAI_BASE_URL');
  if (candidateBaseUrl) {
    const validated = validateBaseUrl(candidateBaseUrl, {
      allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
    });
    if (validated.ok) {
      baseUrl = validated.url;
    } else {
      logger.warn(
        { envKey: 'OPENAI_BASE_URL', reason: validated.reason, host: validated.hostname },
        'Refusing OPENAI_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
      );
    }
  }

  return createOpenAIAdapter({
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    useResponsesApi: false,
  });
}

/**
 * Shared construction logic for the 9 openai-compat providers (task #34's
 * compat batch): each `packages/providers/{provider}` package is a thin
 * config wrapper around the SAME `@agiworkforce/providers-openai` translate/
 * stream layer (confirmed by reading each package -- e.g. groq/src/index.ts's
 * own docstring: "No response-shape quirks beyond the shared OpenAI Chat
 * Completions translate/stream layer"), so their `build*Adapter` functions
 * here would otherwise be 9 copies of `buildOpenAIAdapter`'s env-read +
 * SSRF-validate + construct boilerplate differing only in the env var prefix
 * and the `create*Adapter` function called. `envKeyPrefix` matches
 * `apps/web/lib/llm-providers/factory.ts`'s own `{PROVIDER}_API_KEY`/
 * `{PROVIDER}_BASE_URL` env var naming exactly (verified against its
 * `getEnvKeyForProvider`/`providerBaseUrlEnvMap` for all 9).
 *
 * No `useResponsesApi` equivalent here -- these packages call
 * `sdk.chat.completions.create()` directly (no Responses-API branching import
 * proven per-package), so there's nothing to force off.
 */
function buildCompatAdapter(spec: {
  providerId: string;
  envKeyPrefix: string;
  create: (config: { apiKey: string; baseUrl?: string }) => ProviderAdapter;
}): ProviderAdapter {
  const apiKey = getOptionalEnv(`${spec.envKeyPrefix}_API_KEY`);
  if (!apiKey) {
    throw new Error(
      `Provider "${spec.providerId}" is not configured. ` +
        `Please ensure the ${spec.envKeyPrefix}_API_KEY environment variable is set. ` +
        'Check your .env.local file or deployment environment variables.',
    );
  }

  let baseUrl: string | undefined;
  const candidateBaseUrl = getOptionalEnv(`${spec.envKeyPrefix}_BASE_URL`);
  if (candidateBaseUrl) {
    const validated = validateBaseUrl(candidateBaseUrl, {
      allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
    });
    if (validated.ok) {
      baseUrl = validated.url;
    } else {
      logger.warn(
        {
          envKey: `${spec.envKeyPrefix}_BASE_URL`,
          reason: validated.reason,
          host: validated.hostname,
        },
        `Refusing ${spec.envKeyPrefix}_BASE_URL override pointing to a non-allowlisted host (potential SSRF)`,
      );
    }
  }

  return spec.create({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
}

export function buildGroqAdapter(): ProviderAdapter {
  return buildCompatAdapter({
    providerId: 'groq',
    envKeyPrefix: 'GROQ',
    create: createGroqAdapter,
  });
}

export function buildMistralAdapter(): ProviderAdapter {
  return buildCompatAdapter({
    providerId: 'mistral',
    envKeyPrefix: 'MISTRAL',
    create: createMistralAdapter,
  });
}

export function buildMoonshotAdapter(): ProviderAdapter {
  return buildCompatAdapter({
    providerId: 'moonshot',
    envKeyPrefix: 'MOONSHOT',
    create: createMoonshotAdapter,
  });
}

export function buildZhipuAdapter(): ProviderAdapter {
  return buildCompatAdapter({
    providerId: 'zhipu',
    envKeyPrefix: 'ZHIPU',
    create: createZhipuAdapter,
  });
}

export function buildQwenAdapter(): ProviderAdapter {
  return buildCompatAdapter({
    providerId: 'qwen',
    envKeyPrefix: 'QWEN',
    create: createQwenAdapter,
  });
}

export function buildOpenRouterAdapter(): ProviderAdapter {
  return buildCompatAdapter({
    providerId: 'openrouter',
    envKeyPrefix: 'OPENROUTER',
    create: createOpenRouterAdapter,
  });
}

export function buildDeepSeekAdapter(): ProviderAdapter {
  return buildCompatAdapter({
    providerId: 'deepseek',
    envKeyPrefix: 'DEEPSEEK',
    create: createDeepSeekAdapter,
  });
}

export function buildXAIAdapter(): ProviderAdapter {
  return buildCompatAdapter({ providerId: 'xai', envKeyPrefix: 'XAI', create: createXAIAdapter });
}

export function buildPerplexityAdapter(): ProviderAdapter {
  return buildCompatAdapter({
    providerId: 'perplexity',
    envKeyPrefix: 'PERPLEXITY',
    create: createPerplexityAdapter,
  });
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
