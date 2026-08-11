import 'server-only';

import { getOptionalEnv } from '@shared/utils/env';
import { logger } from '@/lib/logger';
import { toProviderApiModelId } from '@agiworkforce/provider-protocol';
import { validateBaseUrl, ALLOWED_MANAGED_PROVIDER_HOSTS } from '@agiworkforce/provider-runtime';
import {
  createProviderAdapter,
  type ProviderAdapterConfigMap,
  type ProviderAdapterId,
} from '@agiworkforce/providers-factory';
import { detectProviderFromModelId } from '@agiworkforce/types';
import { isRoutedViaOpenRouter, openRouterSlugFor } from './aggregator-routing';
import type { ProviderAdapter, StreamChunk } from '@agiworkforce/types';

/**
 * Server-managed-key `ProviderAdapter` construction shared by Web routes
 * that call an LLM provider with AGI's own API key. This is the Web owner for
 * environment lookup, base-URL validation, and provider SDK construction.
 *
 * The v1 chat-completions route passes only its derived Anthropic cache policy
 * through `ServerProviderAdapterOptions`; request parsing and routing remain
 * route-owned. Callers cannot replace the managed API key or base URL.
 *
 * Trust boundary: this only reads server environment variables. It never
 * accepts a caller-supplied key. BYOK construction is a separate, explicit
 * code path; do not route BYOK requests through this function.
 */

const SERVER_PROVIDER_CONFIG: Readonly<
  Record<string, { envPrefix: string; adapterId: ProviderAdapterId }>
> = {
  anthropic: { envPrefix: 'ANTHROPIC', adapterId: 'anthropic' },
  google: { envPrefix: 'GOOGLE', adapterId: 'google' },
  openai: { envPrefix: 'OPENAI', adapterId: 'openai' },
  minimax: { envPrefix: 'MINIMAX', adapterId: 'minimax' },
  moonshot: { envPrefix: 'MOONSHOT', adapterId: 'moonshot' },
  zhipu: { envPrefix: 'ZHIPU', adapterId: 'zhipu' },
  qwen: { envPrefix: 'QWEN', adapterId: 'qwen' },
  openrouter: { envPrefix: 'OPENROUTER', adapterId: 'open_router' },
  deepseek: { envPrefix: 'DEEPSEEK', adapterId: 'deepseek' },
  xai: { envPrefix: 'XAI', adapterId: 'xai' },
  perplexity: { envPrefix: 'PERPLEXITY', adapterId: 'perplexity' },
};

const PROVIDER_API_KEY_ENV_KEYS: Readonly<Record<string, readonly string[]>> = {
  google: ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'],
  // Qwen-direct = Alibaba DashScope; accept DASHSCOPE_API_KEY as an alias for the
  // primary key (matches the api-gateway) so a DashScope-primary deploy needs no
  // rename. QWEN_API_KEY still wins when both are set.
  qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
};

export interface ServerProviderAdapterOptions {
  /** Request-derived Anthropic prompt-cache policy; credentials remain service-owned. */
  anthropicCache?: Readonly<
    Pick<ProviderAdapterConfigMap['anthropic'], 'enableCacheControl' | 'cacheRetention'>
  >;
  /**
   * Prompt-cache retention for `anthropic/*` routes served through OpenRouter.
   *
   * OpenRouter passes Anthropic `cache_control` through and injects it itself,
   * defaulting to `'short'`. Without forwarding the request's own policy, a
   * request that had caching switched OFF would silently get it back on
   * failover, and one that asked for long retention would quietly be
   * downgraded — the request would still succeed, so the divergence would only
   * ever show up as an unexplained change in cost.
   */
  openRouterCacheRetention?: 'none' | 'short' | 'long';
}

/** All provider ids this service can construct an adapter for. */
export const SUPPORTED_SERVER_PROVIDER_IDS: readonly string[] = Object.keys(SERVER_PROVIDER_CONFIG);

/**
 * Compatibility alias for Web routes that construct a `ChatRequest` directly.
 * The canonical implementation is owned by `@agiworkforce/provider-protocol`.
 */
export const toApiModelId = toProviderApiModelId;

/**
 * Resolve models exclusively through the shared registry. Unknown or retired
 * IDs fail closed instead of being guessed from a vendor-looking substring or
 * silently sent to the OpenAI adapter. The Web dispatch key remains
 * `openrouter`; construction translates it to the canonical `open_router`
 * adapter ID.
 */
export function resolveProviderFromModel(model: string): string {
  const catalogProvider = detectProviderFromModelId(model);
  if (catalogProvider) {
    // Web chat's historical dispatch key is 'openrouter'; the aggregate
    // factory boundary translates that to the catalog's canonical
    // 'open_router' adapter id only when construction happens.
    if (catalogProvider === 'open_router') return 'openrouter';
    // MiniMax, Qwen and Zhipu are served through OpenRouter for now (see
    // aggregator-routing). Only redirect when the model actually has a slug
    // there — otherwise the request would reach OpenRouter under an id it does
    // not publish, which fails as a confusing 404 instead of a plain
    // "provider not configured".
    if (
      isRoutedViaOpenRouter(catalogProvider) &&
      openRouterSlugFor(toProviderApiModelId(model)) !== undefined
    ) {
      return 'openrouter';
    }
    return catalogProvider;
  }

  throw new Error('Model is not registered in the canonical model catalog');
}

