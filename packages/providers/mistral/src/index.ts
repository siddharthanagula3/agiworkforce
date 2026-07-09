/**
 * @agiworkforce/providers-mistral
 *
 * Mistral AI provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Mistral ships an OpenAI-compatible Chat Completions
 * endpoint at `https://api.mistral.ai/v1`. The compat layer registers this as
 * `endpointClass: 'mistral-public'` / `knownProviderFamily: 'mistral'` (see
 * provider-attribution.ts + openai-completions-compat.ts), which:
 *   - keeps `max_tokens` as the field name (not `max_completion_tokens`)
 *   - does not send `store` (Mistral's API doesn't support server-side storage)
 *   - does not send `reasoning_effort` (no OpenAI-style reasoning-effort knob)
 *
 * All three fall out of `detectOpenAICompletionsCompat({ provider: 'mistral' })`
 * automatically — no adapter-local overrides needed. No other response-shape
 * quirks found in `apps/web/lib/llm-providers/mistral.ts` (source of truth for
 * this port): messages, tools, and usage all use the plain OpenAI shape.
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
  classifyError,
  resolveValidatedBaseUrl,
  withStreamIdleWatchdog,
} from '@agiworkforce/llm-runtime';
import {
  translateChatRequest,
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';

import { MISTRAL_MODEL_CATALOG } from './catalog';

const MISTRAL_DEFAULT_BASE_URL = 'https://api.mistral.ai/v1';

/** Hosts a `baseUrl` override is allowed to resolve to (SSRF allowlist). */
const MISTRAL_ALLOWED_BASE_HOSTS: readonly string[] = ['api.mistral.ai', 'localhost', '127.0.0.1'];

const MISTRAL_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'MISTRAL_API_KEY',
    required: true,
    label: 'Mistral API Key',
  },
];

export interface MistralAdapterConfig extends ProviderAdapterConfig {
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
  /**
   * Extra hostnames a `baseUrl` override may resolve to, beyond
   * `api.mistral.ai` / `localhost` / `127.0.0.1`. A `baseUrl` whose host
   * isn't allowlisted falls back to the default base URL rather than being
   * trusted unconditionally (SSRF guard; mirrors
   * `apps/web/lib/llm-providers/factory.ts`).
   */
  additionalAllowedBaseUrlHosts?: readonly string[];
}

export function createMistralAdapter(config: MistralAdapterConfig = {}): ProviderAdapter {
  const { url: baseUrl } = resolveValidatedBaseUrl(config.baseUrl, MISTRAL_DEFAULT_BASE_URL, {
    allowedHosts: [...MISTRAL_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
  });

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'mistral',
    label: 'Mistral AI',
    auth: MISTRAL_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...MISTRAL_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        const out: ModelInfo[] = MISTRAL_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'mistral' });
          }
        }
        return out;
      } catch {
        return [...MISTRAL_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'mistral',
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'mistral',
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

export const mistralAdapterFactory: ProviderAdapterFactory = (config) =>
  createMistralAdapter(config as MistralAdapterConfig);

export { MISTRAL_MODEL_CATALOG } from './catalog';
