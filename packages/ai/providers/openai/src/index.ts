/**
 * @agiworkforce/providers-openai
 *
 * OpenAI provider adapter implementing `ProviderAdapter` from
 * `@agiworkforce/types`. Uses the official `openai` npm SDK for transport
 * (Chat Completions API + Responses API streaming) plus
 * `@agiworkforce/provider-protocol` for cross-vendor payload shaping.
 *
 * Default: Responses API for catalog-known, streamable text/chat models on
 * the native OpenAI route. OpenAI-compatible proxies, unknown models, and
 * non-chat media models stay on Chat Completions unless a future adapter adds
 * first-class support for their native APIs. Server-side `store` still defaults
 * off unless `responsesStore` is explicitly enabled.
 *
 * WHY TWO ADAPTERS EXIST:
 * This package implements the cross-surface ProviderAdapter contract used by
 * CLI, desktop, and the web's /api/v1/providers/* routes via
 * @agiworkforce/provider-protocol.
 *
 * The web app also has a separate fetch-based adapter at
 * apps/web/lib/llm-providers/openai.ts that implements BaseLLMProvider for
 * the web-internal /api/llm/v1 and /api/llm/v2 routes. That adapter cannot
 * be replaced by this one because it speaks a different contract
 * (LLMProviderRequest/LLMProviderResponse vs ChatRequest/StreamChunk).
 *
 * Both adapters share model ID resolution from the single source of truth
 * in packages/contracts/types/src/models.json via @agiworkforce/types imports.
 * Full consolidation would require migrating the web's internal LLM layer
 * to the ProviderAdapter contract; tracked as a separate refactor.
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
} from '@agiworkforce/provider-protocol';

import {
  classifyError,
  withStreamIdleWatchdog,
  parseRetryAfterFromError,
} from '@agiworkforce/provider-runtime';

import { OPENAI_MODEL_CATALOG } from './catalog';
import { translateChatRequest } from './translate';
import { translateOpenAIStream } from './stream';
import { translateChatRequestToResponses } from './translate-responses';
import {
  translateOpenAIResponsesStream,
  type OpenAIResponsesStreamDiagnostics,
} from './stream-responses';
import type { OpenAIChatCompletionChunk } from './types';
import type { ResponsesCreateParams, ResponsesStreamEvent } from './responses-types';

export {
  buildOpenAIContainerGeneratedFileBundles,
  extractOpenAIContainerFileCitations,
  type BuildOpenAIContainerGeneratedFilesInput,
  type OpenAIContainerFileCitation,
  type OpenAIContainerFileMaterialization,
  type OpenAIContainerGeneratedFileBundle,
} from './generated-files';

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
   * Required for OpenAI models with server-side reasoning state. Default is
   * automatic for native OpenAI catalog-known chat/text models. Set `false`
   * to force Chat Completions for legacy callers and diagnostics.
   */
  useResponsesApi?: boolean;
  /**
   * For the Responses path: when `true`, the server stores the response so
   * subsequent requests can chain via `previous_response_id`. Default
   * `false` — stateless, matching Chat Completions semantics. Wave 3
   * (Hobby/Pro tier) can flip this on for a server-side conversation cache.
   */
  responsesStore?: boolean;
  /**
   * Content-free structural telemetry for the Responses path. This callback
   * never receives prompts, response text, tool names/arguments, URLs, or files.
   */
  onResponsesDiagnostics?: (diagnostics: OpenAIResponsesDiagnostics) => void;
}

export interface OpenAIResponsesRequestDiagnostics {
  model: string;
  inputItemTypes: Record<string, number>;
  inputContentTypes: Record<string, number>;
  toolTypes: Record<string, number>;
  toolChoice?: string;
  maxOutputTokens?: number;
  reasoningEffort?: string;
  reasoningSummary?: string;
  store?: boolean;
  serviceTier?: string;
}

export interface OpenAIResponsesDiagnostics {
  requestId?: string;
  request: OpenAIResponsesRequestDiagnostics;
  stream: OpenAIResponsesStreamDiagnostics;
}

function incrementDiagnosticCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function summarizeOpenAIResponsesRequest(
  params: ResponsesCreateParams,
): OpenAIResponsesRequestDiagnostics {
  const inputItemTypes: Record<string, number> = {};
  const inputContentTypes: Record<string, number> = {};
  if (typeof params.input === 'string') {
    incrementDiagnosticCount(inputItemTypes, 'string');
  } else {
    for (const item of params.input) {
      incrementDiagnosticCount(inputItemTypes, item.type ?? 'message');
      if ('content' in item && Array.isArray(item.content)) {
        for (const content of item.content) {
          incrementDiagnosticCount(inputContentTypes, content.type);
        }
      }
    }
  }
  const toolTypes: Record<string, number> = {};
  for (const tool of params.tools ?? []) {
    incrementDiagnosticCount(toolTypes, tool.type);
  }
  const toolChoice =
    typeof params.tool_choice === 'string'
      ? params.tool_choice
      : params.tool_choice?.type === 'function'
        ? 'function'
        : undefined;

  return {
    model: params.model,
    inputItemTypes,
    inputContentTypes,
    toolTypes,
    ...(toolChoice ? { toolChoice } : {}),
    ...(params.max_output_tokens !== undefined
      ? { maxOutputTokens: params.max_output_tokens }
      : {}),
    ...(params.reasoning?.effort ? { reasoningEffort: params.reasoning.effort } : {}),
    ...(params.reasoning?.summary ? { reasoningSummary: params.reasoning.summary } : {}),
    ...(params.store !== undefined ? { store: params.store } : {}),
    ...(params.service_tier ? { serviceTier: params.service_tier } : {}),
  };
}

function findCatalogModel(id: string): ModelInfo | undefined {
  return OPENAI_MODEL_CATALOG.find((model) => model.id === id);
}

function isNativeOpenAIResponsesRoute(
  detected: ReturnType<typeof detectOpenAICompletionsCompat>,
): boolean {
  const endpointClass = detected.capabilities.endpointClass;
  return endpointClass === 'default' || endpointClass === 'openai-public';
}

function modelMetadataSupportsResponses(req: ChatRequest): boolean {
  const model = findCatalogModel(req.model);
  if (!model) return false;

  const capabilities = model.capabilities;
  if (capabilities?.streaming === false) return false;
  if (capabilities?.imageGen || capabilities?.videoGen) return false;

  return (
    capabilities?.agentic === true ||
    capabilities?.codeExecution === true ||
    capabilities?.computerUse === true ||
    capabilities?.json === true ||
    capabilities?.research === true ||
    capabilities?.search === true ||
    capabilities?.thinking === true ||
    capabilities?.tools === true ||
    capabilities?.vision === true
  );
}

export function shouldUseOpenAIResponsesApi(
  req: ChatRequest,
  config: OpenAIAdapterConfig,
  detected: ReturnType<typeof detectOpenAICompletionsCompat>,
): boolean {
  if (!isNativeOpenAIResponsesRoute(detected)) {
    return false;
  }

  if (!modelMetadataSupportsResponses(req)) {
    return false;
  }

  return config.useResponsesApi !== false;
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

      // 1a. Branch: Responses API path (`/v1/responses`) for native OpenAI
      // text/chat models. OpenAI-compatible endpoints stay on Chat
      // Completions because many reject Responses-only fields or semantics.
      if (shouldUseOpenAIResponsesApi(req, config, detected)) {
        try {
          const responsesParams = translateChatRequestToResponses(req, {
            compat: detected.defaults,
            ...(config.responsesStore !== undefined ? { store: config.responsesStore } : {}),
            ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
          });
          const requestDiagnostics = summarizeOpenAIResponsesRequest(responsesParams);
          // SDK type churns; cast at the boundary.
          const responsePromise = sdk.responses.create(
            responsesParams as unknown as Parameters<typeof sdk.responses.create>[0],
            { signal },
          );
          const { data: sdkStream, request_id: requestId } = await responsePromise.withResponse();
          const watched = withStreamIdleWatchdog(
            translateOpenAIResponsesStream(
              sdkStream as unknown as AsyncIterable<ResponsesStreamEvent>,
              {
                onDiagnostics(stream) {
                  try {
                    config.onResponsesDiagnostics?.({
                      ...(requestId ? { requestId } : {}),
                      request: requestDiagnostics,
                      stream,
                    });
                  } catch {
                    // Diagnostics must never change provider behavior.
                  }
                },
              },
            ),
          );
          for await (const chunk of watched) {
            yield chunk;
          }
          return;
        } catch (err) {
          const classified = classifyError(err);
          const retryAfterSeconds = classified.retryAfterSeconds ?? parseRetryAfterFromError(err);
          yield {
            type: 'error',
            message: classified.message,
            ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
            retryable: classified.retryable,
            ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
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
        const watched = withStreamIdleWatchdog(
          translateOpenAIStream(sdkStream as unknown as AsyncIterable<OpenAIChatCompletionChunk>),
        );
        for await (const chunk of watched) {
          yield chunk;
        }
      } catch (err) {
        const classified = classifyError(err);
        const retryAfterSeconds = classified.retryAfterSeconds ?? parseRetryAfterFromError(err);
        yield {
          type: 'error',
          message: classified.message,
          ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
          retryable: classified.retryable,
          ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
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
export { parseRetryAfter, parseRetryAfterFromError } from './retry-after';
export type * from './types';
export type * from './responses-types';
