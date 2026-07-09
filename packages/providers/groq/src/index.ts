/**
 * @agiworkforce/providers-groq
 *
 * Groq provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Groq ships an OpenAI-compatible Chat Completions
 * endpoint at `https://api.groq.com/openai/v1`, running on custom LPU
 * hardware for very high token throughput. The compat layer registers this
 * as `endpointClass: 'groq-native'` (see provider-attribution.ts).
 *
 * No response-shape quirks beyond the shared OpenAI Chat Completions
 * translate/stream layer: `apps/web/lib/llm-providers/groq.ts` (source of
 * truth for this port) uses the same message/tool mapping and standard
 * `usage.prompt_tokens` / `usage.completion_tokens` fields as OpenAI itself.
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

import { GROQ_MODEL_CATALOG } from './catalog';

const GROQ_DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

/** Hosts a `baseUrl` override is allowed to resolve to (SSRF allowlist). */
const GROQ_ALLOWED_BASE_HOSTS: readonly string[] = ['api.groq.com', 'localhost', '127.0.0.1'];

const GROQ_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'GROQ_API_KEY',
    required: true,
    label: 'Groq API Key',
  },
];

export interface GroqAdapterConfig extends ProviderAdapterConfig {
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
  /**
   * Extra hostnames a `baseUrl` override may resolve to, beyond
   * `api.groq.com` / `localhost` / `127.0.0.1` — e.g. an enterprise
   * Groq-compatible gateway. A `baseUrl` whose host isn't allowlisted falls
   * back to the default base URL rather than being sent to unconditionally
   * (SSRF guard; mirrors `apps/web/lib/llm-providers/factory.ts`).
   */
  additionalAllowedBaseUrlHosts?: readonly string[];
}

export function createGroqAdapter(config: GroqAdapterConfig = {}): ProviderAdapter {
  const { url: baseUrl } = resolveValidatedBaseUrl(config.baseUrl, GROQ_DEFAULT_BASE_URL, {
    allowedHosts: [...GROQ_ALLOWED_BASE_HOSTS, ...(config.additionalAllowedBaseUrlHosts ?? [])],
  });

  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    baseURL: baseUrl,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'groq',
    label: 'Groq',
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
            out.push({ id, provider: 'groq' });
          }
        }
        return out;
      } catch {
        return [...GROQ_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      const detected = detectOpenAICompletionsCompat({
        provider: 'groq',
        baseUrl,
        id: req.model,
      });

      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'groq',
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

export const groqAdapterFactory: ProviderAdapterFactory = (config) =>
  createGroqAdapter(config as GroqAdapterConfig);

export { GROQ_MODEL_CATALOG } from './catalog';
