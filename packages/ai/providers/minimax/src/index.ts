/**
 * @agiworkforce/providers-minimax
 *
 * MiniMax provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. MiniMax ships an OpenAI-compatible Chat Completions
 * endpoint at `https://api.minimax.io/v1` (see `./base-url.ts`), so this is a
 * thin config wrapper around the shared `@agiworkforce/providers-openai`
 * translate/stream layer, the same pattern as deepseek/xai/moonshot.
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

import { MINIMAX_MODEL_CATALOG } from './catalog';
import { MINIMAX_DEFAULT_BASE_URL } from './base-url';

const MINIMAX_ALLOWED_BASE_HOSTS: readonly string[] = ['api.minimax.io', 'localhost', '127.0.0.1'];

const MINIMAX_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'MINIMAX_API_KEY',
    required: true,
    label: 'MiniMax API Key',
  },
];

export interface MinimaxAdapterConfig extends ProviderAdapterConfig {
  skipDiscovery?: boolean;
  additionalAllowedBaseUrlHosts?: readonly string[];
}

export function createMinimaxAdapter(config: MinimaxAdapterConfig = {}): ProviderAdapter {
  const { url: baseUrl } = resolveValidatedBaseUrl(config.baseUrl, MINIMAX_DEFAULT_BASE_URL, {
    allowedHosts: [...MINIMAX_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
  });

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'minimax',
    label: 'MiniMax',
    auth: MINIMAX_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...MINIMAX_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = MINIMAX_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'minimax' });
          }
        }
        return out;
      } catch {
        return [...MINIMAX_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'minimax',
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'minimax',
      });

      try {
        const sdkStream = await sdk.chat.completions.create(
          params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
          { signal },
        );
        const watched = withStreamIdleWatchdog(
          translateOpenAIStream(sdkStream as unknown as AsyncIterable<OpenAIChatCompletionChunk>),
        );
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

export const minimaxAdapterFactory: ProviderAdapterFactory = (config) =>
  createMinimaxAdapter(config as MinimaxAdapterConfig);

export { MINIMAX_MODEL_CATALOG } from './catalog';
export { MINIMAX_DEFAULT_BASE_URL } from './base-url';
