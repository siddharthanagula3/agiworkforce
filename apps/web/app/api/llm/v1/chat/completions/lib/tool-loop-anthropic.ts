import 'server-only';

import { estimateTextTokens } from '@agiworkforce/agent-core';
import {
  getModelMetadataById,
  getProviderReasoningTokenBillingClass,
  normalizeModelId,
  type ChatRequest,
  type StreamChunk,
  type StreamChunkErrorClassification,
  type ReasoningReplayBlock,
  type UpstreamFrameShape,
} from '@agiworkforce/types';
import {
  OpenAIWireAssembler,
  planAnthropicCacheBreakpoints,
  resolveAnthropicPayloadPolicy,
  type AnthropicEphemeralCacheControl,
} from '@agiworkforce/provider-protocol';
import { logger } from '@/lib/logger';
import {
  accumulateObservedProviderUsage,
  type ObservedProviderUsage,
  type ProviderUsagePricingContext,
} from '@/lib/services/managed-usage-accounting-service';
import { normalizeProviderId } from '@/lib/services/llm-cost-calculator';
import { offersDynamicFilteringWebTool } from '@/lib/web-search/native-search-pricing';
import { startProviderStream } from './adapter-factory';
import { ADAPTER_PROVIDERS } from './adapter-providers';
import { computeAnthropicCacheConfig } from './canonical-request';
import type { ProcessedRequest } from './request-processor';
import { sseDataFrames } from './sse-frames';

export function buildServingRouteId(provider: string, model: string): string {
  return `${normalizeProviderId(provider) ?? provider}/${normalizeModelId(model) ?? model}`;
}

const OPENROUTER_DISPATCH_PROVIDER_ID = 'openrouter';
const OPENROUTER_METADATA_ROUTING_KEY = 'openRouterProviderRouting';

function applyWarmRouteProviderPinning(
  chatRequest: ChatRequest,
  provider: string,
  routeId: string,
  affinity: ProcessedRequest['routeAffinity'],
): void {
  if (provider !== OPENROUTER_DISPATCH_PROVIDER_ID) return;
  if (!affinity || !affinity.upstreamProvider || affinity.routeId !== routeId) return;
  const existing = chatRequest.metadata?.[OPENROUTER_METADATA_ROUTING_KEY];
  chatRequest.metadata = {
    ...chatRequest.metadata,
    [OPENROUTER_METADATA_ROUTING_KEY]: {
      ...(existing && typeof existing === 'object' ? existing : {}),
      order: [affinity.upstreamProvider],
      allowFallbacks: true,
    },
  };
}

export interface ToolLoopStepSink {
  thinkingBlocks: ReasoningReplayBlock[];
  text: string;
  providerErrorClassification?: StreamChunkErrorClassification;
  usage?: ObservedProviderUsage;
  providerTrace?: ProviderStreamShape;
}

export interface ProviderStreamShape {
  chunks: number;
  textChunks: number;
  textChars: number;
  thinkingChunks: number;
  thinkingChars: number;
  toolStarts: number;
  stopChunks: number;
  wireEvents: number;
  upstreamModel?: string;
  upstreamProvider?: string;
  upstreamFrameShape?: UpstreamFrameShape;
}

export type PromptCacheBreakpointTtl = '1h' | '5m' | 'none';

export interface PromptCacheBreakpointTtls {
  system: PromptCacheBreakpointTtl;
  conversation: PromptCacheBreakpointTtl;
}

function breakpointTtl(
  cacheControl: AnthropicEphemeralCacheControl | undefined,
): PromptCacheBreakpointTtl {
  if (!cacheControl) return 'none';
  return cacheControl.ttl ?? '5m';
}

/** The breakpoints the Anthropic payload policy places on this request. */
export function anthropicPromptCacheTtls(
  processed: ProcessedRequest,
  chatRequest: ChatRequest,
): PromptCacheBreakpointTtls {
  const plan = planAnthropicCacheBreakpoints(
    resolveAnthropicPayloadPolicy({
      api: 'anthropic-messages',
      provider: 'anthropic',
      ...computeAnthropicCacheConfig(processed),
    }),
    {
      hasTools: (chatRequest.tools?.length ?? 0) + (chatRequest.rawVendorTools?.length ?? 0) > 0,
      hasAssistantTurn: chatRequest.messages.some((message) => message.role === 'assistant'),
    },
  );
  return { system: breakpointTtl(plan.system), conversation: breakpointTtl(plan.conversation) };
}

/**
 * Anthropic bills thinking inside output tokens and reports no separate count,
 * so a count estimated from the streamed reasoning is recorded for visibility.
 * Only where reasoning is not priced on top of output, or it would be billed twice.
 */
