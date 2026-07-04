import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { secureToken } from '@/lib/secure-random';
import { CreditService } from '@/lib/services/credit-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { calculateCacheSavings, logCacheAnalytics } from '@/lib/prompt-cache-helper';
import { recordModelUsage, toOtelAttributes } from '@/lib/cost-tracker';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import type { ProcessedRequest } from './request-processor';

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
  // Auth token is passed for signature parity / future authenticated calls;
  // deduction is keyed on userId, so the token is not read in this builder.
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
    resolvedTaskType,
    classifierConfidence,
    resolvedSlot,
    indicResult,
    freeTrial,
  } = processed;

  // Cost reconciliation
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

  const costDifference = actualCostCents - estimatedCostCents;

  try {
    if (!freeTrial && costDifference !== 0) {
      const reconciliationKey = CreditService.generateIdempotencyKey(
        userId,
        'reconciliation',
        requestId,
      );
      await CreditService.deductCredits(
        userId,
        costDifference,
        costDifference > 0
          ? `Additional charge: ${provider}/${llmResponse.model}`
          : `Credit adjustment: ${provider}/${llmResponse.model}`,
        {
          provider,
          model: llmResponse.model,
          type: 'reconciliation',
          estimatedCostCents,
          actualCostCents,
          promptTokens: llmResponse.promptTokens,
          completionTokens: llmResponse.completionTokens,
          totalTokens: llmResponse.totalTokens,
          requestId,
        },
        reconciliationKey,
      );
    }
  } catch (reconciliationError) {
    logger.error(
      {
        error: reconciliationError,
        userId,
        requestId,
        provider,
        model: llmResponse.model,
        estimatedCostCents,
        actualCostCents,
        costDifference,
      },
      'Credit reconciliation failed after successful LLM response - may require manual adjustment',
    );
  }

  // Cache analytics
  let cacheMetrics = { tokensSavedByCache: 0, savedCostCents: 0, cacheWriteCostCents: 0 };
  try {
    cacheMetrics = calculateCacheSavings(
      llmResponse,
      LLMCostCalculator.getInputCostPerMtok(provider, llmResponse.model),
    );

    if (llmResponse.cacheCreationInputTokens || llmResponse.cachedInputTokens) {
      logCacheAnalytics(userId, llmResponse.model, provider, llmResponse, cacheMetrics);
    }
  } catch (analyticsError) {
    logger.warn({ error: analyticsError, userId, requestId }, 'Cache analytics logging failed');
  }

  // Fire-and-forget cost tracking + OTel attribute emit (must not block response).
  try {
    const usage = {
      inputTokens: llmResponse.promptTokens,
      outputTokens: llmResponse.completionTokens,
      reasoningOutputTokens: llmResponse.reasoningOutputTokens,
      cacheReadInputTokens: llmResponse.cachedInputTokens,
      cacheCreationInputTokens: llmResponse.cacheCreationInputTokens,
      cacheCreation1hInputTokens: llmResponse.cacheCreation1hInputTokens,
    };
    recordModelUsage(userId, llmResponse.model, usage);
    logger.info(
      {
        event: 'gen_ai_usage_recorded',
        userId,
        requestId,
        ...toOtelAttributes(provider, llmResponse.model, usage),
      },
      'GenAI usage attributes recorded',
    );
  } catch (trackingError) {
    logger.warn({ error: trackingError, userId, requestId }, 'Cost tracking failed');
  }

  // BILLING FIX (0044): reconcileUsage/increment_usage was a SECOND, buggy
  // charge path that added the raw token count to credits_used_cents (a cents
  // ledger), double-charging on top of the authoritative deduct_credits()
  // reservation/reconciliation below. Removed — deduct_credits is the single
  // source of truth for credits_used_cents.

  // WEB-13 (audit 2026-05-19): switched from Math.random to a CSPRNG token.
  // chatcmpl-* ids are not secrets but downstream observability tools dedupe
  // by them; cryptographic uniqueness is a strict superset of "random enough".
  const responseId = `chatcmpl-${Date.now()}-${secureToken(7)}`;
  const responseModel = usedFallback ? chatRequest.model : requestedModel;

  const responseHeaders: Record<string, string> = {
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (quotaWarningHeader) {
    responseHeaders['X-Quota-Warning'] = quotaWarningHeader;
  }
  if (freeTrial) {
    responseHeaders['X-AGI-Trial-Prompts-Used'] = String(freeTrial.promptCount);
    responseHeaders['X-AGI-Trial-Prompts-Limit'] = String(freeTrial.promptLimit);
  }

  return NextResponse.json(
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
        cost_cents: actualCostCents,
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
            prompts_used: freeTrial.promptCount,
            prompt_limit: freeTrial.promptLimit,
          },
        }),
        cache: {
          tokens_saved: cacheMetrics.tokensSavedByCache,
          cost_saved_cents: cacheMetrics.savedCostCents,
        },
      },
    },
    { headers: responseHeaders },
  );
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

  logger.error(
    {
      error,
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      provider,
      model,
      originalModel: requestedModel,
      userId,
      requestId,
    },
    context === 'streaming' ? 'Streaming request failed' : 'LLM request failed',
  );

  let statusCode = 500;
  let errorType = 'server_error';

  if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
    statusCode = 401;
    errorType = 'authentication_error';
  } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    statusCode = 429;
    errorType = 'rate_limit_error';
  } else if (errorMessage.includes('insufficient credits') || errorMessage.includes('402')) {
    statusCode = 402;
    errorType = 'insufficient_credits';
  } else if (errorMessage.includes('not found') || errorMessage.includes('404')) {
    statusCode = 404;
    errorType = 'not_found';
  }

  return NextResponse.json(
    { error: { message: errorMessage, type: errorType } },
    { status: statusCode },
  );
}
