/**
 * @agiworkforce/providers-zhipu
 *
 * ZhipuAI (GLM / BigModel) provider adapter implementing `ProviderAdapter`
 * from `@agiworkforce/types`. Zhipu ships an OpenAI-compatible Chat
 * Completions endpoint at `https://open.bigmodel.cn/api/paas/v4` with Bearer
 * token auth. Source of truth for the quirks below:
 * `apps/web/lib/llm-providers/zhipu.ts`.
 *
 * Quirks NOT covered by the shared `detectOpenAICompletionsCompat` bundled
 * hostname table (`open.bigmodel.cn` isn't in it, only the newer global
 * `api.z.ai` alias resolves to `endpointClass: 'zai-native'`, so this
 * adapter applies two local overrides instead of relying on the shared
 * default for an unrecognized host, which would otherwise silently send
 * `max_completion_tokens` and never enable GLM's thinking mode):
 *
 *   1. `max_tokens` field, the web adapter always sends `max_tokens`
 *      (never `max_completion_tokens`); BigModel's documented API expects
 *      the legacy field name. We force `maxTokensField: 'max_tokens'`
 *      after compat detection rather than trusting the generic
 *      unrecognized-proxy default (`max_completion_tokens`).
 *   2. GLM "thinking mode", a `{ thinking: { type: 'enabled' | 'disabled' } }`
 *      request field, distinct from OpenAI's `reasoning_effort` enum (which
 *      compat detection correctly disables for this unrecognized host, so it
 *      would otherwise never be set). Mapped from `ChatRequest.thinking`
 *      after the shared translate step.
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

import { ZHIPU_MODEL_CATALOG } from './catalog';

const ZHIPU_DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

const ZHIPU_ALLOWED_BASE_HOSTS: readonly string[] = [
  'open.bigmodel.cn',
  'api.z.ai',
  'localhost',
  '127.0.0.1',
];

const ZHIPU_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'ZHIPU_API_KEY',
    required: true,
    label: 'ZhipuAI API Key',
  },
];

export interface ZhipuAdapterConfig extends ProviderAdapterConfig {
  skipDiscovery?: boolean;
  additionalAllowedBaseUrlHosts?: readonly string[];
}

export function applyZhipuThinkingMode(
  params: Record<string, unknown>,
  thinking: ChatRequest['thinking'],
): void {
  if (!thinking) return;
  params['thinking'] = { type: thinking.type };
}

export function createZhipuAdapter(config: ZhipuAdapterConfig = {}): ProviderAdapter {
  const { url: baseUrl } = resolveValidatedBaseUrl(config.baseUrl, ZHIPU_DEFAULT_BASE_URL, {
    allowedHosts: [...ZHIPU_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
  });

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'zhipu',
    label: 'ZhipuAI',
    auth: ZHIPU_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...ZHIPU_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = ZHIPU_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'zhipu' });
          }
        }
        return out;
      } catch {
        return [...ZHIPU_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'zhipu',
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: { ...detected.defaults, maxTokensField: 'max_tokens' },
        provider: 'zhipu',
      });

      applyZhipuThinkingMode(params as unknown as Record<string, unknown>, req.thinking);

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

export const zhipuAdapterFactory: ProviderAdapterFactory = (config) =>
  createZhipuAdapter(config as ZhipuAdapterConfig);

export { ZHIPU_MODEL_CATALOG } from './catalog';
