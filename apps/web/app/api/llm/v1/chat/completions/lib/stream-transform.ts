import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { buildServingRouteId } from './tool-loop-anthropic';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { recordModelUsage, toOtelAttributes } from '@/lib/cost-tracker';
import { buildCpstUsageFields } from '@/lib/cpst-telemetry';
import { addFallbackReasonHeader, addModelEscalationHeaders } from '@/lib/chat-fallback-reason';
import { addSecretRedactionNoticeHeader } from '@/lib/chat-secret-redaction-notice';
import { addAttachmentTruncationHeader } from '@agiworkforce/cloud-contracts';
import { addProjectSourcesHeader } from '@/lib/chat-project-sources';
import { addRouteLaneHeader } from '@/lib/services/free-lane/plan';
import {
  observeFreeLaneSettlement,
  recordRouteOutcome,
  recordServedRouteAffinity,
  routeAffinityTtlMs,
} from '@/lib/services/free-lane/runtime-state-service';
import { getRoutePricing } from '@agiworkforce/model-registry';
import { MICROUSD_PER_USD, type StreamChunk } from '@agiworkforce/types';
import { OpenAIWireAssembler } from '@agiworkforce/provider-protocol';
import {
  classifyError,
  isErrorCategory,
  type ClassifiedError,
} from '@agiworkforce/provider-runtime';
import { mapClassifiedUpstreamError, streamErrorFrame } from './upstream-error-copy';
import { isEmptyTurnOutput, isTurnTruncated } from './turn-completeness';
import type { ProcessedRequest } from './request-processor';
import {
  canPersistAssistantTurn,
  patchAssistantTurnSourceUrls,
  persistAssistantTurn,
} from './assistant-turn-persistence';
import { AssistantTurnSourceCollector } from './assistant-turn-sources';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageClientDelivered,
  estimateMicrousdOf,
} from '@/lib/services/managed-usage-request-service';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import type { GenerationAttempt } from '@/lib/services/generation-attempt';
import {
  hostedCodeExecutionEvidence,
  priceServerToolUsage,
} from '@/lib/services/managed-usage-accounting-service';
import { offersDynamicFilteringWebTool } from '@/lib/web-search/native-search-pricing';
import { estimateTokens } from '@agiworkforce/routing';
import { createUsageAccumulator, ingestUsageChunk, type UsageAccumulator } from './adapter-usage';
import { compactionUsageFields } from './context-window';
import { SSE_RESPONSE_HEADERS, withSseHeartbeat } from './sse-heartbeat';
import { servedOnIsolatedPromotionCredential } from '@/lib/server/free-model-promotion';
import { sseDataFrames } from './sse-frames';
import { persistRoutingDecisionOutcome } from '@/lib/services/model-rollout/routing-decision-trace-service';
import {
  collectGeneratedFileRefs,
  persistGeneratedFiles,
  type GeneratedFileRef,
} from '@/lib/server/container-files';

export const TTFT_SLO_TARGET_MS = Number(process.env['LLM_TTFT_SLO_TARGET_MS'] ?? 2500);
export const TTFT_SLO_BREACH_MS = Number(process.env['LLM_TTFT_SLO_BREACH_MS'] ?? 5000);

interface StreamBillingUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
  providerReportedCostUsd?: number;
  webSearchRequests?: number;
  webFetchRequests?: number;
  codeExecutionRequests?: number;
  codeExecutionContainerIds?: string[];
  providerElapsedMs?: number;
  speed?: 'standard' | 'fast';
}

function streamBillingUsage(usage: UsageAccumulator, streamStartedAt: number): StreamBillingUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningOutputTokens: usage.reasoningOutputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    cacheCreationInputTokens: usage.cacheCreationInputTokens,
    cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
    providerReportedCostUsd: usage.providerReportedCostUsd,
    webSearchRequests: usage.webSearchRequests,
    webFetchRequests: usage.webFetchRequests,
    codeExecutionRequests: usage.codeExecutionRequests,
    codeExecutionContainerIds: usage.codeExecutionContainerIds,
    providerElapsedMs: Date.now() - streamStartedAt,
    speed: usage.speed,
  };
}

