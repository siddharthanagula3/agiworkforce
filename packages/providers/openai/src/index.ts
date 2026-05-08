/**
 * @agiworkforce/providers-openai
 *
 * OpenAI provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Uses the official `openai` npm SDK for transport
 * (Chat Completions API, streaming SSE) plus
 * `@agiworkforce/llm-normalize` for cross-vendor payload shaping.
 *
 * Default: Chat Completions API. Works for GPT-4.x, GPT-5.x, Codex variants,
 * and any OpenAI-compatible endpoint (Azure OpenAI, OpenRouter, local
 * vLLM/sglang, etc.) when configured with the right `baseUrl`.
 *
 * The Responses API (with server-side `store`, `prompt_cache_key`, server
 * compaction) is NOT yet wired here — defer until our chat layer needs it.
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
import {
  detectOpenAICompletionsCompat,
  resolveOpenAIResponsesPayloadPolicy,
  applyOpenAIResponsesPayloadPolicy,
} from '@agiworkforce/llm-normalize';

import { OPENAI_MODEL_CATALOG } from './catalog';
import { translateChatRequest } from './translate';
import { translateOpenAIStream } from './stream';
import { translateChatRequestToResponses } from './translate-responses';
import { translateOpenAIResponsesStream } from './stream-responses';
import type { OpenAIChatCompletionChunk } from './types';
import type { ResponsesStreamEvent } from './responses-types';

const OPENAI_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'OPENAI_API_KEY',
    required: true,
    label: 'OpenAI API Key',
  },
  {
    kind: 'oauth-device-code',
    deviceCodeUrl: 'https://auth.openai.com/oauth/device/code',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    clientId: 'agiworkforce',
    label: 'ChatGPT Account (Codex)',
  },
];

export interface OpenAIAdapterConfig extends ProviderAdapterConfig {
  /** Organization id (legacy `OpenAI-Organization` header). */
  organization?: string;
  /** Project id (`OpenAI-Project` header). */
  project?: string;
  /** Skip dynamic /models discovery — return only the curated catalog. */
  skipDiscovery?: boolean;
  /** Send `service_tier` on requests where allowed (api.openai.com only). */
  serviceTier?: 'auto' | 'default' | 'flex';
  /**
   * Use the Responses API (`/v1/responses`) instead of Chat Completions.
   * Required for o-series and GPT-5.x server-side reasoning state. Default
   * `false` — Chat Completions covers the broad chat use case and is the
   * lower-friction path for proxies / Azure / OpenRouter.
   */
  useResponsesApi?: boolean;
  /**
   * For the Responses path: when `true`, the server stores the response so
   * subsequent requests can chain via `previous_response_id`. Default
   * `false` — stateless, matching Chat Completions semantics. Wave 3
   * (Hobby/Pro tier) can flip this on for a server-side conversation cache.
   */
  responsesStore?: boolean;
}

export function createOpenAIAdapter(config: OpenAIAdapterConfig = {}): ProviderAdapter {
  const sdk = new OpenAI({
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    ...(config.organization ? { organization: config.organization } : {}),
    ...(config.project ? { project: config.project } : {}),
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  return {
    id: 'openai',
    label: 'OpenAI',
    auth: OPENAI_AUTH_METHODS,
    config,

    async catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]> {
      if (config.skipDiscovery) {
        return [...OPENAI_MODEL_CATALOG];
      }
      try {
        const list = await sdk.models.list({ ...(ctx?.signal ? { signal: ctx.signal } : {}) });
        const ids = new Set<string>();
        for (const entry of list.data ?? []) {
          if (typeof entry.id === 'string') ids.add(entry.id);
        }
        // Merge: prefer curated metadata; surface any newer ids from /models
        // that aren't in the curated list as id-only entries.
        const out: ModelInfo[] = OPENAI_MODEL_CATALOG.filter(
          (m) => ids.size === 0 || ids.has(m.id),
        ).map((m) => ({ ...m }));
        for (const id of ids) {
          if (!out.some((m) => m.id === id)) {
            out.push({ id, provider: 'openai' });
          }
        }
        return out;
      } catch {
        return [...OPENAI_MODEL_CATALOG];
      }
    },

    async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk> {
      // 1. Detect this (provider, baseUrl, model) combo's compat profile.
      const detected = detectOpenAICompletionsCompat({
        provider: 'openai',
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        id: req.model,
      });

      // 1a. Branch: Responses API path (`/v1/responses`).
      if (config.useResponsesApi) {
        try {
          const responsesParams = translateChatRequestToResponses(req, {
            compat: detected.defaults,
            ...(config.responsesStore !== undefined ? { store: config.responsesStore } : {}),
            ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
          });
          // SDK type churns; cast at the boundary.
          const sdkStream = await sdk.responses.create(
            responsesParams as unknown as Parameters<typeof sdk.responses.create>[0],
            { signal },
          );
          for await (const chunk of translateOpenAIResponsesStream(
            sdkStream as unknown as AsyncIterable<ResponsesStreamEvent>,
          )) {
            yield chunk;
          }
          return;
        } catch (err) {
          const error = err as Error & { status?: number };
          const retryable =
            typeof error.status === 'number' && (error.status === 429 || error.status >= 500);
          yield {
            type: 'error',
            message: error.message ?? 'OpenAI Responses request failed',
            ...(typeof error.status === 'number' ? { code: String(error.status) } : {}),
            retryable,
          };
          yield { type: 'stop', reason: 'error' };
          return;
        }
      }

      // 2. Translate the request using compat-aware shape rules.
      const params = translateChatRequest(req, {
        compat: detected.defaults,
        provider: 'openai',
      });

      // 3. Apply Responses API payload policy on top — this also handles the
      //    Chat Completions case for `store`/`prompt_cache_key`/`service_tier`
      //    when the gate matches.
      const policy = resolveOpenAIResponsesPayloadPolicy(
        {
          provider: 'openai',
          api: 'openai-completions',
          ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
          id: req.model,
        },
        {
          enablePromptCacheStripping: true,
          enableServerCompaction: false,
        },
      );
      const payload = params as unknown as Record<string, unknown>;
      applyOpenAIResponsesPayloadPolicy(payload, policy);

      // service_tier (only allowed on the openai-public + responses combination,
      // but Chat Completions accepts it too on api.openai.com)
      if (config.serviceTier && payload['service_tier'] === undefined) {
        payload['service_tier'] = config.serviceTier;
      }

      // 4. Send via SDK; SDK returns an async iterable of typed chunks.
      try {
        const sdkStream = await sdk.chat.completions.create(
          // Cast at the boundary — our hand-typed shape is a subset of the SDK's.
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
          message: error.message ?? 'OpenAI request failed',
          ...(typeof error.status === 'number' ? { code: String(error.status) } : {}),
          retryable,
        };
        yield { type: 'stop', reason: 'error' };
      }
    },
  };
}

export const openaiAdapterFactory: ProviderAdapterFactory = (config) =>
  createOpenAIAdapter(config as OpenAIAdapterConfig);

export { OPENAI_MODEL_CATALOG } from './catalog';
export { translateChatRequest } from './translate';
export { translateOpenAIStream } from './stream';
export { translateChatRequestToResponses } from './translate-responses';
export { translateOpenAIResponsesStream } from './stream-responses';
export type * from './types';
export type * from './responses-types';
