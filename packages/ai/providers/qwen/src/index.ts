/**
 * @agiworkforce/providers-qwen
 *
 * Qwen (Alibaba) provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Defaults to Alibaba DashScope's OpenAI-COMPATIBLE
 * mode (`https://dashscope.aliyuncs.com/compatible-mode/v1`) rather than the
 * DashScope native generation API — see `./base-url.ts` for why. The compat
 * layer registers the compatible-mode URL as
 * `endpointClass: 'modelstudio-native'` (see
 * `openai-responses-payload-policy.ts`'s `MODELSTUDIO_NATIVE_BASE_URLS`),
 * which enables native streaming-usage compat.
 *
 * Also supports MuleRouter (`https://api.mulerouter.ai`) as an alternate
 * OpenAI-compatible gateway, matching `apps/web/lib/llm-providers/qwen.ts`
 * (source of truth for this port) — see `applyQwenBaseUrlQuirks`.
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

import { QWEN_MODEL_CATALOG } from './catalog';
import { QWEN_DEFAULT_BASE_URL, applyQwenBaseUrlQuirks } from './base-url';

/** Hosts a `baseUrl` override is allowed to resolve to (SSRF allowlist). */
const QWEN_ALLOWED_BASE_HOSTS: readonly string[] = [
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'api.mulerouter.ai',
  'localhost',
  '127.0.0.1',
];

const QWEN_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'QWEN_API_KEY',
    required: true,
    label: 'Qwen API Key',
  },
];

/** An alternate Qwen-compatible endpoint tried on primary-endpoint failure. */
export interface QwenFallbackEndpoint {
  /** OpenAI-compatible base URL (e.g. MuleRouter). SSRF-validated like the primary. */
  baseUrl: string;
  /**
   * API key for this endpoint; falls back to the adapter's primary `apiKey`
   * when omitted. DashScope and MuleRouter use different keys, so this is
   * usually set.
   */
  apiKey?: string;
}

export interface QwenAdapterConfig extends ProviderAdapterConfig {
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
  /**
   * Ordered alternate endpoints, tried in order ONLY when the primary endpoint
   * fails with a transient/availability error BEFORE any content is streamed
   * (pre-first-byte). Enables DashScope (primary) → MuleRouter (fallback)
   * without risking duplicated output. This same primitive lifts to a shared
   * helper the moment a second OpenAI-compatible provider needs it (YAGNI:
   * only Qwen has two endpoints today).
   */
  fallbackEndpoints?: readonly QwenFallbackEndpoint[];
  /**
   * Extra hostnames a `baseUrl` override may resolve to, beyond
   * `dashscope.aliyuncs.com` / `dashscope-intl.aliyuncs.com` /
   * `api.mulerouter.ai` / `localhost` / `127.0.0.1`. A `baseUrl` whose host
   * isn't allowlisted falls back to the default base URL rather than being
   * trusted unconditionally (SSRF guard implemented by
   * `@agiworkforce/provider-runtime`).
   */
  additionalAllowedBaseUrlHosts?: readonly string[];
}

export function createQwenAdapter(config: QwenAdapterConfig = {}): ProviderAdapter {
  const { url: validatedBaseUrl } = resolveValidatedBaseUrl(config.baseUrl, QWEN_DEFAULT_BASE_URL, {
    allowedHosts: [...QWEN_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
  });
  const baseUrl = applyQwenBaseUrlQuirks(validatedBaseUrl);

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  // Pre-build the ordered fallback SDK clients once (reused across stream calls).
  // Each base URL is SSRF-validated against the same host allowlist as the
  // primary; a fallback that resolves to the primary base URL is dropped (no
  // point retrying the identical host).
  const fallbackSdks = (config.fallbackEndpoints ?? [])
    .map((endpoint) => {
      const { url } = resolveValidatedBaseUrl(endpoint.baseUrl, QWEN_DEFAULT_BASE_URL, {
        allowedHosts: [...QWEN_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
      });
      return { url: applyQwenBaseUrlQuirks(url), apiKey: endpoint.apiKey ?? config.apiKey };
    })
    .filter((endpoint) => endpoint.url !== baseUrl)
    .map(
      (endpoint) =>
        new OpenAI({
          ...(endpoint.apiKey ? { apiKey: endpoint.apiKey } : {}),
          baseURL: endpoint.url,
          ...(config.fetch ? { fetch: config.fetch } : {}),
        }),
    );

  return {
    id: 'qwen',
    label: 'Qwen',
    auth: QWEN_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...QWEN_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = QWEN_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'qwen' });
          }
        }
        return out;
      } catch {
        return [...QWEN_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'qwen',
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'qwen',
      });

      // Ordered endpoint chain: primary first, then any validated fallbacks.
      // Fail-over is PRE-FIRST-BYTE ONLY — once a chunk has been yielded we
      // never re-issue the request, so a mid-stream failure can neither
      // duplicate content nor re-run tool side effects.
      const endpoints = [sdk, ...fallbackSdks];
      let yielded = false;

      for (let attempt = 0; attempt < endpoints.length; attempt++) {
        const client = endpoints[attempt]!;
        try {
          const sdkStream = await client.chat.completions.create(
            params as unknown as Parameters<typeof client.chat.completions.create>[0],
            { signal },
          );
          const watched = withStreamIdleWatchdog(
            translateOpenAIStream(sdkStream as unknown as AsyncIterable<OpenAIChatCompletionChunk>),
          );
          for await (const chunk of watched) {
            yielded = true;
            yield chunk;
          }
          return;
        } catch (err) {
          const classified = classifyError(err);
          // Rotate to the next endpoint only if nothing was streamed yet, the
          // error is transient/availability-class, and an endpoint remains.
          if (!yielded && classified.retryable && attempt < endpoints.length - 1) {
            continue;
          }
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
          return;
        }
      }
    },
  };
}

export const qwenAdapterFactory: ProviderAdapterFactory = (config) =>
  createQwenAdapter(config as QwenAdapterConfig);

export { QWEN_MODEL_CATALOG } from './catalog';
export { QWEN_DEFAULT_BASE_URL, applyQwenBaseUrlQuirks } from './base-url';