function estimatedReasoningTokens(
  thinkingText: string,
  outputTokens: number,
  pricing: ProviderUsagePricingContext | undefined,
): number {
  if (!thinkingText || !pricing) return 0;
  const billedProviders = [pricing.provider, getModelMetadataById(pricing.model)?.provider];
  if (
    billedProviders.some(
      (provider) =>
        provider !== undefined &&
        getProviderReasoningTokenBillingClass(provider) === 'additional_to_output',
    )
  ) {
    return 0;
  }
  const estimate = estimateTextTokens(thinkingText);
  return outputTokens > 0 ? Math.min(estimate, outputTokens) : estimate;
}

function traceRouteLabel(value: string): string | undefined {
  return /^[a-z0-9][a-z0-9._/:+-]{0,127}$/iu.test(value) ? value : undefined;
}

export async function buildToolLoopStream(
  provider: string,
  processed: ProcessedRequest,
  stepRequest: ProcessedRequest['llmRequest'],
  responseModel: string,
  sink?: ToolLoopStepSink,
  signal?: AbortSignal,
): Promise<ReadableStream> {
  const adapterProvider = ADAPTER_PROVIDERS[provider];
  if (!adapterProvider) {
    throw new Error(`Provider "${provider}" is not supported.`);
  }
  const stepProcessed: ProcessedRequest = { ...processed, llmRequest: stepRequest };
  const adapter = adapterProvider.buildAdapter(stepProcessed);
  const chatRequest = adapterProvider.buildChatRequest(stepProcessed);
  const routeId = buildServingRouteId(provider, stepRequest.model);
  applyWarmRouteProviderPinning(chatRequest, provider, routeId, processed.routeAffinity);
  const promptCacheTtls =
    adapter.id === 'anthropic' ? anthropicPromptCacheTtls(stepProcessed, chatRequest) : undefined;
  const chunks = await startProviderStream(
    adapter,
    chatRequest,
    signal ?? new AbortController().signal,
    adapterProvider.mapError,
  );
  return chunksToOpenAiSse(chunks, responseModel, adapterProvider.wireMode, sink, {
    provider,
    model: stepRequest.model,
    routeId,
    dynamicFilteringWebTool: offersDynamicFilteringWebTool(stepRequest.tools),
    ...(promptCacheTtls ? { promptCacheTtls } : {}),
  });
}

/**
 * Wrap a provider adapter's `AsyncIterable<StreamChunk>` as an OpenAI-shaped
 * SSE byte stream via a FRESH `OpenAIWireAssembler` per call. Fresh is
 * required, not just convenient: the assembler is stateful (tool-call
 * indices, thinking-block state) and tool-loop.ts calls the provider once
 * per agentic step -- reusing one assembler across steps would corrupt that
 * state (e.g. a step-2 tool call would see step-1's tool-index counter).
 *
 * `wireMode` matches the provider's `ADAPTER_PROVIDERS` entry -- Anthropic/
 * Google use `'legacy-web'`, OpenAI + the 9 compat providers use
 * `'openai-passthrough'` (see adapter-providers.ts's docstring).
 */