/**
 * Which outcome the managed ledger is settled under.
 *
 * A client abort is not a provider failure, and must not be billed like one.
 * The tokens were generated, the provider has already charged us for them, and
 * the cancel path deliberately keeps the partial answer
 * (`persistAssistantTurnSnapshot(true)`), so the user keeps what they received.
 *
 * Settling that as `failed` would zero the charge, because
 * `finalizeManagedUsageRequest` forces `actualCostCents` to 0 on failure
 * regardless of what is passed, and turn "ask for something long, press Stop at
 * 95%" into unlimited free inference: a zero settle records no cost, so neither
 * the monthly allowance nor the rolling 5h/weekly caps could observe it.
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

/**
 * The usage a stopped turn is settled on.
 *
 * Providers report token counts only as their stream ends, so a reader who stops
 * mid-answer leaves the observed counts at zero after the provider has billed the
 * prompt and the output so far, and `resolveBilledOutcome` would refund the turn
 * the reader kept. The prompt estimate the reservation was sized on and the text
 * that reached the reader stand in for counts the provider had not reported yet.
 * A turn that delivered nothing keeps its observed counts, so a stop before any
 * output still refunds in full.
 */
export function stoppedTurnUsage(input: {
  usage: UsageAccumulator;
  deliveredNothing: boolean;
  deliveredText: string;
  estimatedPromptTokens: number;
  model: string;
}): UsageAccumulator {
  if (input.deliveredNothing) return input.usage;
  return {
    ...input.usage,
    inputTokens:
      input.usage.inputTokens > 0 ? input.usage.inputTokens : input.estimatedPromptTokens,
    outputTokens: Math.max(
      input.usage.outputTokens,
      estimateTokens(input.deliveredText, input.model),
    ),
  };
}

/**
 * A provider-reported figure enters the ledger in its own unit, so a reported
 * $0.0009 is not rounded up to a cent and a hundred such turns cost what one
 * call of the same total would.
 */
function reportedCostMicrousdFromUsd(reportedCostUsd: number): number {
  const costMicrousd = reportedCostUsd * MICROUSD_PER_USD;
  return costMicrousd > 0 ? Math.max(1, Math.ceil(costMicrousd)) : 0;
}

const REPORTED_COST_SANITY_BAND_MIN_MULTIPLE = 0.1;
const REPORTED_COST_SANITY_BAND_MAX_MULTIPLE = 10;

function isReportedCostWithinSanityBand(reportedCostUsd: number, estimateUsd: number): boolean {
  if (estimateUsd <= 0) return true;
  return (
    reportedCostUsd >= estimateUsd * REPORTED_COST_SANITY_BAND_MIN_MULTIPLE &&
    reportedCostUsd <= estimateUsd * REPORTED_COST_SANITY_BAND_MAX_MULTIPLE
  );
}

