import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { requireEnv } from '@/utils/env';
import { LLMCompletionRequestSchema } from '@/lib/validations/llm';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService, type CreditBalance } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { calculateCacheSavings, logCacheAnalytics } from '@/lib/prompt-cache-helper';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { MODEL_TIER_REQUIREMENTS, canAccessModel } from '@/lib/model-tiers';
import { getEconomyFallbackModels, normalizeModelId } from '@agiworkforce/types';

/**
 * Check if a subscription tier allows access to a model.
 * Delegates to the shared canAccessModel() from lib/model-tiers.ts.
 * Unknown models are denied and logged here for traceability.
 */
function checkModelTierAccess(model: string, subscriptionTier: string): boolean {
  const allowed = canAccessModel(model, subscriptionTier);
  if (!allowed && subscriptionTier.toLowerCase() !== 'free') {
    logger.warn(
      { model: model.toLowerCase(), tier: subscriptionTier.toLowerCase() },
      'Model access denied — not in economy or tier requirements map',
    );
  }
  return allowed;
}

/**
 * Find a cheaper alternative model when credits are insufficient
 * Returns null if no cheaper alternative is available
 */
function findCheaperFallbackModel(
  currentModel: string,
  currentProvider: string,
  estimatedPromptTokens: number,
  maxTokens: number,
): { model: string; provider: string } | null {
  const modelLower = currentModel.toLowerCase();
  const currentCost = LLMCostCalculator.estimateCost(
    currentProvider,
    currentModel,
    estimatedPromptTokens,
    maxTokens,
  );

  const canonicalCurrentModel = normalizeModelId(currentModel) ?? currentModel.toLowerCase();
  const fallbackModels = getEconomyFallbackModels();

  // Try each fallback model and find the cheapest one that's cheaper than current
  for (const fallback of fallbackModels) {
    // Skip only if it's the exact same model (not same provider — cheaper same-provider
    // models like claude-haiku should be valid fallbacks for claude-opus)
    if (fallback.model === canonicalCurrentModel || fallback.model === modelLower) {
      continue;
    }

    const fallbackCost = LLMCostCalculator.estimateCost(
      fallback.provider,
      fallback.model,
      estimatedPromptTokens,
      maxTokens,
    );

    // If this fallback is cheaper, return it
    if (fallbackCost < currentCost) {
      return fallback;
    }
  }

  return null;
}

/**
 * Synthesize a deductResult shape from a balance for the credit-check failure path.
 * Used when checkAvailable() returns false before any deductCredits() call.
 */
function buildCreditErrorFromBalance(balance: CreditBalance | null) {
  return {
    code: 'MONTHLY_CREDIT_LIMIT_REACHED',
    monthly_limit: balance?.credits_allocated_cents ?? 0,
    monthly_remaining: balance?.credits_remaining_cents ?? 0,
  };
}

/**
 * Handle credit error and return appropriate response
 */
function handleCreditError(
  _deductResult: {
    code?: string;
    daily_remaining?: number;
    daily_limit?: number;
    daily_used?: number;
  },
  balance: CreditBalance | null,
): NextResponse {
  const resetAt = balance?.period_end ? new Date(balance.period_end) : null;
  const hoursUntilReset =
    resetAt != null ? Math.max(0, (resetAt.getTime() - Date.now()) / (1000 * 60 * 60)) : null;

  return NextResponse.json(
    {
      error:
        'Usage budget exhausted for this billing period. Upgrade your plan or wait for the next billing reset.',
      code: 'MONTHLY_CREDIT_LIMIT_REACHED',
      reset_in_hours: hoursUntilReset,
      balance,
    },
    { status: 402 },
  );
}

