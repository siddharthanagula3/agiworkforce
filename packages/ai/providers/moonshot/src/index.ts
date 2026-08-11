/**
 * @agiworkforce/providers-moonshot
 *
 * Moonshot AI (Kimi) provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Moonshot ships an OpenAI-compatible Chat Completions
 * endpoint at `https://api.moonshot.ai/v1`. The compat layer registers this
 * as `endpointClass: 'moonshot-native'` (see provider-attribution.ts +
 * openai-responses-payload-policy.ts's `MOONSHOT_NATIVE_BASE_URLS`), which
 * enables native streaming-usage compat (`stream_options.include_usage`).
 *
 * Response quirk (source of truth: `apps/web/lib/llm-providers/moonshot.ts`):
 * Moonshot reports cache-read tokens on a flat `usage.cached_tokens` field
 * instead of OpenAI's nested `usage.prompt_tokens_details.cached_tokens`.
 * `withMoonshotCacheUsageNormalization` rewrites the flat field into the
 * nested shape before the stream reaches `translateOpenAIStream`, so
 * `StreamChunkUsage.cacheReadTokens` is populated correctly. See
 * `./cache-usage.ts`.
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
import {
  translateChatRequest,
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { MOONSHOT_MODEL_CATALOG } from './catalog';
import { withMoonshotCacheUsageNormalization } from './cache-usage';

/**
 * Moonshot runs two separate platforms with separate accounts and separate
 * keys: `api.moonshot.ai` (international) and `api.moonshot.cn` (China). A key
 * issued for one is rejected by the other with a bare
 * `401 Invalid Authentication`, which reads as a bad key rather than a key
 * pointed at the wrong platform.
 *
 * The default was `.cn`, so an international key — the kind `founder_work.md`
 * documents, and the kind that lists the current curated model — failed out of the box with no
 * hint that the endpoint was the problem. `.cn` remains reachable through
 * `MOONSHOT_BASE_URL`; both hosts are allowlisted below and both are
 * registered in `MOONSHOT_NATIVE_BASE_URLS`, so the streaming-usage compat is
 * identical either way.
 */
const MOONSHOT_DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1';

/** Hosts a `baseUrl` override is allowed to resolve to (SSRF allowlist). */
const MOONSHOT_ALLOWED_BASE_HOSTS: readonly string[] = [
  'api.moonshot.cn',
  'api.moonshot.ai',
  'localhost',
  '127.0.0.1',
];

const MOONSHOT_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'MOONSHOT_API_KEY',
    required: true,
    label: 'Moonshot API Key',
  },
];

export interface MoonshotAdapterConfig extends ProviderAdapterConfig {
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
  /**
   * Extra hostnames a `baseUrl` override may resolve to, beyond
   * `api.moonshot.cn` / `api.moonshot.ai` / `localhost` / `127.0.0.1`. A
   * `baseUrl` whose host isn't allowlisted falls back to the default base
   * URL rather than being trusted unconditionally (SSRF guard implemented by
   * `@agiworkforce/provider-runtime`).
   */
  additionalAllowedBaseUrlHosts?: readonly string[];
}

export function createMoonshotAdapter(config: MoonshotAdapterConfig = {}): ProviderAdapter {
  const { url: baseUrl } = resolveValidatedBaseUrl(config.baseUrl, MOONSHOT_DEFAULT_BASE_URL, {
    allowedHosts: [...MOONSHOT_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
  });

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'moonshot',
    label: 'Moonshot AI',
    auth: MOONSHOT_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...MOONSHOT_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = MOONSHOT_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'moonshot' });
          }
        }
        return out;
      } catch {
        return [...MOONSHOT_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'moonshot',
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'moonshot',
      });

      try {
        const sdkStream = await sdk.chat.completions.create(
          params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
          { signal },
        );
        const normalized = withMoonshotCacheUsageNormalization(
          sdkStream as unknown as AsyncIterable<OpenAIChatCompletionChunk>,
        );
        const watched = withStreamIdleWatchdog(translateOpenAIStream(normalized));
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

export const moonshotAdapterFactory: ProviderAdapterFactory = (config) =>
  createMoonshotAdapter(config as MoonshotAdapterConfig);

export { MOONSHOT_MODEL_CATALOG } from './catalog';
export { withMoonshotCacheUsageNormalization } from './cache-usage';