export async function settleStreamBilling(input: {
  processed: ProcessedRequest;
  userId: string;
  provider: string;
  model: string;
  usage: StreamBillingUsage;
  outcome?: 'completed' | 'failed';
  cancelled?: boolean;
  errorClass?: string | undefined;
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
  const billedOutcome = resolveBilledOutcome({
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    ...(input.cancelled === undefined ? {} : { cancelled: input.cancelled }),
    totalTokens,
  });
  const attempt: GenerationAttempt =
    input.cancelled === true
      ? { outcome: 'cancelled' }
      : { outcome: input.outcome ?? 'completed', errorClass: input.errorClass };
  const hostedCodeExecution = hostedCodeExecutionEvidence(provider, {
    codeExecutionRequests: usage.codeExecutionRequests,
    codeExecutionContainerIds: usage.codeExecutionContainerIds,
    elapsedMs: usage.providerElapsedMs,
  });
  const serverTools = priceServerToolUsage({
    provider,
    webSearchRequests: usage.webSearchRequests,
    webFetchRequests: usage.webFetchRequests,
    hostedCodeExecution,
    dynamicFilteringWebTool: offersDynamicFilteringWebTool(processed.llmRequest.tools),
  });

  if (processed.freeTrial) {
    const freeTokenUsage = {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens,
      reasoningTokens: usage.reasoningOutputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
      speed: usage.speed,
    };
    await settleFreeTrialRequest({
      reservation: processed.freeTrial,
      outcome: attempt.outcome,
      attempt,
      provider,
      model,
      usage: freeTokenUsage,
      cost:
        billedOutcome === 'failed'
          ? {
              tokenMicrousd: 0,
              toolMicrousd: 0,
              ...(serverTools.providerMicrousd > 0
                ? { serverToolMicrousd: serverTools.providerMicrousd }
                : {}),
            }
          : {
              tokenMicrousd: LLMCostCalculator.calculateCostMicrousd(
                provider,
                model,
                freeTokenUsage,
                undefined,
                buildServingRouteId(provider, model),
              ),
              toolMicrousd: serverTools.providerMicrousd,
              ...(serverTools.providerMicrousd > 0
                ? { serverToolMicrousd: serverTools.providerMicrousd }
                : {}),
            },
    });
    return;
  }

  const reportedCostUsd = usage.providerReportedCostUsd;
  const hasReportedCost =
    Number.isFinite(reportedCostUsd) && reportedCostUsd !== undefined && reportedCostUsd > 0;

  let providerCostMicrousd: number;
  let billedCostMicrousd: number;
  let costSource: 'provider_reported' | 'estimated';

  if (billedOutcome === 'failed') {
    providerCostMicrousd = 0;
    billedCostMicrousd = 0;
    costSource = 'estimated';
  } else if (totalTokens > 0) {
    const tokenUsage = {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens,
      reasoningTokens: usage.reasoningOutputTokens || undefined,
      cacheReadInputTokens: usage.cacheReadInputTokens || undefined,
      cacheCreationInputTokens: usage.cacheCreationInputTokens || undefined,
      cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens || undefined,
      speed: usage.speed,
    };
    const estimateCostMicrousd = LLMCostCalculator.calculateCostMicrousd(
      provider,
      model,
      tokenUsage,
      undefined,
      buildServingRouteId(provider, model),
    );
    const estimateUsd = estimateCostMicrousd / MICROUSD_PER_USD;
    const reportedAdmitted =
      hasReportedCost && isReportedCostWithinSanityBand(reportedCostUsd as number, estimateUsd);
    if (hasReportedCost && !reportedAdmitted) {
      logger.warn(
        { provider, model, reportedCostUsd, estimateUsd },
        'Ignored provider-reported cost outside the catalog sanity band',
      );
    }
    const tokenProviderCostMicrousd = reportedAdmitted
      ? reportedCostMicrousdFromUsd(reportedCostUsd as number)
      : estimateCostMicrousd;
    providerCostMicrousd = tokenProviderCostMicrousd + serverTools.providerMicrousd;
    billedCostMicrousd =
      (LLMCostCalculator.calculateListCostMicrousd(model, tokenUsage) ??
        tokenProviderCostMicrousd) + serverTools.chargeMicrousd;
    costSource = reportedAdmitted ? 'provider_reported' : 'estimated';
  } else {
    providerCostMicrousd = estimateMicrousdOf(processed);
    billedCostMicrousd = providerCostMicrousd;
    costSource = 'estimated';
  }

  if (processed.managedUsage) {
    await finalizeManagedUsageRequest({
      ...processed.managedUsage,
      outcome: billedOutcome,
      attempt,
      actualCostMicrousd: billedCostMicrousd,
      providerCostMicrousd,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningOutputTokens,
        cacheReadTokens: usage.cacheReadInputTokens,
        cacheWriteTokens: usage.cacheCreationInputTokens,
        cacheWrite1hTokens: usage.cacheCreation1hInputTokens,
        ...(usage.speed === 'fast' ? { speed: 'fast' as const } : {}),
        ...(usage.webSearchRequests ? { webSearchRequests: usage.webSearchRequests } : {}),
        ...(usage.webFetchRequests ? { webFetchRequests: usage.webFetchRequests } : {}),
        ...(hostedCodeExecution ? { hostedCodeExecution } : {}),
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
    persistRoutingDecisionOutcome({
      requestId: input.processed.requestId,
      kind: 'served',
      outcome: 'succeeded',
      ttftMs: input.ttftMs,
      durationMs: input.durationMs,
    });
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

type StreamErrorChunk = Extract<StreamChunk, { type: 'error' }>;

function presentStreamError(
  chunk: StreamErrorChunk,
  processed: ProcessedRequest,
  answerStarted: boolean,
): StreamErrorChunk {
  const classification = chunk.classification;
  const classified: ClassifiedError =
    classification !== undefined && isErrorCategory(classification.category)
      ? { ...classification, category: classification.category, message: chunk.message }
      : classifyError(
          Object.assign(
            new Error(chunk.message),
            /^\d{3}$/.test(chunk.code ?? '') ? { status: Number(chunk.code) } : {},
          ),
        );
  const mapped = mapClassifiedUpstreamError(classified, processed.provider, {
    requestedModel: processed.requestedModel,
    answerStarted,
    isolatedCredential: servedOnIsolatedPromotionCredential(processed),
  });
  logger.warn(
    {
      event: 'llm_stream_error_presented',
      requestId: processed.requestId,
      provider: processed.provider,
      model: processed.chatRequest.model,
      category: classified.category,
      code: mapped.code,
      upstreamMessage: chunk.message.slice(0, 2000),
    },
    'Provider stream error presented as gateway copy',
  );
  return { ...chunk, ...streamErrorFrame(mapped, classified.retryable) };
}

export async function buildAdapterStreamResponse(
  request: NextRequest,
  chunks: AsyncIterable<StreamChunk>,
  processed: ProcessedRequest,
  userId: string,
  streamStartedAt: number,
  wireMode: 'legacy-web' | 'openai-passthrough' = 'legacy-web',
  onSuccessfulTurn?: () => Promise<void>,
): Promise<NextResponse> {
  const { requestId, chatRequest, requestedModel, provider, quotaWarningHeader, usedFallback } =
    processed;

  const modelUsed = chatRequest.model;
  const providerUsed = provider;
  const responseModelName = usedFallback ? chatRequest.model : requestedModel;

  const assembler = new OpenAIWireAssembler({ model: responseModelName, wireMode });
  const usage = createUsageAccumulator();
  const encoder = new TextEncoder();
  let firstTokenTimestampMs: number | null = null;
  let upstreamProvider: string | undefined;

  const generatedFileRefs = new Map<string, GeneratedFileRef>();
  const sourceCollector = new AssistantTurnSourceCollector();
  let toolCallsSeen = 0;
  let lastStopReason: string | null = null;
  let lastErrorCode: string | undefined;

  /**
   * A turn the reader can keep. Tool calls, artifacts and grounded sources all
   * count: the answer text is not the only thing a turn can deliver.
   */
  const turnDeliveredNothing = (): boolean =>
    isEmptyTurnOutput({
      text: assembler.canonicalText(),
      toolCalls: toolCallsSeen,
      generatedFiles: generatedFileRefs.size,
      otherVisibleOutput: Boolean(
        sourceCollector.snapshot() ||
        sourceCollector.citationSnapshot() ||
        sourceCollector.codeExecutionSnapshot() ||
        sourceCollector.generatedFilesSnapshot(),
      ),
    });

  const stoppedUsage = (): UsageAccumulator =>
    stoppedTurnUsage({
      usage,
      deliveredNothing: turnDeliveredNothing(),
      deliveredText: assembler.canonicalText(),
      estimatedPromptTokens: processed.estimatedPromptTokens,
      model: modelUsed,
    });

  const turnTruncated = (): boolean =>
    isTurnTruncated({
      reportedFailure: assembler.lastError !== null,
      finishReason: lastStopReason,
      emptyOutput: turnDeliveredNothing(),
    });

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
        ...(sourceCollector.snapshot() ? { sources: sourceCollector.snapshot() } : {}),
        ...(sourceCollector.citationSnapshot()
          ? { citations: sourceCollector.citationSnapshot() }
          : {}),
        ...(sourceCollector.codeExecutionSnapshot()
          ? { codeExecutionResult: sourceCollector.codeExecutionSnapshot() }
          : {}),
        ...(sourceCollector.generatedFilesSnapshot()
          ? { generatedFiles: sourceCollector.generatedFilesSnapshot() }
          : {}),
      },
    });
  };

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const received of chunks) {
          const chunk =
            received.type === 'error'
              ? presentStreamError(received, processed, assembler.canonicalText().trim().length > 0)
              : received;
          ingestUsageChunk(usage, chunk);
          if (chunk.type === 'response-meta' && typeof chunk.provider === 'string') {
            upstreamProvider = chunk.provider;
          }
          if (chunk.type === 'tool-use-start') toolCallsSeen += 1;
          if (chunk.type === 'stop') lastStopReason = chunk.reason;
          if (chunk.type === 'error') lastErrorCode = chunk.code;
          try {
            collectGeneratedFileRefs(chunk, generatedFileRefs);
          } catch {
            /* scanning is best-effort; never break the stream */
          }
          const wireEvents = assembler.sseChunks(chunk);
          for (const event of wireEvents) sourceCollector.ingestWireEvent(event);
          if (wireEvents.length === 0) continue;

          controller.enqueue(encoder.encode(sseDataFrames(wireEvents)));

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
            usage: streamBillingUsage(
              request.signal.aborted ? stoppedUsage() : usage,
              streamStartedAt,
            ),
            outcome: 'failed',
            errorClass: classifyError(streamError).category,
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
            conversationId: processed.conversationId,
          });
          if (files.length > 0) {
            // This frame is built here rather than by the assembler, so it is
            // the one wire event the ingest loop above never sees. The snapshot
            // is taken after this block, so collecting it here is what puts the
            // attachments on the row.
            const generatedFilesEvent = {
              choices: [
                {
                  delta: { x_generated_files: { files: files.map((f) => f.wire) } },
                  index: 0,
                },
              ],
              model: responseModelName,
            };
            sourceCollector.ingestWireEvent(generatedFilesEvent);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(generatedFilesEvent)}\n\n`));
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
          usage: streamBillingUsage(usage, streamStartedAt),
          outcome: assembler.lastError === null ? 'completed' : 'failed',
          errorClass: lastErrorCode,
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
            estimatedCostMicrousd: estimateMicrousdOf(processed),
          },
          'CRITICAL: Credit reconciliation failed after streaming completed - may require manual adjustment',
        );
        if (processed.managedUsage) throw reconciliationError;
      }

      const truncated = turnTruncated();
      if (!truncated) {
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
        if (assembler.lastError === null) {
          logger.warn(
            {
              event: 'llm_stream_ended_incomplete',
              requestId,
              userId,
              provider: providerUsed,
              model: modelUsed,
              stopReason: lastStopReason,
              emptyOutput: turnDeliveredNothing(),
            },
            'Provider stream ended without an answer the reader could keep',
          );
        }
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

      // Deliberately after close(): a grounded turn's hrefs are the routing
      // provider's redirects, and turning them into publisher URLs is a network
      // call. The reader already holds the whole answer, and the row already
      // carries the redirects, so this can only upgrade what was stored and can
      // never delay what was sent.
      if (assistantTurnPersisted) {
        await patchAssistantTurnSourceUrls({
          processed,
          userId,
          sources: sourceCollector.snapshot(),
          citations: sourceCollector.citationSnapshot(),
        });
      }
    },
    async cancel() {
      if (processed.managedUsage || processed.freeTrial) {
        await settleStreamBilling({
          processed,
          userId,
          provider: providerUsed,
          model: modelUsed,
          usage: streamBillingUsage(stoppedUsage(), streamStartedAt),
          outcome: 'failed',
          cancelled: true,
        });
      }
      await persistAssistantTurnSnapshot(true);
    },
  });

  const streamHeaders: Record<string, string> = {
    ...SSE_RESPONSE_HEADERS,
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
  addModelEscalationHeaders(streamHeaders, processed);
  addSecretRedactionNoticeHeader(streamHeaders, processed);
  addAttachmentTruncationHeader(streamHeaders, processed);
  addProjectSourcesHeader(streamHeaders, processed);
  addRouteLaneHeader(streamHeaders, processed);
  return new NextResponse(withSseHeartbeat(body), { headers: streamHeaders });
}
