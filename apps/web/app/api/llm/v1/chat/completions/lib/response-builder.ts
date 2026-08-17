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
import { compactionUsageFields } from './context-window';
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

  const responseHeaders: Record<string, string> = {
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
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

interface UpstreamErrorShape {
  status: number;
  type: string;
  code: string;
  message: string;
}

function mapClassifiedUpstreamError(
  classified: ReturnType<typeof classifyError>,
  provider: string,
): UpstreamErrorShape {
  switch (classified.category) {
    case 'aborted':
      return {
        status: 499,
        type: 'request_cancelled',
        code: 'request_cancelled',
        message: 'The request was cancelled before the model finished.',
      };

    case 'api_timeout':
      return {
        status: 504,
        type: 'timeout_error',
        code: 'provider_timeout',
        message:
          'The model took too long to respond. Try again, or pick a faster model from the model picker.',
      };

    case 'rate_limit': {
      const providerLabel = provider === 'google' ? 'Google' : provider;
      return {
        status: 429,
        type: 'rate_limit_error',
        code: 'provider_rate_limited',
        message: `${providerLabel} is temporarily at capacity. Try again shortly, or choose Auto to use another available model.`,
      };
    }

    case 'server_overload':
    case 'capacity_off_switch':
      return {
        status: 503,
        type: 'service_unavailable',
        code: 'provider_overloaded',
        message:
          'This model is overloaded right now. Try again in a moment, or choose Auto to use another available model.',
      };

    case 'context_overflow':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'context_length_exceeded',
        message:
          'This conversation is too long for the selected model. Start a new chat, remove some attachments, or choose a model with a larger context window.',
      };

    case 'max_output':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'max_output_tokens_exceeded',
        message:
          'The response hit the maximum output length for this model. Ask for a shorter answer, or split the request.',
      };

    case 'safety':
      return {
        status: 400,
        type: 'content_filter',
        code: 'content_filter',
        message:
          "The provider's safety system stopped this response. Rephrase the request, or try a different model.",
      };

    case 'media_too_large':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'attachment_too_large',
        message:
          'An attachment is too large for the selected model. Remove or shrink it, or choose a model with larger media limits.',
      };

    case 'tool_validation':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'tool_call_invalid',
        message:
          'The model produced a tool call this request could not accept. Try again, or turn off the tools you do not need for this turn.',
      };

    case 'invalid_model':
      return {
        status: 404,
        type: 'not_found',
        code: 'model_not_found',
        message: 'The selected model is not available. Choose another model, or switch to Auto.',
      };

    case 'invalid_input':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'provider_rejected_request',
        message:
          'The provider rejected this request as malformed. Try again, and remove any unusual attachments or parameters.',
      };

    case 'auth':
      return {
        status: 401,
        type: 'authentication_error',
        code: 'provider_credentials_rejected',
        message:
          'This model is temporarily unavailable because of a service configuration problem. Choose another model, or try again shortly.',
      };

    case 'connection':
      return {
        status: 502,
        type: 'upstream_error',
        code: 'provider_unreachable',
        message:
          'The model could not be reached. Try again, or choose Auto to use another available model.',
      };

    case 'pause_turn':
      return {
        status: 502,
        type: 'upstream_error',
        code: 'provider_paused_turn',
        message: 'The model paused mid-turn and could not continue. Try again.',
      };

    case 'client_error':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'provider_rejected_request',
        message: 'The provider rejected this request. Try again, or choose another model.',
      };

    case 'server_error':
    case 'unknown':
      return {
        status: 502,
        type: 'upstream_error',
        code: 'provider_error',
        message:
          'The model failed to produce a response. Try again, or choose Auto to use another available model.',
      };
  }
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