export function chunksToOpenAiSse(
  chunks: AsyncIterable<StreamChunk>,
  model: string,
  wireMode: 'legacy-web' | 'openai-passthrough',
  sink?: ToolLoopStepSink,
  pricing?: ProviderUsagePricingContext & {
    dynamicFilteringWebTool?: boolean;
    promptCacheTtls?: PromptCacheBreakpointTtls;
  },
): ReadableStream<Uint8Array> {
  const assembler = new OpenAIWireAssembler({ model, wireMode });
  const encoder = new TextEncoder();
  let sawUsage = false;
  let usageCommitted = false;
  let upstreamProvider: string | undefined;
  let providerReportedCostUsd: number | undefined;
  let servedSpeed: 'standard' | 'fast' | undefined;
  const providerTrace: ProviderStreamShape = {
    chunks: 0,
    textChunks: 0,
    textChars: 0,
    thinkingChunks: 0,
    thinkingChars: 0,
    toolStarts: 0,
    stopChunks: 0,
    wireEvents: 0,
  };
  const streamUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens: 0,
    webSearchRequests: 0,
    webFetchRequests: 0,
    codeExecutionRequests: 0,
  };
  const codeExecutionContainerIds = new Set<string>();
  const thinkingDeltas: string[] = [];
  let startedAt = Date.now();

  const commitUsage = () => {
    if (usageCommitted || !sawUsage) return;
    usageCommitted = true;
    const reasoningTokensEstimated =
      streamUsage.reasoningTokens === 0
        ? estimatedReasoningTokens(thinkingDeltas.join(''), streamUsage.outputTokens, pricing)
        : 0;
    if (reasoningTokensEstimated > 0) streamUsage.reasoningTokens = reasoningTokensEstimated;
    logger.info(
      {
        provider: pricing?.provider,
        model: pricing?.model ?? model,
        routeId: pricing?.routeId,
        inputTokens: streamUsage.inputTokens,
        outputTokens: streamUsage.outputTokens,
        cacheReadTokens: streamUsage.cacheReadTokens,
        cacheWrite5mTokens: Math.max(
          0,
          streamUsage.cacheWriteTokens - streamUsage.cacheWrite1hTokens,
        ),
        cacheWrite1hTokens: streamUsage.cacheWrite1hTokens,
        reasoningTokens: streamUsage.reasoningTokens,
        reasoningTokensEstimated: reasoningTokensEstimated > 0,
        systemBreakpointTtl: pricing?.promptCacheTtls?.system,
        conversationBreakpointTtl: pricing?.promptCacheTtls?.conversation,
      },
      'Provider call prompt cache usage',
    );
    if (!sink?.usage) return;
    accumulateObservedProviderUsage(
      sink.usage,
      {
        ...streamUsage,
        tokenSource: 'provider_reported',
        ...(upstreamProvider ? { upstreamProvider } : {}),
        ...(providerReportedCostUsd !== undefined ? { providerReportedCostUsd } : {}),
        ...(servedSpeed ? { speed: servedSpeed } : {}),
        codeExecutionContainerIds: [...codeExecutionContainerIds],
        elapsedMs: Date.now() - startedAt,
        dynamicFilteringWebTool: pricing?.dynamicFilteringWebTool === true,
      },
      pricing,
    );
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      startedAt = Date.now();
      try {
        for await (const chunk of chunks) {
          providerTrace.chunks += 1;
          if (chunk.type === 'text-delta') {
            providerTrace.textChunks += 1;
            providerTrace.textChars += chunk.delta.length;
          } else if (chunk.type === 'thinking-delta') {
            providerTrace.thinkingChunks += 1;
            providerTrace.thinkingChars += chunk.delta.length;
            thinkingDeltas.push(chunk.delta);
          } else if (chunk.type === 'tool-use-start') {
            providerTrace.toolStarts += 1;
          } else if (chunk.type === 'stop') {
            providerTrace.stopChunks += 1;
          } else if (chunk.type === 'error' && chunk.classification && sink) {
            sink.providerErrorClassification = chunk.classification;
          }
          if (chunk.type === 'response-meta' && typeof chunk.model === 'string') {
            providerTrace.upstreamModel = traceRouteLabel(chunk.model);
          }
          if (chunk.type === 'response-meta' && typeof chunk.provider === 'string') {
            upstreamProvider = chunk.provider;
            providerTrace.upstreamProvider = traceRouteLabel(chunk.provider);
          }
          if (chunk.type === 'response-meta' && chunk.upstreamFrameShape) {
            providerTrace.upstreamFrameShape = { ...chunk.upstreamFrameShape };
          }
          if (chunk.type === 'usage') {
            sawUsage = true;
            streamUsage.inputTokens = Math.max(streamUsage.inputTokens, chunk.inputTokens ?? 0);
            streamUsage.outputTokens = Math.max(streamUsage.outputTokens, chunk.outputTokens ?? 0);
            streamUsage.cacheReadTokens = Math.max(
              streamUsage.cacheReadTokens,
              chunk.cacheReadTokens ?? 0,
            );
            streamUsage.cacheWriteTokens = Math.max(
              streamUsage.cacheWriteTokens,
              chunk.cacheWriteTokens ?? 0,
            );
            streamUsage.cacheWrite1hTokens = Math.max(
              streamUsage.cacheWrite1hTokens,
              chunk.cacheWrite1hTokens ?? 0,
            );
            streamUsage.reasoningTokens = Math.max(
              streamUsage.reasoningTokens,
              chunk.reasoningTokens ?? 0,
            );
            streamUsage.webSearchRequests = Math.max(
              streamUsage.webSearchRequests,
              chunk.webSearchRequests ?? 0,
            );
            streamUsage.webFetchRequests = Math.max(
              streamUsage.webFetchRequests,
              chunk.webFetchRequests ?? 0,
            );
            streamUsage.codeExecutionRequests = Math.max(
              streamUsage.codeExecutionRequests,
              chunk.codeExecutionRequests ?? 0,
            );
            for (const containerId of chunk.codeExecutionContainerIds ?? []) {
              codeExecutionContainerIds.add(containerId);
            }
            const reportedCost = chunk.providerReportedCostUsd ?? chunk.costUsd;
            if (reportedCost !== undefined) {
              providerReportedCostUsd = reportedCost;
            }
            if (chunk.speed !== undefined) servedSpeed = chunk.speed;
          }
          const wireEvents = assembler.sseChunks(chunk);
          if (sink && chunk.type === 'text-delta') sink.text = assembler.canonicalText();
          providerTrace.wireEvents += wireEvents.length;
          if (wireEvents.length === 0) continue;
          controller.enqueue(encoder.encode(sseDataFrames(wireEvents)));
        }
        if (sink) {
          sink.thinkingBlocks = assembler.canonicalThinkingBlocks();
          sink.text = assembler.canonicalText();
          sink.providerTrace = providerTrace;
        }
        commitUsage();
        controller.close();
      } catch (err) {
        if (sink) {
          sink.text = assembler.canonicalText();
          sink.providerTrace = providerTrace;
        }
        commitUsage();
        controller.error(err);
      }
    },
  });
}
