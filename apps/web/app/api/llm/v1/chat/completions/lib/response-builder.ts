import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { classifyError } from '@agiworkforce/provider-runtime';
import { secureToken } from '@/lib/secure-random';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { calculateCacheSavings, logCacheAnalytics } from '@/lib/prompt-cache-helper';
import { recordModelUsage, toOtelAttributes } from '@/lib/cost-tracker';
import { buildCpstUsageFields } from '@/lib/cpst-telemetry';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { extractJsonObject, wantsJsonObject } from './json-object-mode';
import { mapClassifiedUpstreamError, type UpstreamErrorShape } from './upstream-error-copy';
import { compactionUsageFields } from './context-window';
import { addRouteLaneHeader } from '@/lib/services/free-lane/plan';
import { describeSecretRedactionNotice } from '@/lib/chat-secret-redaction-notice';
import {
  observeFreeLaneSettlement,
  recordRouteOutcome,
  recordServedRouteAffinity,
  routeAffinityTtlMs,
} from '@/lib/services/free-lane/runtime-state-service';
import { getRoutePricing } from '@agiworkforce/model-registry';
import { buildServingRouteId } from './tool-loop-anthropic';
import { routeOutcomeClassForError } from './tool-loop';
import { canPersistAssistantTurn, persistAssistantTurn } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageClientDelivered,
} from '@/lib/services/managed-usage-request-service';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';

