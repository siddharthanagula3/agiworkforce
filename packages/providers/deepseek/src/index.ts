/**
 * @agiworkforce/providers-deepseek
 *
 * DeepSeek provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. DeepSeek ships an OpenAI-compatible Chat Completions
 * endpoint at `https://api.deepseek.com`. The compat layer registers this as
 * `endpointClass: 'deepseek-native'` (see provider-attribution.ts), which:
 *   - keeps `max_tokens` as the legacy field name (not `max_completion_tokens`)
 *   - uses `thinkingFormat: 'deepseek'` for `reasoning_content` deltas
 *   - skips OpenAI-specific `service_tier` / `prompt_cache_key`
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
import { classifyError, withStreamIdleWatchdog } from '@agiworkforce/llm-runtime';
import {
  translateChatRequest,
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { DEEPSEEK_MODEL_CATALOG } from './catalog';

const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';

const DEEPSEEK_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'DEEPSEEK_API_KEY',
    required: true,
    label: 'DeepSeek API Key',
  },
];

export interface DeepSeekAdapterConfig extends ProviderAdapterConfig {
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
}

export function createDeepSeekAdapter(config: DeepSeekAdapterConfig = {}): ProviderAdapter {
  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: config.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'deepseek',
    label: 'DeepSeek',
    auth: DEEPSEEK_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...DEEPSEEK_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = DEEPSEEK_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'deepseek' });
          }
        }
        return out;
      } catch {
        return [...DEEPSEEK_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'deepseek',
        baseUrl: config.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'deepseek',
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

export const deepseekAdapterFactory: ProviderAdapterFactory = (config) =>
  createDeepSeekAdapter(config as DeepSeekAdapterConfig);

export { DEEPSEEK_MODEL_CATALOG } from './catalog';
