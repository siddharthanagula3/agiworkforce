/**
 * @agiworkforce/providers-groq
 *
 * Groq provider adapter. Groq serves an OpenAI-compatible Chat Completions
 * endpoint at `https://api.groq.com/openai/v1`, which the compat layer already
 * classifies as `endpointClass: 'groq-native'` (see provider-attribution.ts).
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
import { classifyError, withStreamIdleWatchdog } from '@agiworkforce/provider-runtime';
import {
  translateChatRequest,
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { GROQ_MODEL_CATALOG } from './catalog';
import { withGroqCacheUsageNormalization } from './cache-usage';

const GROQ_PROVIDER_ID = 'groq';
const GROQ_LABEL = 'Groq';
const GROQ_API_KEY_ENV_VAR = 'GROQ_API_KEY';
const GROQ_DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

const GROQ_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: GROQ_API_KEY_ENV_VAR,
    required: true,
    label: 'Groq API Key',
  },
];

export interface GroqAdapterConfig extends ProviderAdapterConfig {
  skipDiscovery?: boolean;
}

export function createGroqAdapter(config: GroqAdapterConfig = {}): ProviderAdapter {
  const baseUrl = config.baseUrl ?? GROQ_DEFAULT_BASE_URL;
  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: GROQ_PROVIDER_ID,
    label: GROQ_LABEL,
    auth: GROQ_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...GROQ_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = GROQ_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: GROQ_PROVIDER_ID });
          }
        }
        return out;
      } catch {
        return [...GROQ_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: GROQ_PROVIDER_ID,
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: GROQ_PROVIDER_ID,
      });

      try {
        const sdkStream = await sdk.chat.completions.create(
          params as unknown as Parameters<typeof sdk.chat.completions.create>[0],
          { signal },
        );
        const normalized = withGroqCacheUsageNormalization(
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

export const groqAdapterFactory: ProviderAdapterFactory = (config) =>
  createGroqAdapter(config as GroqAdapterConfig);

export { GROQ_MODEL_CATALOG } from './catalog';
export { withGroqCacheUsageNormalization } from './cache-usage';
