/**
 * @agiworkforce/providers-lmstudio
 *
 * LMStudio provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. LMStudio runs a local OpenAI-compatible server
 * (default `http://localhost:1234/v1`). Available models depend entirely on
 * what the user has loaded in LMStudio, so there is no curated catalog —
 * `catalog()` queries `/v1/models` dynamically every call.
 *
 * Closes the local-LLM gap alongside `@agiworkforce/providers-ollama`. Used
 * via the existing OpenAI translate/stream layer with `provider: 'lmstudio'`
 * which the compat detector classifies as `endpointClass: 'local'`.
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

const LMSTUDIO_DEFAULT_BASE_URL = 'http://localhost:1234/v1';

const LMSTUDIO_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'LMSTUDIO_API_KEY',
    required: false,
    label: 'LMStudio API Key (optional)',
  },
];

export interface LMStudioAdapterConfig extends ProviderAdapterConfig {
  /**
   * Override the default `http://localhost:1234/v1` baseUrl. LMStudio can be
   * configured to listen on a different port or LAN IP.
   */
  baseUrl?: string;
}

export function createLMStudioAdapter(config: LMStudioAdapterConfig = {}): ProviderAdapter {
  const baseURL = config.baseUrl ?? LMSTUDIO_DEFAULT_BASE_URL;
  const sdk = new OpenAI({
    // LMStudio doesn't require auth by default but the SDK requires _some_ key.
    apiKey: config.apiKey ?? 'lm-studio',
    baseURL,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'lmstudio',
    label: 'LMStudio',
    auth: LMSTUDIO_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const out: ModelInfo[] = [];
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') {
            out.push({ id: entry.id, provider: 'lmstudio' });
          }
        }
        return out;
      } catch {
        return [];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'lmstudio',
        baseUrl: baseURL,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'lmstudio',
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

export const lmstudioAdapterFactory: ProviderAdapterFactory = (config) =>
  createLMStudioAdapter(config as LMStudioAdapterConfig);

export const LMSTUDIO_DEFAULT_BASE_URL_VALUE = LMSTUDIO_DEFAULT_BASE_URL;