export async function buildNonStreamResponse(
  request: NextRequest,
  llmResponse: {
    model: string;
    content: string;
    tool_calls?: unknown;
    finishReason?: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningOutputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheCreation1hInputTokens?: number;
    cachedInputTokens?: number;
    citations?: unknown[];
    search_results?: unknown[];
  },
  processed: ProcessedRequest,
  userId: string,
  _token: string,
  onSuccessfulTurn?: () => Promise<void>,
): Promise<NextResponse> {
  const {
    requestId,
    chatRequest,
    requestedModel,
    provider,
    quotaWarningHeader,
    usedFallback,
    resolvedTaskType,
    classifierConfidence,
    resolvedSlot,
    indicResult,
    freeTrial,
    secretRedactionCount,
  } = processed;

  const actualCostCents = freeTrial
    ? 0
    : LLMCostCalculator.calculateCost(provider, llmResponse.model, {
        promptTokens: llmResponse.promptTokens,
        completionTokens: llmResponse.completionTokens,
        totalTokens: llmResponse.totalTokens,
        cacheReadInputTokens: llmResponse.cachedInputTokens,
        cacheCreationInputTokens: llmResponse.cacheCreationInputTokens,
        cacheCreation1hInputTokens: llmResponse.cacheCreation1hInputTokens,
      });

  const cpstUsage = buildCpstUsageFields(processed, { billingOutcome: 'completed' });

  if (processed.freeLane) {
    observeFreeLaneSettlement({
      routeId: processed.freeLane.dispatchedRouteId,
      usage: {
        inputTokens: llmResponse.promptTokens,
        outputTokens: llmResponse.completionTokens,
      },
      succeeded: true,
    });
  }

  if (processed.managedUsage) {
    await finalizeManagedUsageRequest({
      ...processed.managedUsage,
      outcome: 'completed',
      actualCostCents,
      usage: {
        inputTokens: llmResponse.promptTokens,
        outputTokens: llmResponse.completionTokens,
        reasoningTokens: llmResponse.reasoningOutputTokens,
        cacheReadTokens: llmResponse.cachedInputTokens,
        cacheWriteTokens: llmResponse.cacheCreationInputTokens,
        cacheWrite1hTokens: llmResponse.cacheCreation1hInputTokens,
        ...compactionUsageFields(processed.contextTrim),
        ...cpstUsage,
      },
    });
  } else if (!freeTrial) {
    throw new ManagedUsageRequestError(
      'Managed usage reservation is missing.',
      503,
      'billing_protocol_error',
    );
  }

  const pricedAt = new Date();
  let cacheMetrics = { tokensSavedByCache: 0, savedCostCents: 0, cacheWriteCostCents: 0 };
  try {
    cacheMetrics = calculateCacheSavings(
      llmResponse,
      LLMCostCalculator.getInputCostPerMtok(
        provider,
        llmResponse.model,
        pricedAt,
        llmResponse.promptTokens,
        llmResponse.cachedInputTokens,
        llmResponse.cacheCreationInputTokens,
      ),
      LLMCostCalculator.getCacheWriteCostPerMtok(
        provider,
        llmResponse.model,
        pricedAt,
        llmResponse.promptTokens,
        llmResponse.cachedInputTokens,
        llmResponse.cacheCreationInputTokens,
      ),
      pricedAt,
      LLMCostCalculator.getCacheReadCostPerMtok(
        provider,
        llmResponse.model,
        pricedAt,
        llmResponse.promptTokens,
        llmResponse.cachedInputTokens,
        llmResponse.cacheCreationInputTokens,
      ),
    );

    if (llmResponse.cacheCreationInputTokens || llmResponse.cachedInputTokens) {
      logCacheAnalytics(userId, llmResponse.model, provider, llmResponse, cacheMetrics);
    }
  } catch (analyticsError) {
    logger.warn({ error: analyticsError, userId, requestId }, 'Cache analytics logging failed');
  }

  try {
    const usage = {
      inputTokens: llmResponse.promptTokens,
      outputTokens: llmResponse.completionTokens,
      reasoningOutputTokens: llmResponse.reasoningOutputTokens,
      cacheReadInputTokens: llmResponse.cachedInputTokens,
      cacheCreationInputTokens: llmResponse.cacheCreationInputTokens,
      cacheCreation1hInputTokens: llmResponse.cacheCreation1hInputTokens,
    };
    recordModelUsage(userId, llmResponse.model, usage, pricedAt);
    logger.info(
      {
        event: 'gen_ai_usage_recorded',
        userId,
        requestId,
        ...toOtelAttributes(provider, llmResponse.model, usage, cpstUsage),
      },
      'GenAI usage attributes recorded',
    );
  } catch (trackingError) {
    logger.warn({ error: trackingError, userId, requestId }, 'Cost tracking failed');
  }

  if (freeTrial) {
    await settleFreeTrialRequest({
      reservation: freeTrial,
      outcome: 'completed',
      provider,
      model: llmResponse.model,
      usage: {
        promptTokens: llmResponse.promptTokens,
        completionTokens: llmResponse.completionTokens,
        totalTokens: llmResponse.totalTokens,
        cacheReadInputTokens: llmResponse.cachedInputTokens,
        cacheCreationInputTokens: llmResponse.cacheCreationInputTokens,
        cacheCreation1hInputTokens: llmResponse.cacheCreation1hInputTokens,
      },
    });
  }

  try {
    const routeId = buildServingRouteId(provider, llmResponse.model);
    void recordRouteOutcome(
      routeId,
      { class: 'success', outputTokens: llmResponse.completionTokens },
      Date.now(),
    );
    if (processed.conversationId) {
      const routePricing = getRoutePricing(routeId);
      void recordServedRouteAffinity({
        conversationId: processed.conversationId,
        routeId,
        ttlMs: routeAffinityTtlMs(routePricing?.cacheClass),
        ...(routePricing?.modelKey ? { modelKey: routePricing.modelKey } : {}),
        taskType: processed.resolvedTaskType,
      });
    }
  } catch (error) {
    logger.warn(
      { error, userId, requestId },
      '[response-builder] route outcome / affinity was not recorded',
    );
  }

  await onSuccessfulTurn?.();

  const responseId = `chatcmpl-${Date.now()}-${secureToken(7)}`;
  const responseModel = usedFallback ? chatRequest.model : requestedModel;

  if (wantsJsonObject(chatRequest.response_format)) {
    const extraction = extractJsonObject(llmResponse.content ?? '');
    if (!extraction.ok) {
      logger.warn(
        { requestId, model: responseModel, reason: extraction.reason },
        'json_object mode: model output was not a JSON object',
      );
      return NextResponse.json(
        {
          error: {
            message: `${extraction.reason} Retry, or use \`tools\` with \`tool_choice\` for a schema-shaped payload.`,
            type: 'invalid_response_error',
            code: 'json_object_not_satisfied',
          },
        },
        {
          status: 502,
          headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
        },
      );
    }
    llmResponse.content = extraction.content ?? llmResponse.content;
  }

  if (canPersistAssistantTurn(processed)) {
    await persistAssistantTurn({
      processed,
      userId,
      snapshot: {
        content: llmResponse.content ?? '',
        model: llmResponse.model,
        provider,
        inputTokens: llmResponse.promptTokens,
        outputTokens: llmResponse.completionTokens,
        truncated: false,
      },
    });
  }

  const responseHeaders: Record<string, string> = {
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  addRouteLaneHeader(responseHeaders, processed);
  if (quotaWarningHeader) {
    responseHeaders['X-Quota-Warning'] = quotaWarningHeader;
  }
  const response = NextResponse.json(
    {
      id: responseId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: responseModel,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: llmResponse.content,
            tool_calls: llmResponse.tool_calls,
          },
          finish_reason: llmResponse.finishReason || 'stop',
        },
      ],
      usage: {
        prompt_tokens: llmResponse.promptTokens,
        completion_tokens: llmResponse.completionTokens,
        total_tokens: llmResponse.totalTokens,
        cache_creation_input_tokens: llmResponse.cacheCreationInputTokens,
        cache_read_input_tokens: llmResponse.cachedInputTokens,
      },
      ...(llmResponse.citations &&
        llmResponse.citations.length > 0 && { citations: llmResponse.citations }),
      ...(llmResponse.search_results &&
        llmResponse.search_results.length > 0 && { search_results: llmResponse.search_results }),
      x_agi_workforce: {
        provider,
        routing: {
          task_type: resolvedTaskType,
          task_confidence: classifierConfidence,
          resolved_model: chatRequest.model,
          slot: resolvedSlot,
          quota_warning: quotaWarningHeader,
          ...(indicResult.isIndic && indicResult.dominantScript
            ? {
                indic_dominant_script: indicResult.dominantScript,
                indic_ratio: indicResult.indicRatio,
              }
            : {}),
        },
        ...(usedFallback && {
          fallback: {
            original_model: processed.originalModel,
            reason: processed.fallbackReason,
          },
        }),
        ...(freeTrial && {
          trial: {
            type: freeTrial.kind,
          },
        }),
        ...(secretRedactionCount && {
          secret_redaction: {
            count: secretRedactionCount,
            message: describeSecretRedactionNotice(secretRedactionCount),
          },
        }),
        cache: {
          tokens_saved: cacheMetrics.tokensSavedByCache,
        },
      },
    },
    { headers: responseHeaders },
  );

  if (processed.managedUsage) {
    await markManagedUsageClientDelivered(processed.managedUsage).catch((error) => {
      logger.warn({ error, userId, requestId }, 'Managed usage delivery marker failed');
    });
  }

  return response;
}