async function handleLLMCompletion(request: NextRequest) {
  // AUDIT-008-006: Enforce CSRF protection for state-changing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Get authentication token from Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);

  // Verify user with Supabase using service role key for reliable JWT verification
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');

  const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  // Verify the JWT token by calling getUser with the token
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    logger.warn({ error: authError }, 'Authentication failed');
    throw createError.unauthorized('Invalid authentication token');
  }

  // Generate unique request ID for idempotency (prevents duplicate charges on retry)
  const requestId = randomUUID();

  // Get subscription
  const subscription = await SubscriptionService.getSubscription(user.id);

  if (!subscription) {
    throw createError.forbidden('No active subscription found');
  }

  // Check if subscription is active
  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(subscription.status)) {
    throw createError.forbidden(
      `Subscription is ${subscription.status}. Please update your payment method.`,
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const validationResult = LLMCompletionRequestSchema.safeParse(body);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }

  const llmRequest = validationResult.data;
  // Normalize model name to lowercase to prevent case-variation bypass of tier checks
  llmRequest.model = llmRequest.model.toLowerCase();

  // Check if user's subscription tier allows access to the requested model
  if (!checkModelTierAccess(llmRequest.model, subscription.plan_tier)) {
    const requiredTiers = MODEL_TIER_REQUIREMENTS[llmRequest.model.toLowerCase()];
    const requiredTierDisplay = requiredTiers?.[0]?.toUpperCase() ?? 'PRO';
    logger.warn(
      {
        userId: user.id,
        model: llmRequest.model,
        userTier: subscription.plan_tier,
        requiredTiers,
      },
      'Model access denied due to insufficient subscription tier',
    );
    throw createError.forbidden(
      `Model ${llmRequest.model} requires a ${requiredTierDisplay} subscription or higher. Please upgrade your plan to access this model.`,
    );
  }

  // Track original model for fallback detection
  const originalModel = llmRequest.model;
  let usedFallback = false;
  let fallbackReason: string | undefined;

  // Determine provider from model
  let provider = LLMProviderFactory.getProviderFromModel(llmRequest.model);

  const KNOWN_PROVIDERS = new Set([
    'openai',
    'anthropic',
    'google',
    'xai',
    'qwen',
    'moonshot',
    'deepseek',
    'perplexity',
    'zhipu',
  ]);
  if (!KNOWN_PROVIDERS.has(provider)) {
    logger.error(
      { provider, model: llmRequest.model },
      'Unexpected LLM provider returned from routing',
    );
    throw createError.internal('Invalid LLM provider configuration');
  }

  // Validate message length to prevent abuse (max 1MB total content)
  const MAX_MESSAGE_LENGTH = 100000; // 100k chars per message
  const MAX_TOTAL_LENGTH = 1000000; // 1MB total
  let totalLength = 0;

  for (const msg of llmRequest.messages) {
    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      throw createError.validation(
        `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
      );
    }
    totalLength += msg.content.length;
  }

  if (totalLength > MAX_TOTAL_LENGTH) {
    throw createError.validation(
      `Total message content exceeds maximum length of ${MAX_TOTAL_LENGTH} characters`,
    );
  }

  // Estimate tokens using improved heuristic:
  // - Average English word is ~5 chars, average token is ~4 chars
  // - Add 10% buffer for special tokens, formatting, etc.
  // - Use a more conservative 3.5 chars per token for safety
  const estimatedPromptTokens = llmRequest.messages.reduce((sum, msg) => {
    // Base estimation: ~3.5 chars per token (more conservative than 4)
    const baseTokens = Math.ceil(msg.content.length / 3.5);
    // Add overhead for message formatting tokens (role, delimiters, etc.)
    const overheadTokens = 4;
    return sum + baseTokens + overheadTokens;
  }, 0);
  let estimatedCostCents = LLMCostCalculator.estimateCost(
    provider,
    llmRequest.model,
    estimatedPromptTokens,
    llmRequest.max_tokens || 1000,
  );

  // Check if user has enough credits (both daily and monthly)
  const hasCredits = await CreditService.checkAvailable(user.id, estimatedCostCents);

  if (!hasCredits) {
    const balance = await CreditService.getBalance(user.id);

    logger.warn(
      {
        userId: user.id,
        estimatedCostCents,
        balance,
        requestedModel: llmRequest.model,
        requestedProvider: provider,
      },
      'Insufficient credits for requested model, attempting fallback',
    );

    // Try to find a cheaper alternative model
    const fallbackModel = findCheaperFallbackModel(
      llmRequest.model,
      provider,
      estimatedPromptTokens,
      llmRequest.max_tokens || 1000,
    );

    if (fallbackModel) {
      const fallbackProvider = LLMProviderFactory.getProviderFromModel(fallbackModel.model);
      const fallbackCostCents = LLMCostCalculator.estimateCost(
        fallbackProvider,
        fallbackModel.model,
        estimatedPromptTokens,
        llmRequest.max_tokens || 1000,
      );

      const hasFallbackCredits = await CreditService.checkAvailable(user.id, fallbackCostCents);

      if (hasFallbackCredits) {
        logger.info(
          {
            userId: user.id,
            originalModel: llmRequest.model,
            fallbackModel: fallbackModel.model,
            originalCost: estimatedCostCents,
            fallbackCost: fallbackCostCents,
          },
          'Switching to cheaper fallback model due to insufficient credits',
        );

        // Update request with fallback model
        usedFallback = true;
        fallbackReason = `Insufficient credits for ${originalModel}, switched to ${fallbackModel.model}`;
        llmRequest.model = fallbackModel.model;
        provider = fallbackProvider;
        estimatedCostCents = fallbackCostCents;
      } else {
        // Even fallback model is too expensive, return error
        return handleCreditError(buildCreditErrorFromBalance(balance), balance);
      }
    } else {
      // No cheaper alternative available, return error
      return handleCreditError(buildCreditErrorFromBalance(balance), balance);
    }
  }

  // CREDIT RESERVATION PATTERN: Reserve estimated credits BEFORE making the LLM request
  // This prevents race conditions where concurrent requests could exceed limits
  // After the request completes, we reconcile by adjusting for actual usage
  const reservationDescription = `Credit reservation: ${provider}/${llmRequest.model}`;
  const reservationKey = CreditService.generateIdempotencyKey(user.id, 'reservation', requestId);
  const reserveResult = await CreditService.deductCredits(
    user.id,
    estimatedCostCents,
    reservationDescription,
    {
      provider,
      model: llmRequest.model,
      type: 'reservation',
      estimatedPromptTokens,
      estimatedMaxTokens: llmRequest.max_tokens || 1000,
      requestId,
    },
    reservationKey,
  );

  if (!reserveResult.success) {
    logger.warn(
      {
        userId: user.id,
        estimatedCostCents,
        reserveResult,
      },
      'Failed to reserve credits before LLM request',
    );

    // Return appropriate error based on the failure reason
    const balance = await CreditService.getBalance(user.id);
    return handleCreditError(reserveResult, balance);
  }

  logger.info(
    {
      userId: user.id,
      estimatedCostCents,
      model: llmRequest.model,
      provider,
    },
    'Credits reserved for LLM request',
  );

  // Make LLM request
  if (llmRequest.stream) {
    try {
      const stream = await LLMProviderFactory.streamRequest(provider, llmRequest);

      // Create a transform stream that tracks usage data from SSE events
      // and reconciles credits after streaming completes
      const userId = user.id;
      const modelUsed = llmRequest.model;
      const providerUsed = provider;

      let inputTokens = 0;
      let outputTokens = 0;
      let buffer = '';

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          // Pass through the chunk immediately
          controller.enqueue(chunk);

          // Decode and parse SSE events to extract usage data
          const text = new TextDecoder().decode(chunk);
          buffer += text;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const event = JSON.parse(jsonStr);

                // Anthropic format: message_delta with usage
                if (event.type === 'message_delta' && event.usage) {
                  outputTokens = event.usage.output_tokens || outputTokens;
                }
                // Anthropic format: message_start with input tokens
                if (event.type === 'message_start' && event.message?.usage) {
                  inputTokens = event.message.usage.input_tokens || inputTokens;
                }
                // OpenAI format: usage in final chunk
                if (event.usage) {
                  inputTokens = event.usage.prompt_tokens || inputTokens;
                  outputTokens = event.usage.completion_tokens || outputTokens;
                }
                // Google/Gemini format
                if (event.usageMetadata) {
                  inputTokens = event.usageMetadata.promptTokenCount || inputTokens;
                  outputTokens = event.usageMetadata.candidatesTokenCount || outputTokens;
                }
              } catch {
                // Ignore JSON parse errors for non-JSON lines
              }
            }
          }
        },
        async flush() {
          // Stream complete - reconcile credits
          const totalTokens = inputTokens + outputTokens;

          if (totalTokens > 0) {
            const actualCostCents = LLMCostCalculator.calculateCost(providerUsed, modelUsed, {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens,
            });

            const costDifference = actualCostCents - estimatedCostCents;

            if (costDifference !== 0) {
              const adjustmentDescription =
                costDifference > 0
                  ? `Additional charge (streaming): ${providerUsed}/${modelUsed}`
                  : `Credit adjustment (streaming): ${providerUsed}/${modelUsed}`;

              const reconciliationKey = CreditService.generateIdempotencyKey(
                userId,
                'reconciliation',
                requestId,
              );
              await CreditService.deductCredits(
                userId,
                costDifference,
                adjustmentDescription,
                {
                  provider: providerUsed,
                  model: modelUsed,
                  type: 'streaming_reconciliation',
                  estimatedCostCents,
                  actualCostCents,
                  promptTokens: inputTokens,
                  completionTokens: outputTokens,
                  totalTokens,
                  requestId,
                },
                reconciliationKey,
              );

              logger.info(
                {
                  userId,
                  estimatedCostCents,
                  actualCostCents,
                  costDifference,
                  inputTokens,
                  outputTokens,
                },
                'Streaming credit reconciliation completed',
              );
            }
          } else {
            // No usage data received - log warning but don't refund
            // The reservation covers worst case
            logger.warn(
              { userId, model: modelUsed, provider: providerUsed },
              'No usage data received from streaming response, keeping reserved credits',
            );
          }
        },
      });

      const reconciledStream = stream.pipeThrough(transformStream);

      return new NextResponse(reconciledStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } catch (error) {
      // Refund the reserved credits on failure with idempotency key
      logger.info(
        { userId: user.id, estimatedCostCents },
        'Refunding reserved credits after stream failure',
      );
      const refundKey = CreditService.generateIdempotencyKey(user.id, 'refund', requestId);
      await CreditService.deductCredits(
        user.id,
        -estimatedCostCents, // Negative amount = refund
        `Refund for failed streaming request: ${provider}/${llmRequest.model}`,
        { type: 'refund', reason: 'streaming_failure', requestId },
        refundKey,
      );
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          provider,
          model: llmRequest.model,
          userId: user.id,
        },
        'Streaming request failed',
      );
      throw createError.internal('Streaming request failed');
    }
  }

  let llmResponse;
  try {
    llmResponse = await LLMProviderFactory.sendRequest(provider, llmRequest);
  } catch (error) {
    // Refund the reserved credits on failure with idempotency key
    logger.info(
      { userId: user.id, estimatedCostCents },
      'Refunding reserved credits after request failure',
    );
    const refundKey = CreditService.generateIdempotencyKey(user.id, 'refund', requestId);
    await CreditService.deductCredits(
      user.id,
      -estimatedCostCents, // Negative amount = refund
      `Refund for failed request: ${provider}/${llmRequest.model}`,
      { type: 'refund', reason: 'request_failure', requestId },
      refundKey,
    );
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        provider,
        model: llmRequest.model,
        userId: user.id,
      },
      'LLM request failed',
    );
    throw createError.internal('LLM request failed. Please try again.');
  }

  // Calculate actual cost
  const actualCostCents = LLMCostCalculator.calculateCost(provider, llmResponse.model, {
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
  });

  // RECONCILIATION: Adjust for the difference between estimated and actual cost
  const costDifference = actualCostCents - estimatedCostCents;

  let deductResult = reserveResult; // Start with reservation result

  if (costDifference !== 0) {
    // If actual cost differs from estimate, adjust the balance
    const adjustmentDescription =
      costDifference > 0
        ? `Additional charge: ${provider}/${llmResponse.model} (actual exceeded estimate)`
        : `Credit adjustment: ${provider}/${llmResponse.model} (actual less than estimate)`;

    const reconciliationKey = CreditService.generateIdempotencyKey(
      user.id,
      'reconciliation',
      requestId,
    );
    const adjustmentResult = await CreditService.deductCredits(
      user.id,
      costDifference, // Positive = additional charge, negative = refund
      adjustmentDescription,
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

    if (!adjustmentResult.success && costDifference > 0) {
      // If we couldn't charge the additional amount, log it but don't fail the request
      // The user already got the response, so we absorb the difference
      logger.warn(
        {
          userId: user.id,
          costDifference,
          adjustmentResult,
        },
        'Failed to charge additional credits after LLM request (absorbed)',
      );
    } else {
      deductResult = adjustmentResult;
    }

    logger.info(
      {
        userId: user.id,
        estimatedCostCents,
        actualCostCents,
        costDifference,
        adjustmentSuccess: adjustmentResult.success,
      },
      'Credit reconciliation completed',
    );
  }

  // Get updated balance for response
  await CreditService.getBalance(user.id);

  // Calculate cache savings if applicable
  const cacheMetrics = calculateCacheSavings(
    llmResponse,
    LLMCostCalculator.getInputCostPerMtok(provider, llmResponse.model),
  );

  // Log cache analytics for monitoring
  if (llmResponse.cacheCreationInputTokens || llmResponse.cachedInputTokens) {
    logCacheAnalytics(user.id, llmResponse.model, provider, llmResponse, cacheMetrics);
  }

  // Return response in OpenAI-compatible format
  return NextResponse.json({
    choices: [
      {
        message: {
          role: 'assistant',
          content: llmResponse.content,
        },
        finish_reason: llmResponse.finishReason || 'stop',
      },
    ],
    model: llmResponse.model,
    ...(usedFallback && {
      fallback: {
        original_model: originalModel,
        reason: fallbackReason,
      },
    }),
    usage: {
      prompt_tokens: llmResponse.promptTokens,
      completion_tokens: llmResponse.completionTokens,
      total_tokens: llmResponse.totalTokens,
      cache_creation_input_tokens: llmResponse.cacheCreationInputTokens,
      cache_read_input_tokens: llmResponse.cachedInputTokens,
    },
    credits: {
      cost_cents: actualCostCents,
      remaining_cents: deductResult.remaining_cents,
      daily_limit: 0,
      daily_used: 0,
      daily_remaining: 0,
      daily_reset_at: null,
    },
    cache: {
      cached_input_tokens: llmResponse.cachedInputTokens || 0,
      cache_creation_input_tokens: llmResponse.cacheCreationInputTokens || 0,
      tokens_saved: cacheMetrics.tokensSavedByCache,
      cost_saved_cents: cacheMetrics.savedCostCents,
      cache_write_cost_cents: cacheMetrics.cacheWriteCostCents,
    },
  });
}

export const POST = withErrorHandler(handleLLMCompletion);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
