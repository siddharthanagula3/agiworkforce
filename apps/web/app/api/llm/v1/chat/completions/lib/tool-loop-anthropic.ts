import 'server-only';

import { normalizeModelId, type StreamChunk, type ThinkingBlock } from '@agiworkforce/types';
import { OpenAIWireAssembler } from '@agiworkforce/provider-protocol';
import {
  accumulateObservedProviderUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import { normalizeProviderId } from '@/lib/services/llm-cost-calculator';
import { startProviderStream } from './adapter-factory';
import { ADAPTER_PROVIDERS } from './adapter-providers';
import type { ProcessedRequest } from './request-processor';

/**
 * Route ids are named `${servingProvider}/${modelKey}` in the model registry
 * (see `getRoutePricing`). Built from the normalized ids, not the raw
 * dispatch-layer strings, since the registry's provider keys are its own
 * canonical spelling (`open_router`, not `openrouter`).
 */
export function buildServingRouteId(provider: string, model: string): string {
  return `${normalizeProviderId(provider) ?? provider}/${normalizeModelId(model) ?? model}`;
}

export interface ToolLoopStepSink {
  thinkingBlocks: ThinkingBlock[];
  text: string;
  usage?: ObservedProviderUsage;
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
  const chunks = await startProviderStream(
    adapter,
    chatRequest,
    signal ?? new AbortController().signal,
    adapterProvider.mapError,
  );
  return chunksToOpenAiSse(chunks, responseModel, adapterProvider.wireMode, sink, {
    provider,
    model: stepRequest.model,
    routeId: buildServingRouteId(provider, stepRequest.model),
  });
}

export async function buildAnthropicToolLoopStream(
  processed: ProcessedRequest,
  stepRequest: ProcessedRequest['llmRequest'],
  responseModel: string,
): Promise<ReadableStream> {
  return buildToolLoopStream('anthropic', processed, stepRequest, responseModel);
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
 *
 * Exported (not module-private) so another surface can normalize its own
 * per-provider stream onto the same v1 wire shape without duplicating this
 * assembler-wrapping logic. The original such caller, /api/agents/execute,
 * has since been retired.
 */
export function chunksToOpenAiSse(
  chunks: AsyncIterable<StreamChunk>,
  model: string,
  wireMode: 'legacy-web' | 'openai-passthrough',
  sink?: ToolLoopStepSink,
  pricing?: { provider: string; model: string; routeId?: string | null },
): ReadableStream<Uint8Array> {
  const assembler = new OpenAIWireAssembler({ model, wireMode });
  const encoder = new TextEncoder();
  let sawUsage = false;
  let usageCommitted = false;
  let upstreamProvider: string | undefined;
  let providerReportedCostUsd: number | undefined;
  const streamUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens: 0,
  };

  const commitUsage = () => {
    if (usageCommitted || !sawUsage || !sink?.usage) return;
    usageCommitted = true;
    accumulateObservedProviderUsage(
      sink.usage,
      {
        ...streamUsage,
        ...(upstreamProvider ? { upstreamProvider } : {}),
        ...(providerReportedCostUsd !== undefined ? { providerReportedCostUsd } : {}),
      },
      pricing,
    );
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          if (chunk.type === 'response-meta' && typeof chunk.provider === 'string') {
            upstreamProvider = chunk.provider;
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
            const reportedCost = chunk.providerReportedCostUsd ?? chunk.costUsd;
            if (reportedCost !== undefined) {
              providerReportedCostUsd = reportedCost;
            }
          }
          const wireEvents = assembler.sseChunks(chunk);
          if (wireEvents.length === 0) continue;
          const lines = wireEvents.map((event) => `data: ${JSON.stringify(event)}`).join('\n');
          controller.enqueue(encoder.encode(lines + '\n\n'));
        }
        if (sink) {
          sink.thinkingBlocks = assembler.canonicalThinkingBlocks();
          sink.text = assembler.canonicalText();
        }
        commitUsage();
        controller.close();
      } catch (err) {
        commitUsage();
        controller.error(err);
      }
    },
  });
}
