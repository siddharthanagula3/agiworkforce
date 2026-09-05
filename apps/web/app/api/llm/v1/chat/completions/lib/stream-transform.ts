import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { buildServingRouteId } from './tool-loop-anthropic';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { recordModelUsage, toOtelAttributes } from '@/lib/cost-tracker';
import { buildCpstUsageFields } from '@/lib/cpst-telemetry';
import { addFallbackReasonHeader } from '@/lib/chat-fallback-reason';
import { addSecretRedactionNoticeHeader } from '@/lib/chat-secret-redaction-notice';
import { addRouteLaneHeader } from '@/lib/services/free-lane/plan';
import {
  observeFreeLaneSettlement,
  recordRouteOutcome,
  recordServedRouteAffinity,
  routeAffinityTtlMs,
} from '@/lib/services/free-lane/runtime-state-service';
import { getRoutePricing } from '@agiworkforce/model-registry';
import type { StreamChunk } from '@agiworkforce/types';
import { OpenAIWireAssembler, toolStatusPhrase } from '@agiworkforce/provider-protocol';
import type { ProcessedRequest } from './request-processor';
import { canPersistAssistantTurn, persistAssistantTurn } from './assistant-turn-persistence';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageClientDelivered,
} from '@/lib/services/managed-usage-request-service';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import { createUsageAccumulator, ingestUsageChunk } from './adapter-usage';
import { compactionUsageFields } from './context-window';
import { withSseHeartbeat } from './sse-heartbeat';
import {
  collectGeneratedFileRefs,
  persistGeneratedFiles,
  type GeneratedFileRef,
} from '@/lib/server/container-files';

const TTFT_SLO_TARGET_MS = Number(process.env['LLM_TTFT_SLO_TARGET_MS'] ?? 2500);
const TTFT_SLO_BREACH_MS = Number(process.env['LLM_TTFT_SLO_BREACH_MS'] ?? 5000);

interface StreamBillingUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
  providerReportedCostUsd?: number;
}

/**
 * Which outcome the managed ledger is settled under.
 *
 * A client abort is not a provider failure, and must not be billed like one.
 * The tokens were generated, the provider has already charged us for them, and
 * the cancel path deliberately keeps the partial answer
 * (`persistAssistantTurnSnapshot(true)`), so the user keeps what they received.
 *
 * Settling that as `failed` zeroes the charge, `finalizeManagedUsageRequest`
 * forces `actualCostCents` to 0 on failure regardless of what is passed, which
 * turned "ask for something long, press Stop at 95%" into unlimited free
 * inference on the managed path. It was unbounded rather than merely cheap: a
 * zero settle records no cost, so neither the monthly allowance nor the rolling
 * 5h/weekly caps could observe it, and it repeated indefinitely on any tier.
 *
 * Only an attempt that produced NO tokens is still refunded in full, the
 * genuine-failure case the zeroing rule exists for. A provider error before any
 * output, or an unsupported provider, refunds via `refundFailedReservation` in
 * route.ts and never reaches here carrying tokens.
 *
 * Exported for direct testing: the abort path runs inside a ReadableStream
 * `cancel()` behind an SSE heartbeat wrapper and a Response body, which a unit
 * test cannot reliably drive, so the decision itself is guarded here instead.
 */
export function resolveBilledOutcome(input: {
  outcome?: 'completed' | 'failed';
  cancelled?: boolean;
  totalTokens: number;
}): 'completed' | 'failed' {
  if (input.cancelled === true && input.totalTokens > 0) return 'completed';
  return input.outcome ?? 'completed';
}

function reportedCostCentsFromUsd(reportedCostUsd: number): number {
  const costCents = reportedCostUsd * 100;
  return costCents > 0 ? Math.max(1, Math.ceil(costCents)) : 0;
}

const REPORTED_COST_SANITY_BAND_MIN_MULTIPLE = 0.1;
const REPORTED_COST_SANITY_BAND_MAX_MULTIPLE = 10;
const CENTS_PER_USD = 100;

function isReportedCostWithinSanityBand(reportedCostUsd: number, estimateUsd: number): boolean {
  if (estimateUsd <= 0) return true;
  return (
    reportedCostUsd >= estimateUsd * REPORTED_COST_SANITY_BAND_MIN_MULTIPLE &&
    reportedCostUsd <= estimateUsd * REPORTED_COST_SANITY_BAND_MAX_MULTIPLE
  );
}