/**
 * Provider-agnostic upstream error mapper for callers that dispatch to a
 * DYNAMICALLY resolved provider (via `resolveProviderFromModel`) rather than
 * a hardcoded one -- so a provider-branded mapper like the v1 route's
 * `toUpstreamError` (Anthropic-only wording) would mislabel the error if the
 * resolved provider ever isn't the one its name implies. Keeps the upstream
 * status code, since callers may classify on it (e.g.
 * settings/test-provider's 401/403/429 detection), while genericizing the
 * provider name in the message text.
 */
export function toGenericUpstreamError(
  providerId: string,
  chunk: Extract<StreamChunk, { type: 'error' }>,
): Error {
  const status = chunk.code ? Number(chunk.code) : undefined;
  const label = status !== undefined && Number.isFinite(status) ? `(${status})` : '(unknown)';
  return new Error(`${providerId} API error ${label}: ${chunk.message}`);
}

/**
 * Build a `ProviderAdapter` using AGI's server-side API key for `providerId`.
 * Throws a descriptive `Error` (never returns null/undefined) if the
 * provider id is unrecognized or its `{PREFIX}_API_KEY` env var is unset --
 * message text matches `adapter-factory.ts`'s existing per-provider builders
 * exactly, since some callers (e.g. settings/test-provider's error
 * classifier) pattern-match on it.
 */
export function buildServerProviderAdapter(
  providerId: string,
  options: ServerProviderAdapterOptions = {},
): ProviderAdapter {
  const providerConfig = SERVER_PROVIDER_CONFIG[providerId];
  if (!providerConfig) {
    throw new Error(`Provider "${providerId}" is not supported.`);
  }
  const { adapterId, envPrefix } = providerConfig;

  const apiKeyEnvKeys = PROVIDER_API_KEY_ENV_KEYS[providerId] ?? [`${envPrefix}_API_KEY`];
  let apiKey: string | undefined;
  for (const envKey of apiKeyEnvKeys) {
    apiKey = getOptionalEnv(envKey);
    if (apiKey) break;
  }
  if (!apiKey) {
    if (providerId === 'google') {
      throw new Error(
        'Provider "google" is not configured. ' +
          'Please set GOOGLE_API_KEY (or GEMINI_API_KEY). ' +
          'Check your .env.local file or deployment environment variables.',
      );
    }
    throw new Error(
      `Provider "${providerId}" is not configured. ` +
        `Please ensure the ${envPrefix}_API_KEY environment variable is set. ` +
        'Check your .env.local file or deployment environment variables.',
    );
  }

  let baseUrl: string | undefined;
  const candidateBaseUrl = getOptionalEnv(`${envPrefix}_BASE_URL`);
  if (candidateBaseUrl) {
    const validated = validateBaseUrl(candidateBaseUrl, {
      allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
    });
    if (validated.ok) {
      baseUrl = validated.url;
    } else {
      logger.warn(
        {
          providerId,
          envKey: `${envPrefix}_BASE_URL`,
          reason: validated.reason,
          host: validated.hostname,
        },
        'Refusing *_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
      );
    }
  }

  const baseConfig = { apiKey, ...(baseUrl ? { baseUrl } : {}) };
  if (providerId === 'anthropic' && options.anthropicCache) {
    return createProviderAdapter('anthropic', { ...baseConfig, ...options.anthropicCache });
  }
  if (adapterId === 'open_router' && options.openRouterCacheRetention !== undefined) {
    // Carry the request's prompt-cache policy onto the OpenRouter route so a
    // failed-over Anthropic request caches exactly as it would have directly.
    return createProviderAdapter('open_router', {
      ...baseConfig,
      anthropicCacheRetention: options.openRouterCacheRetention,
    });
  }
  if (providerId === 'openai') {
    return createProviderAdapter('openai', {
      ...baseConfig,
      onResponsesDiagnostics(responses) {
        logger.info({ providerId: 'openai', responses }, 'OpenAI Responses request completed');
      },
    });
  }
  if (providerId === 'qwen') {
    // Qwen resilience: an optional second endpoint tried on a pre-first-byte
    // availability error. MuleRouter filled this slot until 2026-07-27 and
    // nothing does today, so the block is inert unless QWEN_FALLBACK_BASE_URL
    // is set. Kept because the primitive is endpoint-agnostic. The fallback
    // carries its own key (QWEN_FALLBACK_API_KEY, else the primary) and is
    // SSRF-validated like the primary base URL.
    const fallbackRaw = getOptionalEnv('QWEN_FALLBACK_BASE_URL');
    if (fallbackRaw) {
      const validatedFallback = validateBaseUrl(fallbackRaw, {
        allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
      });
      if (validatedFallback.ok) {
        const fallbackKey = getOptionalEnv('QWEN_FALLBACK_API_KEY');
        return createProviderAdapter('qwen', {
          ...baseConfig,
          fallbackEndpoints: [
            { baseUrl: validatedFallback.url, ...(fallbackKey ? { apiKey: fallbackKey } : {}) },
          ],
        });
      }
      logger.warn(
        {
          providerId,
          envKey: 'QWEN_FALLBACK_BASE_URL',
          reason: validatedFallback.reason,
          host: validatedFallback.hostname,
        },
        'Refusing QWEN_FALLBACK_BASE_URL override pointing to a non-allowlisted host (potential SSRF)',
      );
    }
  }
  return createProviderAdapter(adapterId, baseConfig);
}
