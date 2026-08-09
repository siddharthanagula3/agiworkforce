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
  // Auth token is passed for signature parity / future authenticated calls;
  // deduction is keyed on userId, so the token is not read in this builder.
  _token: string,
  /** Optional server-owned work that runs only after durable success settlement. */
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

  // CPST Stage-0 telemetry, MANAGED CLOUD ONLY
  // (docs/design/execution-plan-contract-and-cpst-2026-08-05.md §4.3, phase 1:
  // additive keys in the existing `usage` jsonb, no migration). Built once here
  // because `finalize_managed_usage_request` REPLACES the usage column rather
  // than merging into it, so these keys must ride the same single call as the
  // token counters. `taskOutcome` is 'unknown' on a successful charge: billing
  // success is not task success.
  const cpstUsage = buildCpstUsageFields(processed, { billingOutcome: 'completed' });

  if (processed.managedUsage) {
    // Financial terminal state is durable before the successful HTTP response
    // is constructed. Do not swallow this failure and hand out an unmetered
    // completion; stale recovery will refund customer-favorably instead.
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

  // Cache analytics. All three rates — input, cache write, and the cache read
  // `calculateCacheSavings` resolves internally — are read for THIS request's
  // instant, so a model with dated pricing is reported at the same rates it is
  // billed at even across a UTC day boundary.
  const pricedAt = new Date();
  let cacheMetrics = { tokensSavedByCache: 0, savedCostCents: 0, cacheWriteCostCents: 0 };
  try {
    cacheMetrics = calculateCacheSavings(
      llmResponse,
      LLMCostCalculator.getInputCostPerMtok(provider, llmResponse.model, pricedAt),
      LLMCostCalculator.getCacheWriteCostPerMtok(provider, llmResponse.model, pricedAt),
      pricedAt,
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

  // BILLING FIX (0044): reconcileUsage/increment_usage was a SECOND, buggy
  // charge path that added the raw token count to credits_used_cents (a cents
  // ledger), double-charging on top of the authoritative managed reservation
  // reservation/reconciliation below. Removed — deduct_credits is the single
  // source of truth for credits_used_cents.

  // WEB-13 (audit 2026-05-19): switched from Math.random to a CSPRNG token.
  // chatcmpl-* ids are not secrets but downstream observability tools dedupe
  // by them; cryptographic uniqueness is a strict superset of "random enough".
  const responseId = `chatcmpl-${Date.now()}-${secureToken(7)}`;
  const responseModel = usedFallback ? chatRequest.model : requestedModel;

  /*
   * json_object enforcement. The directive in the system prompt is a request,
   * not a guarantee — models wrap output in code fences and add prose often
   * enough that shipping the raw completion would recreate exactly the silent
   * wrongness this mode replaced (200 OK, `json_object` asked for, prose
   * returned, caller's parser fails downstream with no explanation).
   *
   * `extractJsonObject` unwraps fences and surrounding prose but never REPAIRS
   * malformed JSON: guessing at a missing brace would hand the caller a
   * document the model did not produce. When it cannot produce an object we
   * return 502 rather than prose, because the caller asked for a contract this
   * response does not satisfy.
   *
   * Note this runs AFTER settlement above: the provider call happened and was
   * billed, so failing here does not silently refund — the error names what
   * went wrong so the caller can retry deliberately.
   */
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
    // Financial settlement already succeeded. Delivery marking is audit-only;
    // a transient audit failure must not turn a paid provider success into a
    // client-visible error.
    await markManagedUsageClientDelivered(processed.managedUsage).catch((error) => {
      logger.warn({ error, userId, requestId }, 'Managed usage delivery marker failed');
    });
  }

  return response;
}

/**
 * Client-visible failure shape for an upstream provider error.
 *
 * AUDIT-FIX SYS-16/17/18/19: this used to map only 401/402/404/429 by
 * SUBSTRING-MATCHING ENGLISH ERROR TEXT (`errorMessage.includes('rate limit')`),
 * and everything else collapsed to `500 server_error` with the RAW provider
 * message as `publicMessage` — which leaked the managed-cloud provider's
 * identity, its internal error payloads, and occasionally upstream account
 * detail straight into the browser. Meanwhile `adapter-errors.ts` had already
 * been setting a structured `error.status` for years that nothing ever read.
 *
 * It now classifies through `classifyError` (which reads that structured
 * status first and only falls back to text) and maps each category to a
 * distinct, ACTIONABLE client code. `publicMessage` is always server-authored:
 * upstream text is logged, never returned.
 */
interface UpstreamErrorShape {
  status: number;
  /** OpenAI-compatible `error.type`. Kept stable for existing consumers. */
  type: string;
  /** Specific, stable machine code the client can branch on. */
  code: string;
  message: string;
}

/**
 * Category → client contract. Every branch returns a message the USER can act
 * on; none of them contain provider names, payloads, or stack detail.
 */
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
      // Retained verbatim (including the provider label) because it is an
      // intentional, actionable recovery instruction and the serving provider
      // is already visible in the model picker for explicit selections.
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
      // An upstream 401/403 is OUR credential problem, not the caller's. The
      // status is preserved (existing clients branch on it) but the message no
      // longer implies the USER needs to re-authenticate with us.
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

  // The raw upstream text stays HERE, in the server log, with everything an
  // operator needs to debug it. It is deliberately not part of the response.
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

  // Billing failures are not a provider taxonomy category: `classifyError`
  // sees an upstream 402 as a generic client error, but the caller needs the
  // distinct insufficient-credits contract that already exists.
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
        // Retryability is already computed by the classifier; surfacing it
        // saves every client from re-deriving it from the status code.
        retryable: classified.retryable,
      },
    },
    { status: shape.status },
  );
}