async function settleStreamBilling(input: {
  processed: ProcessedRequest;
  userId: string;
  provider: string;
  model: string;
  usage: StreamBillingUsage;
  outcome?: 'completed' | 'failed';
  cancelled?: boolean;
  latencyMs?: number;
}): Promise<void> {
  const { processed, userId, provider, model, usage } = input;
  const totalTokens = usage.inputTokens + usage.outputTokens;
  // Ahead of the free-trial early return below: a free-lane turn is normally
  // also a trial turn, and its pool allowance is spent either way.
  if (processed.freeLane) {
    observeFreeLaneSettlement({
      routeId: processed.freeLane.dispatchedRouteId,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      succeeded: (input.outcome ?? 'completed') === 'completed',
      ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    });
  }
  if (processed.freeTrial) {
    await settleFreeTrialRequest({
      reservation: processed.freeTrial,
      outcome: input.outcome ?? 'completed',
      provider,
      model,
      usage: {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
      },
    });
    return;
  }

  const billedOutcome = resolveBilledOutcome({
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    ...(input.cancelled === undefined ? {} : { cancelled: input.cancelled }),
    totalTokens,
  });

  const reportedCostUsd = usage.providerReportedCostUsd;
  const hasReportedCost =
    Number.isFinite(reportedCostUsd) && reportedCostUsd !== undefined && reportedCostUsd > 0;

  let actualCostCents: number;
  let costSource: 'provider_reported' | 'estimated';

  if (billedOutcome === 'failed') {
    actualCostCents = 0;
    costSource = 'estimated';
  } else if (totalTokens > 0) {
    const estimateCostCents = LLMCostCalculator.calculateCost(
      provider,
      model,
      {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens || undefined,
        cacheCreationInputTokens: usage.cacheCreationInputTokens || undefined,
        cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens || undefined,
      },
      undefined,
      buildServingRouteId(provider, model),
    );
    const estimateUsd = estimateCostCents / CENTS_PER_USD;
    const reportedAdmitted =
      hasReportedCost && isReportedCostWithinSanityBand(reportedCostUsd as number, estimateUsd);
    if (hasReportedCost && !reportedAdmitted) {
      logger.warn(
        { provider, model, reportedCostUsd, estimateUsd },
        'Ignored provider-reported cost outside the catalog sanity band',
      );
    }
    actualCostCents = reportedAdmitted
      ? reportedCostCentsFromUsd(reportedCostUsd as number)
      : estimateCostCents;
    costSource = reportedAdmitted ? 'provider_reported' : 'estimated';
  } else {
    actualCostCents = processed.estimatedCostCents;
    costSource = 'estimated';
  }

  if (processed.managedUsage) {
    await finalizeManagedUsageRequest({
      ...processed.managedUsage,
      outcome: billedOutcome,
      actualCostCents,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningOutputTokens,
        cacheReadTokens: usage.cacheReadInputTokens,
        cacheWriteTokens: usage.cacheCreationInputTokens,
        cacheWrite1hTokens: usage.cacheCreation1hInputTokens,
        ...(totalTokens > 0 && billedOutcome !== 'failed' ? { costSource } : {}),
        ...compactionUsageFields(processed.contextTrim),
        ...buildCpstUsageFields(processed, {
          billingOutcome: billedOutcome,
          ...(input.cancelled === true ? { cancelled: true } : {}),
        }),
      },
    });
    if (billedOutcome !== 'failed') {
      await markManagedUsageClientDelivered(processed.managedUsage).catch((error) => {
        logger.warn(
          { error, userId, requestId: processed.requestId },
          'Managed usage delivery marker failed',
        );
      });
    }
    return;
  }

  throw new ManagedUsageRequestError(
    'Managed usage reservation is missing.',
    503,
    'billing_protocol_error',
  );
}

