/**
 * @agiworkforce/providers-xai
 *
 * xAI (Grok) provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. xAI ships an OpenAI-compatible Chat Completions
 * endpoint at `https://api.x.ai/v1`, so we reuse the OpenAI translate/stream
 * layer with `provider: 'xai'` so the compat detector returns
 * `endpointClass: 'xai-native'` defaults (no `service_tier`, no Responses API).
 *
 * Differentiator: Grok 4 Fast supports up to 2M-token context and Grok 4.3
 * exposes `reasoning_content` deltas — both surfaced via the existing OpenAI
 * `translateOpenAIStream` (which already maps `reasoning_content` →
 * `thinking-delta`).
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
import { detectOpenAICompletionsCompat } from '@agiworkforce/llm-normalize';
import {
  translateChatRequest,
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { XAI_MODEL_CATALOG } from './catalog';

const XAI_DEFAULT_BASE_URL = 'https://api.x.ai/v1';

const XAI_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'XAI_API_KEY',
    required: true,
    label: 'xAI API Key',
  },
];

export interface XAIAdapterConfig extends ProviderAdapterConfig {
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
}

export function createXAIAdapter(config: XAIAdapterConfig = {}): ProviderAdapter {
  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: config.baseUrl ?? XAI_DEFAULT_BASE_URL,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'xai',
    label: 'xAI',
    auth: XAI_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...XAI_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = XAI_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'xai' });
          }
        }
        return out;
      } catch {
        return [...XAI_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'xai',
        baseUrl: config.baseUrl ?? XAI_DEFAULT_BASE_URL,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'xai',
      });

      try {
        const sdkStream = await sdk.chat.completions.create(
          params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
          { signal },
        );
        for await (const chunk of translateOpenAIStream(
          sdkStream as unknown as AsyncIterable<OpenAIChatCompletionChunk>,
        )) {
          yield chunk;
        }
      } catch (err) {
        const error = err as Error & { status?: number };
        const retryable =
          typeof error.status === 'number' && (error.status === 429 || error.status >= 500);
        yield {
          type: 'error',
          message: error.message ?? 'xAI request failed',
          ...(typeof error.status === 'number' ? { code: String(error.status) } : {}),
          retryable,
        };
        yield { type: 'stop', reason: 'error' };
      }
    },
  };
}

export const xaiAdapterFactory: ProviderAdapterFactory = (config) =>
  createXAIAdapter(config as XAIAdapterConfig);

export { XAI_MODEL_CATALOG } from './catalog';