export function buildUpstreamErrorResponse(
  error: unknown,
  provider: string,
  model: string,
  requestedModel: string,
  userId: string,
  requestId: string,
  context: 'streaming' | 'non-streaming',
): NextResponse {
  const errorMessage = error instanceof Error ? error.message : `${context} request failed`;
  const classified = classifyError(error);

  logger.error(
    {
      error,
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      errorCategory: classified.category,
      errorCode: classified.code,
      upstreamStatus: classified.status,
      provider,
      model,
      originalModel: requestedModel,
      userId,
      requestId,
    },
    context === 'streaming' ? 'Streaming request failed' : 'LLM request failed',
  );

  try {
    const outcomeClass = routeOutcomeClassForError(error, classified);
    if (outcomeClass) {
      void recordRouteOutcome(
        buildServingRouteId(provider, model),
        { class: outcomeClass },
        Date.now(),
      );
    }
  } catch (recordError) {
    logger.warn(
      { error: recordError, userId, requestId },
      '[response-builder] route outcome was not recorded',
    );
  }

  const shape: UpstreamErrorShape =
    classified.status === 402
      ? {
          status: 402,
          type: 'insufficient_credits',
          code: 'insufficient_credits',
          message: 'This request could not be paid for. Top up credits and try again.',
        }
      : mapClassifiedUpstreamError(classified, provider);

  return NextResponse.json(
    {
      error: {
        message: shape.message,
        type: shape.type,
        code: shape.code,
        retryable: classified.retryable,
      },
    },
    { status: shape.status },
  );
}