function recordDirectRouteSuccess(input: {
  processed: ProcessedRequest;
  provider: string;
  model: string;
  ttftMs: number | null;
  durationMs: number;
  outputTokens: number;
  upstreamProvider: string | undefined;
}): void {
  try {
    const routeId = buildServingRouteId(input.provider, input.model);
    void recordRouteOutcome(
      routeId,
      {
        class: 'success',
        ...(input.ttftMs !== null ? { ttftMs: input.ttftMs } : {}),
        durationMs: input.durationMs,
        outputTokens: input.outputTokens,
      },
      Date.now(),
    );
    if (!input.processed.conversationId) return;
    const routePricing = getRoutePricing(routeId);
    void recordServedRouteAffinity({
      conversationId: input.processed.conversationId,
      routeId,
      ttlMs: routeAffinityTtlMs(routePricing?.cacheClass),
      ...(input.upstreamProvider ? { upstreamProvider: input.upstreamProvider } : {}),
      ...(routePricing?.modelKey ? { modelKey: routePricing.modelKey } : {}),
      taskType: input.processed.resolvedTaskType,
    });
  } catch (error) {
    logger.warn({ error }, '[stream-transform] route outcome / affinity was not recorded');
  }
}

export async function buildStreamResponse(
  request: NextRequest,
  stream: ReadableStream,
  processed: ProcessedRequest,
  userId: string,
  _token: string,
): Promise<NextResponse> {
  const {
    requestId,
    chatRequest,
    requestedModel,
    provider,
    estimatedCostCents,
    quotaWarningHeader,
    usedFallback,
  } = processed;

  const modelUsed = chatRequest.model;
  const providerUsed = provider;
  const responseModelName = usedFallback ? chatRequest.model : requestedModel;

  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningOutputTokens: number | undefined;
  let cacheReadInputTokens: number | undefined;
  let cacheCreationInputTokens: number | undefined;
  let cacheCreation1hInputTokens: number | undefined;
  let buffer = '';
  let hasTerminalSentinel = false;
  const encoder = new TextEncoder();
  const streamStartedAt = Date.now();
  let firstTokenTimestampMs: number | null = null;

  const activeBlockTypes = new Map<number, string>();

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      buffer += text;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      const processedLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            hasTerminalSentinel = true;
            continue;
          }

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = Math.max(inputTokens, event.message.usage.input_tokens || 0);
              if (event.message.usage.cache_read_input_tokens != null) {
                cacheReadInputTokens = event.message.usage.cache_read_input_tokens;
              }
              if (event.message.usage.cache_creation_input_tokens != null) {
                cacheCreationInputTokens = event.message.usage.cache_creation_input_tokens;
              }
              if (event.message.usage.cache_creation?.ephemeral_1h_input_tokens != null) {
                cacheCreation1hInputTokens =
                  event.message.usage.cache_creation.ephemeral_1h_input_tokens;
              }
            }

            let transformedEvent = event;
            if (providerUsed === 'anthropic') {
              if (event.type === 'content_block_delta' && event.delta?.text) {
                transformedEvent = {
                  choices: [
                    {
                      delta: { content: event.delta.text },
                      index: event.index || 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'input_json_delta'
              ) {
                const blockType = activeBlockTypes.get(event.index ?? -1);
                if (blockType === 'server_tool_use') {
                  continue;
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: event.index || 0,
                            function: { arguments: event.delta.partial_json || '' },
                          },
                        ],
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'tool_use'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'tool_use');
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: event.index || 0,
                            id: event.content_block.id,
                            type: 'function',
                            function: { name: event.content_block.name, arguments: '' },
                          },
                        ],
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'server_tool_use'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'server_tool_use');
                }
                const toolName: string = event.content_block.name || 'web_search';
                const toolStatus =
                  toolName === 'code_execution'
                    ? 'executing'
                    : toolName === 'web_search'
                      ? 'searching'
                      : toolName === 'web_fetch'
                        ? 'fetching'
                        : 'running';
                const statusPhrase = toolStatusPhrase(toolName);
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        x_tool_status: {
                          type: 'server_tool_use',
                          name: toolName,
                          status: toolStatus,
                          tool_use_id: event.content_block.id,
                          ...(statusPhrase ? { status_phrase: statusPhrase } : {}),
                        },
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'code_execution_tool_result'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'code_execution_tool_result');
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: { x_code_result: event.content_block },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'web_search_tool_result'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'web_search_tool_result');
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: { x_search_results: event.content_block },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'web_fetch_tool_result'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'web_fetch_tool_result');
                }
                const fetchResult = event.content_block.content as
                  | { type?: string; url?: unknown; error_code?: unknown }
                  | undefined;
                const isFetchError = fetchResult?.type === 'web_fetch_tool_result_error';
                const fetchContent = isFetchError
                  ? `Web fetch failed: ${
                      typeof fetchResult?.error_code === 'string'
                        ? fetchResult.error_code
                        : 'unknown_error'
                    }`
                  : `Fetched ${typeof fetchResult?.url === 'string' ? fetchResult.url : 'page'}`;
                transformedEvent = {
                  choices: [
                    {
                      delta: {
                        x_tool_result: {
                          tool_call_id: event.content_block.tool_use_id,
                          name: 'web_fetch',
                          content: fetchContent,
                          is_error: isFetchError,
                        },
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'thinking'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'thinking');
                }
                transformedEvent = {
                  choices: [
                    {
                      delta: { content: '<thinking>' },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'thinking_delta'
              ) {
                transformedEvent = {
                  choices: [
                    {
                      delta: { content: event.delta.thinking },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
                const stopReason = event.delta.stop_reason;
                const finishReason =
                  stopReason === 'tool_use'
                    ? 'tool_calls'
                    : stopReason === 'end_turn'
                      ? 'stop'
                      : stopReason;
                transformedEvent = {
                  choices: [
                    {
                      delta: {},
                      finish_reason: finishReason,
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                };
              } else if (event.type === 'message_stop') {
                hasTerminalSentinel = true;
                continue;
              } else if (event.type === 'message_start') {
                continue;
              } else if (
                event.type === 'content_block_start' &&
                event.content_block?.type === 'text'
              ) {
                if (event.index !== undefined) {
                  activeBlockTypes.set(event.index, 'text');
                }
                continue;
              } else if (event.type === 'content_block_stop') {
                const blockType = activeBlockTypes.get(event.index || 0);
                if (blockType === 'thinking') {
                  transformedEvent = {
                    choices: [
                      {
                        delta: { content: '</thinking>' },
                        index: 0,
                      },
                    ],
                    model: responseModelName,
                  };
                } else {
                  continue;
                }
              }
            }

            if (transformedEvent.model) {
              transformedEvent.model = responseModelName;
            }

            if (event.type === 'message_delta' && event.usage) {
              outputTokens = Math.max(outputTokens, event.usage.output_tokens || 0);
            }
            if (event.usage) {
              inputTokens = Math.max(inputTokens, event.usage.prompt_tokens || 0);
              outputTokens = Math.max(outputTokens, event.usage.completion_tokens || 0);
              const streamCacheRead =
                event.usage.prompt_tokens_details?.cached_tokens ??
                event.usage.input_tokens_details?.cached_tokens ??
                event.usage.cache_read_input_tokens ??
                undefined;
              if (streamCacheRead != null) {
                cacheReadInputTokens = streamCacheRead;
              }
              const streamCacheCreation = event.usage.cache_creation_input_tokens ?? undefined;
              if (streamCacheCreation != null) {
                cacheCreationInputTokens = streamCacheCreation;
              }
              const streamReasoning =
                event.usage.completion_tokens_details?.reasoning_tokens ??
                event.usage.output_tokens_details?.reasoning_tokens ??
                undefined;
              if (streamReasoning != null) {
                reasoningOutputTokens = streamReasoning;
              }
            }
            if (event.usageMetadata) {
              inputTokens = Math.max(inputTokens, event.usageMetadata.promptTokenCount || 0);
              outputTokens = Math.max(outputTokens, event.usageMetadata.candidatesTokenCount || 0);
              if (event.usageMetadata.cachedContentTokenCount != null) {
                cacheReadInputTokens = event.usageMetadata.cachedContentTokenCount;
              }
            }

            processedLines.push(`data: ${JSON.stringify(transformedEvent)}`);

            if (firstTokenTimestampMs === null) {
              const deltaContent = transformedEvent?.choices?.[0]?.delta?.content;
              const hasTextDelta = typeof deltaContent === 'string' && deltaContent.length > 0;
              if (hasTextDelta) {
                firstTokenTimestampMs = Date.now() - streamStartedAt;
                logger.info(
                  {
                    event: 'llm_ttft_observed',
                    requestId,
                    userId,
                    provider: providerUsed,
                    model: modelUsed,
                    ttftMs: firstTokenTimestampMs,
                    sloTargetMs: TTFT_SLO_TARGET_MS,
                    sloBreachMs: TTFT_SLO_BREACH_MS,
                  },
                  'First token observed',
                );

                if (firstTokenTimestampMs > TTFT_SLO_BREACH_MS) {
                  logger.warn(
                    {
                      event: 'llm_ttft_slo_breach',
                      requestId,
                      userId,
                      provider: providerUsed,
                      model: modelUsed,
                      ttftMs: firstTokenTimestampMs,
                      sloTargetMs: TTFT_SLO_TARGET_MS,
                      sloBreachMs: TTFT_SLO_BREACH_MS,
                    },
                    'TTFT exceeded breach threshold',
                  );
                }
              }
            }
          } catch (parseError) {
            logger.debug(
              { jsonStr: jsonStr.substring(0, 100), error: parseError },
              'Stream JSON parse error - passing through unchanged',
            );
            processedLines.push(line);
          }
        } else if (line.trim()) {
          processedLines.push(line);
        }
      }

      if (processedLines.length > 0) {
        controller.enqueue(encoder.encode(processedLines.join('\n') + '\n\n'));
      }
    },
    async flush(controller) {
      if (buffer.trim() === 'data: [DONE]') {
        hasTerminalSentinel = true;
      } else if (buffer.trim()) {
        controller.enqueue(encoder.encode(buffer));
      }

      try {
        if (firstTokenTimestampMs === null) {
          logger.warn(
            {
              event: 'llm_ttft_missing',
              requestId,
              userId,
              provider: providerUsed,
              model: modelUsed,
            },
            'Stream completed without observable first token',
          );
        }

        await settleStreamBilling({
          processed,
          userId,
          provider: providerUsed,
          model: modelUsed,
          usage: {
            inputTokens,
            outputTokens,
            reasoningOutputTokens,
            cacheReadInputTokens,
            cacheCreationInputTokens,
            cacheCreation1hInputTokens,
          },
        });
      } catch (reconciliationError) {
        logger.error(
          {
            error: reconciliationError,
            userId,
            requestId,
            providerUsed,
            modelUsed,
            inputTokens,
            outputTokens,
            estimatedCostCents,
          },
          'CRITICAL: Credit reconciliation failed after streaming completed - may require manual adjustment',
        );
        if (processed.managedUsage) throw reconciliationError;
      }

      if (hasTerminalSentinel) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      }

      try {
        const usage = {
          inputTokens,
          outputTokens,
          reasoningOutputTokens,
          cacheReadInputTokens,
          cacheCreationInputTokens,
          cacheCreation1hInputTokens,
        };
        recordModelUsage(userId, modelUsed, usage, new Date());
        logger.info(
          {
            event: 'gen_ai_usage_recorded',
            userId,
            requestId,
            ...toOtelAttributes(
              providerUsed,
              modelUsed,
              usage,
              buildCpstUsageFields(processed, { billingOutcome: 'completed' }),
            ),
          },
          'GenAI usage attributes recorded (streaming)',
        );
      } catch (trackingError) {
        logger.warn({ error: trackingError, userId, requestId }, 'Stream cost tracking failed');
      }
    },
  });

  const reconciledStream = stream.pipeThrough(transformStream);

  const streamHeaders: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (modelUsed) {
    streamHeaders['X-AGI-Resolved-Model'] = modelUsed;
  }
  if (quotaWarningHeader) {
    streamHeaders['X-Quota-Warning'] = quotaWarningHeader;
  }
  addFallbackReasonHeader(streamHeaders, processed);
  addSecretRedactionNoticeHeader(streamHeaders, processed);
  return new NextResponse(withSseHeartbeat(reconciledStream), { headers: streamHeaders });
}

