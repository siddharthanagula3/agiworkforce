import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { LLMCompletionRequestSchema } from '@/lib/validations/llm';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { calculateCacheSavings, logCacheAnalytics } from '@/lib/prompt-cache-helper';

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

  // Define fallback models ordered by cost (cheapest first)
  // These are the most cost-effective models available
  const fallbackModels = [
    { model: 'deepseek-v3', provider: 'deepseek' }, // $0.028/$0.42 per 1M - Cheapest
    { model: 'gemini-3-flash', provider: 'google' }, // $0.075/$0.3 per 1M - Very cheap
    { model: 'gpt-5-nano', provider: 'openai' }, // $0.05/$0.4 per 1M - Cheap OpenAI
    { model: 'grok-4.1-fast', provider: 'xai' }, // $0.1/$0.4 per 1M - Fast Grok
    { model: 'claude-haiku-4-5', provider: 'anthropic' }, // $1/$5 per 1M - Quality option
    { model: 'qwen3-max', provider: 'qwen' }, // $0.5/$2 per 1M
  ];

  // Try each fallback model and find the cheapest one that's cheaper than current
  for (const fallback of fallbackModels) {
    // Skip if it's the same model
    if (fallback.model === modelLower || fallback.provider === currentProvider) {
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
 * Handle credit error and return appropriate response
 */
function handleCreditError(
  deductResult: {
    code?: string;
    daily_remaining?: number;
    daily_limit?: number;
    daily_used?: number;
  },
  balance: { daily_reset_at?: string; allocated_cents?: number; remaining_cents?: number } | null,
): NextResponse {
  // Check if it's a daily limit issue
  if (deductResult.code === 'DAILY_CREDIT_LIMIT_REACHED') {
    const resetAt = balance?.daily_reset_at
      ? new Date(balance.daily_reset_at)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const hoursUntilReset = Math.max(0, (resetAt.getTime() - Date.now()) / (1000 * 60 * 60));

    return NextResponse.json(
      {
        error: `Daily credit limit reached. You can use $${((deductResult.daily_remaining || 0) / 100).toFixed(2)} more in ${Math.ceil(hoursUntilReset)} hours.`,
        code: 'DAILY_CREDIT_LIMIT_REACHED',
        daily_limit: deductResult.daily_limit,
        daily_used: deductResult.daily_used,
        daily_remaining: deductResult.daily_remaining,
        reset_in_hours: hoursUntilReset,
        monthly_limit: balance?.allocated_cents,
        monthly_remaining: balance?.remaining_cents,
        balance,
      },
      { status: 402 },
    );
  }

  // Monthly limit issue
  return NextResponse.json(
    {
      error:
        'Monthly credit limit reached. Please upgrade your plan (Pro/Max) to continue using Cloud models.',
      code: 'MONTHLY_CREDIT_LIMIT_REACHED',
      balance,
    },
    { status: 402 },
  );
}

async function handleLLMCompletion(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Get authentication token from Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError.unauthorized('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);

  // Verify user with Supabase - create client with anon key to verify JWT
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      flowType: 'pkce', // Use PKCE flow for enhanced security
    },
  });

  // Verify the JWT token by calling getUser with the token
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    logger.warn({ error: authError }, 'Authentication failed');
    throw createError.unauthorized('Invalid authentication token');
  }

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

  // Track original model for fallback detection
  const originalModel = llmRequest.model;
  let usedFallback = false;
  let fallbackReason: string | undefined;

  // Determine provider from model
  let provider = LLMProviderFactory.getProviderFromModel(llmRequest.model);

  // Estimate cost before making request
  const estimatedPromptTokens = llmRequest.messages.reduce(
    (sum, msg) => sum + Math.ceil(msg.content.length / 4),
    0,
  );
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

    // Try to deduct to get detailed error information
    const deductResult = await CreditService.deductCredits(
      user.id,
      estimatedCostCents,
      'Credit check',
    );

    logger.warn(
      {
        userId: user.id,
        estimatedCostCents,
        balance,
        deductResult,
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
        return handleCreditError(deductResult, balance);
      }
    } else {
      // No cheaper alternative available, return error
      return handleCreditError(deductResult, balance);
    }
  }

  // Make LLM request
  if (llmRequest.stream) {
    try {
      const stream = await LLMProviderFactory.streamRequest(provider, llmRequest);
      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          provider,
          model: llmRequest.model,
          userId: user.id,
        },
        'Streaming request failed',
      );
      throw createError.internal(
        `Streaming request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  let llmResponse;
  try {
    llmResponse = await LLMProviderFactory.sendRequest(provider, llmRequest);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        provider,
        model: llmRequest.model,
        userId: user.id,
      },
      'LLM request failed',
    );
    throw createError.internal(
      `LLM request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  // Calculate actual cost
  const actualCostCents = LLMCostCalculator.calculateCost(provider, llmResponse.model, {
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
  });

  // Deduct credits
  const deductResult = await CreditService.deductCredits(
    user.id,
    actualCostCents,
    `LLM request: ${provider}/${llmResponse.model}`,
    {
      provider,
      model: llmResponse.model,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
    },
  );

  if (!deductResult.success) {
    logger.error(
      {
        userId: user.id,
        actualCostCents,
        deductResult,
      },
      'Failed to deduct credits after LLM request',
    );

    // If daily limit was hit, return error
    if (deductResult.code === 'DAILY_CREDIT_LIMIT_REACHED') {
      const balance = await CreditService.getBalance(user.id);
      const resetAt = balance?.daily_reset_at
        ? new Date(balance.daily_reset_at)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const hoursUntilReset = Math.max(0, (resetAt.getTime() - Date.now()) / (1000 * 60 * 60));

      return NextResponse.json(
        {
          error: `Daily credit limit reached. You can use $${((deductResult.daily_remaining || 0) / 100).toFixed(2)} more in ${Math.ceil(hoursUntilReset)} hours.`,
          code: 'DAILY_CREDIT_LIMIT_REACHED',
          daily_limit: deductResult.daily_limit,
          daily_used: deductResult.daily_used,
          daily_remaining: deductResult.daily_remaining,
          reset_in_hours: hoursUntilReset,
        },
        { status: 402 },
      );
    }

    // Note: For other errors, we still return the response, but log the error
    // In production, you might want to handle this differently
  }

  // Get updated balance for response
  const updatedBalance = await CreditService.getBalance(user.id);

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
      daily_limit: updatedBalance?.daily_limit_cents,
      daily_used: updatedBalance?.daily_used_cents,
      daily_remaining: updatedBalance?.daily_remaining_cents,
      daily_reset_at: updatedBalance?.daily_reset_at,
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
