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
 * @packageDocumentation
 */

import OpenAI from 'openai';
import type {
  AuthMethod,
  ChatRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderCatalogContext,
  StreamChunk,
} from '@agiworkforce/types';
import { CHAT_MODEL_TYPES, getModelMetadataById } from '@agiworkforce/types';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';

import {
  classifyError,
  toStreamErrorClassification,
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

const OPENAI_AUTH_METHODS: readonly AuthMethod[] = [
  {
    kind: 'api-key',
    envVar: 'OPENAI_API_KEY',
    required: true,
    label: 'OpenAI API Key',
  },
];

export interface OpenAIAdapterConfig extends ProviderAdapterConfig {
  organization?: string;
  project?: string;
  skipDiscovery?: boolean;
  serviceTier?: 'auto' | 'default' | 'flex';
  useResponsesApi?: boolean;
  responsesStore?: boolean;
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
  droppedParameters?: string[];
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

const PROVIDER_POLICY_STOP_CODES: ReadonlySet<string> = new Set(['cyber_policy']);

/**
 * OpenAI refuses some requests before any model output with an API error whose
 * code names the policy. That is the provider's safety layer stopping the
 * response, the same thing a `content_filter` finish is, so it ends the turn as
 * a refusal instead of surfacing as a transport failure to retry or rotate.
 */
export function providerPolicyStopCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && PROVIDER_POLICY_STOP_CODES.has(code) ? code : undefined;
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

const RESPONSES_MODEL_TYPES: ReadonlySet<string> = new Set(CHAT_MODEL_TYPES);

function modelMetadataSupportsResponses(req: ChatRequest): boolean {
  const model = findCatalogModel(req.model);
  if (!model?.modelType || !RESPONSES_MODEL_TYPES.has(model.modelType)) return false;

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

const CHAT_COMPLETIONS_ENDPOINT = 'v1/chat/completions';

/**
 * The Responses API has no stop, seed, penalty or logit-bias field, so a request
 * that sets one is honoured only on Chat Completions.
 */
export function chatCompletionsOnlyParameters(req: ChatRequest): string[] {
  return [
    ...(req.stopSequences !== undefined && req.stopSequences.length > 0 ? ['stop'] : []),
    ...(req.seed !== undefined ? ['seed'] : []),
    ...(req.frequencyPenalty !== undefined ? ['frequency_penalty'] : []),
    ...(req.presencePenalty !== undefined ? ['presence_penalty'] : []),
    ...(req.logitBias !== undefined && Object.keys(req.logitBias).length > 0 ? ['logit_bias'] : []),
  ];
}

function modelServesChatCompletions(modelId: string): boolean {
  const endpoints = getModelMetadataById(modelId)?.endpoints;
  return endpoints === undefined || endpoints.includes(CHAT_COMPLETIONS_ENDPOINT);
}

/**
 * Hosted tools exist only on Responses, and a Responses-only model has no other
 * route, so either keeps the request there and the parameters are dropped.
 */
function requestNeedsChatCompletionsParameters(req: ChatRequest): boolean {
  if (req.rawVendorTools && req.rawVendorTools.length > 0) return false;
  if (!modelServesChatCompletions(req.model)) return false;
  return chatCompletionsOnlyParameters(req).length > 0;
}

export function shouldUseOpenAIResponsesApi(
  req: ChatRequest,
  config: OpenAIAdapterConfig,
  detected: ReturnType<typeof detectOpenAICompletionsCompat>,
): boolean {
  if (!isNativeOpenAIResponsesRoute(detected)) {
    return false;
  }

  if (requestNeedsChatCompletionsParameters(req)) {
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
      const detected = detectOpenAICompletionsCompat({
        provider: 'openai',
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        id: req.model,
      });

      if (shouldUseOpenAIResponsesApi(req, config, detected)) {
        try {
          const responsesParams = translateChatRequestToResponses(req, {
            compat: detected.defaults,
            ...(config.responsesStore !== undefined ? { store: config.responsesStore } : {}),
            ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
          });
          const droppedParameters = chatCompletionsOnlyParameters(req);
          const requestDiagnostics = {
            ...summarizeOpenAIResponsesRequest(responsesParams),
            ...(droppedParameters.length > 0 ? { droppedParameters } : {}),
          };
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
          const policyStop = providerPolicyStopCode(err);
          if (policyStop !== undefined) {
            yield { type: 'stop', reason: 'refusal', providerFinishReason: policyStop };
            return;
          }
          const classified = classifyError(err);
          const retryAfterSeconds = classified.retryAfterSeconds ?? parseRetryAfterFromError(err);
          yield {
            type: 'error',
            message: classified.message,
            ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
            retryable: classified.retryable,
            ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
            classification: toStreamErrorClassification(classified),
          };
          yield { type: 'stop', reason: 'error' };
          return;
        }
      }

      try {
        // Inside the try on purpose. Translation can reject a request the
        // route cannot carry, and above the try that throw escaped this
        // adapter's error handling entirely.
        const params = translateChatRequest(req, {
          compat: detected.defaults,
          provider: 'openai',
        });

        const payload = params as unknown as Record<string, unknown>;

        if (config.serviceTier && payload['service_tier'] === undefined) {
          payload['service_tier'] = config.serviceTier;
        }

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
        const policyStop = providerPolicyStopCode(err);
        if (policyStop !== undefined) {
          yield { type: 'stop', reason: 'refusal', providerFinishReason: policyStop };
          return;
        }
        const classified = classifyError(err);
        const retryAfterSeconds = classified.retryAfterSeconds ?? parseRetryAfterFromError(err);
        yield {
          type: 'error',
          message: classified.message,
          ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
          retryable: classified.retryable,
          ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
          classification: toStreamErrorClassification(classified),
        };
        yield { type: 'stop', reason: 'error' };
      }
    },
  };
}

export { OPENAI_MODEL_CATALOG } from './catalog';
export { createOpenAICompatAdapter } from './compat-adapter';
export type { OpenAICompatAdapterConfig, OpenAICompatAdapterSpec } from './compat-adapter';
export { translateChatRequest } from './translate';
export { translateOpenAIStream } from './stream';
export { translateChatRequestToResponses } from './translate-responses';
export { translateOpenAIResponsesStream } from './stream-responses';
export type {
  OpenAIChatToolChoice,
  OpenAIChatTool,
  OpenAIChatUserMessagePartText,
  OpenAIChatUserMessagePartImage,
  OpenAIChatUserMessagePartFile,
  OpenAIChatUserMessagePart,
  OpenAIChatUserMessageParam,
  OpenAIChatAssistantToolCall,
  OpenAIChatAssistantMessageParam,
  OpenAIChatSystemMessageParam,
  OpenAIChatToolMessageParam,
  OpenAIChatMessageParam,
  OpenAIChatCompletionCreateParams,
  OpenAIChatCompletionChunk,
} from './types';
export type {
  ResponsesInputTextContent,
  ResponsesInputImageContent,
  ResponsesInputFileContent,
  ResponsesInputContent,
  ResponsesInputMessage,
  ResponsesFunctionCallItem,
  ResponsesFunctionCallOutputItem,
  ResponsesInputItem,
  ResponsesFunctionTool,
  ResponsesNativeTool,
  ResponsesTool,
  ResponsesHostedToolChoice,
  ResponsesToolChoice,
  ResponsesReasoningConfig,
  ResponsesCreateParams,
  ResponseWebSearchSource,
  ResponseWebSearchAction,
  ResponseWebSearchCallItem,
  ResponseOutputTextContent,
  ResponseOutputRefusalContent,
  ResponseOutputMessageItem,
  ResponseOutputFunctionCallItem,
  ResponseOutputReasoningItem,
  ResponseOutputItem,
  ResponseCreatedEvent,
  ResponseInProgressEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseOutputTextAnnotationAddedEvent,
  ResponseWebSearchCallLifecycleEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseReasoningSummaryTextDeltaEvent,
  ResponseReasoningTextDeltaEvent,
  ResponseRefusalDeltaEvent,
  ResponseCompletedEvent,
  ResponseFailedEvent,
  ResponseIncompleteEvent,
  ResponseErrorEvent,
  ResponseLegacyErrorEvent,
  ResponsesStreamEvent,
} from './responses-types';