export async function buildAdapterStreamResponse(
  request: NextRequest,
  chunks: AsyncIterable<StreamChunk>,
  processed: ProcessedRequest,
  userId: string,
  _token: string,
  streamStartedAt: number,
  wireMode: 'legacy-web' | 'openai-passthrough' = 'legacy-web',
  onSuccessfulTurn?: () => Promise<void>,
): Promise<NextResponse> {
  const {
    requestId,
    chatRequest,
    requestedModel,
    provider,
    estimatedCostCents,
    quotaWarningHeader,
    usedFallback,
  } = processed;

  const modelUsed = chatRequest.model;
  const providerUsed = provider;
  const responseModelName = usedFallback ? chatRequest.model : requestedModel;

  const assembler = new OpenAIWireAssembler({ model: responseModelName, wireMode });
  const usage = createUsageAccumulator();
  const encoder = new TextEncoder();
  let firstTokenTimestampMs: number | null = null;
  let upstreamProvider: string | undefined;

  const generatedFileRefs = new Map<string, GeneratedFileRef>();

  const assistantTurnPersistable = canPersistAssistantTurn(processed);
  let assistantTurnPersisted = false;
  const persistAssistantTurnSnapshot = async (truncated: boolean): Promise<void> => {
    if (!assistantTurnPersistable || assistantTurnPersisted) return;
    assistantTurnPersisted = true;
    await persistAssistantTurn({
      processed,
      userId,
      snapshot: {
        content: assembler.canonicalText(),
        model: modelUsed,
        provider: providerUsed,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        truncated,
      },
    });
  };

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          ingestUsageChunk(usage, chunk);
          if (chunk.type === 'response-meta' && typeof chunk.provider === 'string') {
            upstreamProvider = chunk.provider;
          }
          try {
            collectGeneratedFileRefs(chunk, generatedFileRefs);
          } catch {
            /* scanning is best-effort; never break the stream */
          }
          const wireEvents = assembler.sseChunks(chunk);
          if (wireEvents.length === 0) continue;

          const lines = wireEvents.map((event) => `data: ${JSON.stringify(event)}`).join('\n');
          controller.enqueue(encoder.encode(lines + '\n\n'));

          if (firstTokenTimestampMs === null) {
            for (const event of wireEvents) {
              const deltaContent = (event as { choices?: Array<{ delta?: { content?: unknown } }> })
                .choices?.[0]?.delta?.content;
              if (typeof deltaContent === 'string' && deltaContent.length > 0) {
                firstTokenTimestampMs = Date.now() - streamStartedAt;
                logger.info(
                  {
                    event: 'llm_ttft_observed',
                    requestId,
                    userId,
                    provider: providerUsed,
                    model: modelUsed,
                    ttftMs: firstTokenTimestampMs,
                    sloTargetMs: TTFT_SLO_TARGET_MS,
                    sloBreachMs: TTFT_SLO_BREACH_MS,
                  },
                  'First token observed',
                );
                if (firstTokenTimestampMs > TTFT_SLO_BREACH_MS) {
                  logger.warn(
                    {
                      event: 'llm_ttft_slo_breach',
                      requestId,
                      userId,
                      provider: providerUsed,
                      model: modelUsed,
                      ttftMs: firstTokenTimestampMs,
                      sloTargetMs: TTFT_SLO_TARGET_MS,
                      sloBreachMs: TTFT_SLO_BREACH_MS,
                    },
                    'TTFT exceeded breach threshold',
                  );
                }
                break;
              }
            }
          }
        }
      } catch (streamError) {
        logger.error(
          {
            event: 'llm_stream_threw_mid_stream',
            error: streamError,
            requestId,
            userId,
            provider: providerUsed,
            model: modelUsed,
          },
          'Provider stream threw before completion; settling as failed and persisting a marker',
        );
        try {
          // A client that stops generation can surface here as a thrown abort
          // instead of cancel(); the partial answer is still persisted below, so
          // settling it as 'failed' would refund tokens the user keeps.
          await settleStreamBilling({
            processed,
            userId,
            provider: providerUsed,
            model: modelUsed,
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              reasoningOutputTokens: usage.reasoningOutputTokens,
              cacheReadInputTokens: usage.cacheReadInputTokens,
              cacheCreationInputTokens: usage.cacheCreationInputTokens,
              cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
              providerReportedCostUsd: usage.providerReportedCostUsd,
            },
            outcome: 'failed',
            ...(request.signal.aborted ? { cancelled: true } : {}),
          });
        } catch (reconciliationError) {
          logger.error(
            { error: reconciliationError, userId, requestId, providerUsed, modelUsed },
            'CRITICAL: Credit reconciliation failed after stream threw - may require manual adjustment',
          );
        }
        await persistAssistantTurnSnapshot(true);
        controller.error(streamError);
        return;
      }

      if (generatedFileRefs.size > 0) {
        try {
          const { files, failedCount } = await persistGeneratedFiles({
            userId,
            organizationId: processed.organizationId ?? null,
            refs: [...generatedFileRefs.values()],
            model: modelUsed,
          });
          if (files.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: { x_generated_files: { files: files.map((f) => f.wire) } },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                })}\n\n`,
              ),
            );
          }
          if (failedCount > 0) {
            const plural = failedCount === 1 ? 'file' : 'files';
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: {
                        content: `\n\n*Note: ${failedCount} generated ${plural} could not be retrieved from the code-execution sandbox and ${failedCount === 1 ? 'is' : 'are'} not attached.*`,
                      },
                      index: 0,
                    },
                  ],
                  model: responseModelName,
                })}\n\n`,
              ),
            );
          }
        } catch (err) {
          logger.warn(
            { err, requestId, userId, provider: providerUsed },
            'Generated-file persistence failed at end of stream',
          );
        }
      }

      if (assembler.lastError !== null) {
        logger.warn(
          {
            event: 'llm_stream_error_mid_stream',
            requestId,
            userId,
            provider: providerUsed,
            model: modelUsed,
            error: assembler.lastError,
          },
          'Provider stream ended with a mid-stream error after the response had already committed',
        );
      }

      if (firstTokenTimestampMs === null) {
        logger.warn(
          {
            event: 'llm_ttft_missing',
            requestId,
            userId,
            provider: providerUsed,
            model: modelUsed,
          },
          'Stream completed without observable first token',
        );
      }

      try {
        await settleStreamBilling({
          processed,
          userId,
          provider: providerUsed,
          model: modelUsed,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningOutputTokens: usage.reasoningOutputTokens,
            cacheReadInputTokens: usage.cacheReadInputTokens,
            cacheCreationInputTokens: usage.cacheCreationInputTokens,
            cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
            providerReportedCostUsd: usage.providerReportedCostUsd,
          },
          outcome: assembler.lastError === null ? 'completed' : 'failed',
          ...(firstTokenTimestampMs !== null ? { latencyMs: firstTokenTimestampMs } : {}),
        });
      } catch (reconciliationError) {
        logger.error(
          {
            error: reconciliationError,
            userId,
            requestId,
            providerUsed,
            modelUsed,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            estimatedCostCents,
          },
          'CRITICAL: Credit reconciliation failed after streaming completed - may require manual adjustment',
        );
        if (processed.managedUsage) throw reconciliationError;
      }

      if (assembler.lastError === null) {
        recordDirectRouteSuccess({
          processed,
          provider: providerUsed,
          model: modelUsed,
          ttftMs: firstTokenTimestampMs,
          durationMs: Date.now() - streamStartedAt,
          outputTokens: usage.outputTokens,
          upstreamProvider,
        });
        await persistAssistantTurnSnapshot(false);
        await onSuccessfulTurn?.();
      } else {
        await persistAssistantTurnSnapshot(true);
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();

      try {
        const usageForTracking = {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          reasoningOutputTokens: usage.reasoningOutputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
        };
        recordModelUsage(userId, modelUsed, usageForTracking, new Date());
        logger.info(
          {
            event: 'gen_ai_usage_recorded',
            userId,
            requestId,
            ...toOtelAttributes(
              providerUsed,
              modelUsed,
              usageForTracking,
              buildCpstUsageFields(processed, {
                billingOutcome: assembler.lastError === null ? 'completed' : 'failed',
              }),
            ),
          },
          'GenAI usage attributes recorded (streaming)',
        );
      } catch (trackingError) {
        logger.warn({ error: trackingError, userId, requestId }, 'Stream cost tracking failed');
      }
    },
    async cancel() {
      if (processed.managedUsage || processed.freeTrial) {
        await settleStreamBilling({
          processed,
          userId,
          provider: providerUsed,
          model: modelUsed,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningOutputTokens: usage.reasoningOutputTokens,
            cacheReadInputTokens: usage.cacheReadInputTokens,
            cacheCreationInputTokens: usage.cacheCreationInputTokens,
            cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
            providerReportedCostUsd: usage.providerReportedCostUsd,
          },
          outcome: 'failed',
          cancelled: true,
        });
      }
      await persistAssistantTurnSnapshot(true);
    },
  });

  const streamHeaders: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (modelUsed) {
    streamHeaders['X-AGI-Resolved-Model'] = modelUsed;
  }
  if (quotaWarningHeader) {
    streamHeaders['X-Quota-Warning'] = quotaWarningHeader;
  }
  addFallbackReasonHeader(streamHeaders, processed);
  addSecretRedactionNoticeHeader(streamHeaders, processed);
  addRouteLaneHeader(streamHeaders, processed);
  return new NextResponse(withSseHeartbeat(body), { headers: streamHeaders });
}
