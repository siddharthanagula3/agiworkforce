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
import {
  applyOpenRouterProviderRouting,
  type OpenRouterProviderRoutingPreferences,
} from './provider-routing';

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const OPENROUTER_DEFAULT_SITE_URL = 'https://agiworkforce.app';
const OPENROUTER_DEFAULT_APP_TITLE = 'AGI Workforce';

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
  skipDiscovery?: boolean;
  additionalAllowedBaseUrlHosts?: readonly string[];
  siteUrl?: string;
  appTitle?: string;
  anthropicCacheRetention?: OpenRouterAnthropicCacheRetention;
  providerRouting?: OpenRouterProviderRoutingPreferences;
}

const ENDPOINT_POOL_EXHAUSTED_MARKER = '0 endpoints out of';
const ENDPOINT_POOL_RETRIES = 2;

function isEndpointPoolExhausted(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes(ENDPOINT_POOL_EXHAUSTED_MARKER);
}

async function createWithEndpointPoolRetry<T>(create: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await create();
    } catch (err) {
      if (attempt >= ENDPOINT_POOL_RETRIES || !isEndpointPoolExhausted(err)) throw err;
    }
  }
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

      applyOpenRouterAnthropicCacheControl(params, anthropicCacheRetention, req);
      applyOpenRouterProviderRouting(
        params,
        config.providerRouting,
        req.metadata,
        req.zeroDataRetentionOnly,
      );

      params.stream_options = { include_usage: true };

      const normalizer = createOpenRouterUsageNormalizer();

      try {
        const sdkStream = await createWithEndpointPoolRetry(() =>
          sdk.chat.completions.create(
            params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
            { signal },
          ),
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
export {
  applyOpenRouterProviderRouting,
  type OpenRouterProviderRoutingPreferences,
  type OpenRouterDataCollectionPolicy,
} from './provider-routing';
