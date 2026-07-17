/**
 * @agiworkforce/providers-openrouter
 *
 * OpenRouter provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. OpenRouter routes to hundreds of underlying models
 * via an OpenAI-compatible Chat Completions endpoint at
 * `https://openrouter.ai/api/v1`. The compat layer registers this as
 * `endpointClass: 'openrouter'` (see provider-attribution.ts), which sets
 * `thinkingFormat: 'openrouter'` for reasoning-model routes.
 *
 * Three quirks ported from `apps/web/lib/llm-providers/openrouter.ts`
 * (source of truth for this port — see the per-module docstrings):
 *   1. Required attribution headers (`HTTP-Referer` / `X-Title`) per
 *      OpenRouter ToS — configurable via `siteUrl` / `appTitle`, no hard
 *      Next.js env dependency (see below).
 *   2. Anthropic `cache_control` passthrough on the system message for
 *      `anthropic/*` routes — `./cache-control.ts`.
 *   3. Usage normalization for the two non-standard cache-token shapes
 *      OpenRouter emits depending on the routed model — `./usage.ts`.
 *
 * @packageDocumentation
 */

import OpenAI from 'openai';
import type {
  AuthMethod,
  ChatRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderAdapterFactory,
  ProviderCatalogContext,
  StreamChunk,
} from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';
import {
  classifyError,
  resolveValidatedBaseUrl,
  withStreamIdleWatchdog,
} from '@agiworkforce/provider-runtime';
import { translateChatRequest, translateOpenAIStream } from '@agiworkforce/providers-openai';

import { OPENROUTER_MODEL_CATALOG } from './catalog';
import {
  applyOpenRouterAnthropicCacheControl,
  type OpenRouterAnthropicCacheRetention,
} from './cache-control';
import { createOpenRouterUsageNormalizer } from './usage';

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Fallback attribution values, matching the literal fallbacks in
 * `apps/web/lib/llm-providers/openrouter.ts` (`NEXT_PUBLIC_APP_URL ||
 * 'https://agiworkforce.app'` and `'AGI Workforce'`). This package has no
 * Next.js dependency, so callers that want the env-driven site URL pass it
 * in explicitly via `config.siteUrl` (e.g. the web app reads
 * `process.env.NEXT_PUBLIC_APP_URL` itself and forwards it).
 */
const OPENROUTER_DEFAULT_SITE_URL = 'https://agiworkforce.app';
const OPENROUTER_DEFAULT_APP_TITLE = 'AGI Workforce';

/** Hosts a `baseUrl` override is allowed to resolve to (SSRF allowlist). */
const OPENROUTER_ALLOWED_BASE_HOSTS: readonly string[] = [
  'openrouter.ai',
  'localhost',
  '127.0.0.1',
];

const OPENROUTER_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'OPENROUTER_API_KEY',
    required: true,
    label: 'OpenRouter API Key',
  },
];

export interface OpenRouterAdapterConfig extends ProviderAdapterConfig {
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
  /**
   * Extra hostnames a `baseUrl` override may resolve to, beyond
   * `openrouter.ai` / `localhost` / `127.0.0.1`. A `baseUrl` whose host
   * isn't allowlisted falls back to the default base URL rather than being
   * trusted unconditionally (SSRF guard implemented by
   * `@agiworkforce/provider-runtime`).
   */
  additionalAllowedBaseUrlHosts?: readonly string[];
  /** `HTTP-Referer` attribution header value. Default `'https://agiworkforce.app'`. */
  siteUrl?: string;
  /** `X-Title` attribution header value. Default `'AGI Workforce'`. */
  appTitle?: string;
  /**
   * Cache retention for the Anthropic `cache_control` block injected on
   * `anthropic/*` routes. Default `'short'` (5-minute ephemeral), matching
   * the web adapter's default. Pass `'none'` to disable.
   */
  anthropicCacheRetention?: OpenRouterAnthropicCacheRetention;
}

export function createOpenRouterAdapter(config: OpenRouterAdapterConfig = {}): ProviderAdapter {
  const { url: baseUrl } = resolveValidatedBaseUrl(config.baseUrl, OPENROUTER_DEFAULT_BASE_URL, {
    allowedHosts: [
      ...OPENROUTER_ALLOWED_BASE_HOSTS,
      ...(config.additionalAllowedBaseUrlHosts ?? []),
    ],
  });
  const anthropicCacheRetention = config.anthropicCacheRetention ?? 'short';

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
    // Required by OpenRouter ToS — see module docstring.
    defaultHeaders: {
      'HTTP-Referer': config.siteUrl ?? OPENROUTER_DEFAULT_SITE_URL,
      'X-Title': config.appTitle ?? OPENROUTER_DEFAULT_APP_TITLE,
    },
  });

  return {
    id: 'open_router',
    label: 'OpenRouter',
    auth: OPENROUTER_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...OPENROUTER_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = OPENROUTER_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'open_router' });
          }
        }
        return out;
      } catch {
        return [...OPENROUTER_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'open_router',
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'open_router',
      });

      // Quirk: Anthropic cache_control passthrough for anthropic/* routes.
      applyOpenRouterAnthropicCacheControl(params, anthropicCacheRetention);

      // Request a final usage event before [DONE] — mirrors the web
      // adapter's streamRequest(), which sets this explicitly rather than
      // relying on the (host-unrecognized-by-default) compat resolver.
      params.stream_options = { include_usage: true };

      const normalizer = createOpenRouterUsageNormalizer();

      try {
        const sdkStream = await sdk.chat.completions.create(
          params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
          { signal },
        );
        const normalizedSource = normalizer.normalizeSource(
          sdkStream as unknown as Parameters<typeof normalizer.normalizeSource>[0],
        );
        const translated = translateOpenAIStream(normalizedSource);
        const enriched = normalizer.enrichOutput(translated);
        const watched = withStreamIdleWatchdog(enriched);
        for await (const chunk of watched) {
          yield chunk;
        }
      } catch (err) {
        const classified = classifyError(err);
        yield {
          type: 'error',
          message: classified.message,
          ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
          retryable: classified.retryable,
          ...(classified.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: classified.retryAfterSeconds }
            : {}),
        };
        yield { type: 'stop', reason: 'error' };
      }
    },
  };
}

export const openrouterAdapterFactory: ProviderAdapterFactory = (config) =>
  createOpenRouterAdapter(config as OpenRouterAdapterConfig);

export { OPENROUTER_MODEL_CATALOG } from './catalog';
export {
  applyOpenRouterAnthropicCacheControl,
  type OpenRouterAnthropicCacheRetention,
} from './cache-control';
export { createOpenRouterUsageNormalizer, type OpenRouterUsageNormalizer } from './usage';
