import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { calculateCacheSavings, logCacheAnalytics } from '@/lib/prompt-cache-helper';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { reconcileUsage } from '@/lib/assert-quota';
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
    cacheCreationInputTokens?: number;
    cachedInputTokens?: number;
    citations?: unknown[];
    search_results?: unknown[];
  },
  processed: ProcessedRequest,
  userClient: SupabaseClient,
  userId: string,
  token: string,
): Promise<NextResponse> {
  const {
    requestId,
    chatRequest,
    requestedModel,
    provider,
    estimatedCostCents,
    quotaWarningHeader,
    quotaFeature,
    isFlagshipRequest,
    usedFallback,
    resolvedTaskType,
    classifierConfidence,
    resolvedSlot,
    indicResult,
  } = processed;

  // Cost reconciliation
  const actualCostCents = LLMCostCalculator.calculateCost(provider, llmResponse.model, {
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
  });

  const costDifference = actualCostCents - estimatedCostCents;

  try {
    if (costDifference !== 0) {
      const reconciliationKey = CreditService.generateIdempotencyKey(
        userId,
        'reconciliation',
        requestId,
      );
      await CreditService.deductCredits(
        userClient,
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

  // Tier-quota counter update (fire-and-forget)
  if (llmResponse.totalTokens > 0) {
    void reconcileUsage({
      userId,
      token,
      actualTokens: llmResponse.totalTokens,
      feature: quotaFeature,
      isFlagship: isFlagshipRequest,
    }).catch((err) => {
      logger.warn(
        { userId, requestId, error: err instanceof Error ? err.message : err },
        '[reconcileUsage] non-stream counter update failed',
      );
    });
  }

  const responseId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const responseModel = usedFallback ? chatRequest.model : requestedModel;

  const responseHeaders: Record<string, string> = {
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (quotaWarningHeader) {
    responseHeaders['X-Quota-Warning'] = quotaWarningHeader;
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
