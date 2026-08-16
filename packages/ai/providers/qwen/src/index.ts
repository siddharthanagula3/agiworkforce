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
 * MuleRouter was removed as a gateway on 2026-07-27; Qwen now reaches us
 * either direct via DashScope or through OpenRouter. `baseUrl` overrides
 * stay allowlisted to DashScope hosts and loopback only.
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
import { QWEN_DEFAULT_BASE_URL } from './base-url';

const QWEN_ALLOWED_BASE_HOSTS: readonly string[] = [
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
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

export interface QwenFallbackEndpoint {
  baseUrl: string;
  apiKey?: string;
}

export interface QwenAdapterConfig extends ProviderAdapterConfig {
  skipDiscovery?: boolean;
  fallbackEndpoints?: readonly QwenFallbackEndpoint[];
  additionalAllowedBaseUrlHosts?: readonly string[];
}

export function createQwenAdapter(config: QwenAdapterConfig = {}): ProviderAdapter {
  const { url: validatedBaseUrl } = resolveValidatedBaseUrl(config.baseUrl, QWEN_DEFAULT_BASE_URL, {
    allowedHosts: [...QWEN_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
  });
  const baseUrl = validatedBaseUrl;

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  const fallbackSdks = (config.fallbackEndpoints ?? [])
    .map((endpoint) => {
      const { url } = resolveValidatedBaseUrl(endpoint.baseUrl, QWEN_DEFAULT_BASE_URL, {
        allowedHosts: [...QWEN_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
      });
      return { url, apiKey: endpoint.apiKey ?? config.apiKey };
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
export { QWEN_DEFAULT_BASE_URL } from './base-url';
