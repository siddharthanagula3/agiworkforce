import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { CreditService, type CreditBalance } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { calculateCacheSavings, logCacheAnalytics } from '@/lib/prompt-cache-helper';

/**
 * OpenAI-compatible Chat Completions API
 * Endpoint: POST /v1/chat/completions (via api.agiworkforce.com)
 *
 * This provides an OpenAI-compatible interface that routes to multiple LLM providers
 * based on the model selected. Users authenticate with their Supabase JWT and are
 * billed via cloud credits.
 */

// OpenAI-compatible request schema
const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool', 'function']),
      content: z.union([
        z.string(),
        z.array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
            image_url: z
              .object({
                url: z.string(),
                detail: z.enum(['auto', 'low', 'high']).optional(),
              })
              .optional(),
          }),
        ),
      ]),
      name: z.string().optional(),
      tool_calls: z.array(z.unknown()).optional(),
      tool_call_id: z.string().optional(),
    }),
  ),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  logit_bias: z.record(z.string(), z.number()).optional(),
  user: z.string().optional(),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
  response_format: z
    .object({
      type: z.enum(['text', 'json_object', 'json_schema']).optional(),
      json_schema: z.unknown().optional(),
    })
    .optional(),
  seed: z.number().int().optional(),
  // Extended parameters for AGI Workforce
  thinking_mode: z.boolean().optional(),
  use_prompt_cache: z.boolean().optional(),
});

// Model tier requirements
const MODEL_TIER_REQUIREMENTS: Record<string, ('pro' | 'max' | 'enterprise')[]> = {
  'claude-opus-4-5': ['max', 'enterprise'],
  'claude-opus-4-5-20251101': ['max', 'enterprise'],
  o3: ['max', 'enterprise'],
  'o3-mini': ['max', 'enterprise'],
  'gpt-5': ['max', 'enterprise'],
  'gpt-5-turbo': ['max', 'enterprise'],
  'gemini-2.5-pro': ['max', 'enterprise'],
  'claude-sonnet-4': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4-20250514': ['pro', 'max', 'enterprise'],
  'gpt-4.5': ['pro', 'max', 'enterprise'],
  'gpt-4.5-turbo': ['pro', 'max', 'enterprise'],
};

function checkModelTierAccess(model: string, subscriptionTier: string): boolean {
  const modelLower = model.toLowerCase();
  const tierLower = subscriptionTier.toLowerCase();

  if (tierLower === 'free') return false;

  const requiredTiers = MODEL_TIER_REQUIREMENTS[modelLower];
  if (!requiredTiers) return true;

  return requiredTiers.includes(tierLower as 'pro' | 'max' | 'enterprise');
}

function findCheaperFallbackModel(
  currentModel: string,
  currentProvider: string,
  estimatedPromptTokens: number,
  maxTokens: number,
): { model: string; provider: string } | null {
  const currentCost = LLMCostCalculator.estimateCost(
    currentProvider,
    currentModel,
    estimatedPromptTokens,
    maxTokens,
  );

  const fallbackModels = [
    { model: 'deepseek-chat', provider: 'deepseek' },
    { model: 'qwen-flash', provider: 'qwen' },
    { model: 'gpt-5-nano', provider: 'openai' },
    { model: 'gemini-2.5-flash-lite', provider: 'google' },
    { model: 'claude-haiku-4-5', provider: 'anthropic' },
  ];

  for (const fallback of fallbackModels) {
    if (fallback.model === currentModel.toLowerCase()) continue;

    const fallbackCost = LLMCostCalculator.estimateCost(
      fallback.provider,
      fallback.model,
      estimatedPromptTokens,
      maxTokens,
    );

    if (fallbackCost < currentCost) return fallback;
  }

  return null;
}

function handleCreditError(
  deductResult: {
    code?: string;
    daily_remaining?: number;
    daily_limit?: number;
    daily_used?: number;
  },
  _balance: CreditBalance | null,
): NextResponse {
  if (deductResult.code === 'DAILY_CREDIT_LIMIT_REACHED') {
    return NextResponse.json(
      {
        error: {
          message: 'Daily credit limit reached. Credits reset at midnight UTC.',
          type: 'insufficient_quota',
          code: 'daily_limit_exceeded',
        },
      },
      { status: 429 },
    );
  }

  return NextResponse.json(
    {
      error: {
        message: 'Monthly credit limit reached. Please upgrade your plan or add credits.',
        type: 'insufficient_quota',
        code: 'monthly_limit_exceeded',
      },
    },
    { status: 402 },
  );
}

// Extract text content from OpenAI-style message content
function extractTextContent(
  content: string | Array<{ type: string; text?: string; image_url?: unknown }>,
): string {
  if (typeof content === 'string') return content;

  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text!)
    .join('\n');
}

async function handleChatCompletions(request: NextRequest) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  // Authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        error: {
          message: 'Missing or invalid authorization header',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      { status: 401 },
    );
  }

  const token = authHeader.substring(7);

  // Verify user with Supabase
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, flowType: 'pkce' },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid authentication token',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      { status: 401 },
    );
  }

  // Generate unique request ID for idempotency (prevents duplicate charges on retry)
  const requestId = randomUUID();

  // Get subscription
  const subscription = await SubscriptionService.getSubscription(user.id);

  if (!subscription) {
    return NextResponse.json(
      {
        error: {
          message: 'No active subscription found',
          type: 'invalid_request_error',
          code: 'subscription_required',
        },
      },
      { status: 403 },
    );
  }

  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(subscription.status)) {
    return NextResponse.json(
      {
        error: {
          message: `Subscription is ${subscription.status}. Please update your payment method.`,
          type: 'invalid_request_error',
          code: 'subscription_inactive',
        },
      },
      { status: 403 },
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid JSON in request body',
          type: 'invalid_request_error',
        },
      },
      { status: 400 },
    );
  }

  const validationResult = ChatCompletionRequestSchema.safeParse(body);
  if (!validationResult.success) {
    return NextResponse.json(
      {
        error: {
          message: validationResult.error.message,
          type: 'invalid_request_error',
          param: validationResult.error.issues[0]?.path.join('.'),
        },
      },
      { status: 400 },
    );
  }

  const chatRequest = validationResult.data;

  // Check model access
  if (!checkModelTierAccess(chatRequest.model, subscription.plan_tier)) {
    const requiredTiers = MODEL_TIER_REQUIREMENTS[chatRequest.model.toLowerCase()];
    return NextResponse.json(
      {
        error: {
          message: `Model ${chatRequest.model} requires ${requiredTiers?.[0]?.toUpperCase() || 'PRO'} subscription or higher.`,
          type: 'invalid_request_error',
          code: 'model_not_available',
        },
      },
      { status: 403 },
    );
  }

  // Track fallback
  const originalModel = chatRequest.model;
  let usedFallback = false;
  let fallbackReason: string | undefined;

  // Determine provider
  let provider = LLMProviderFactory.getProviderFromModel(chatRequest.model);

  // Calculate message length
  const MAX_MESSAGE_LENGTH = 100000;
  const MAX_TOTAL_LENGTH = 1000000;
  let totalLength = 0;

  for (const msg of chatRequest.messages) {
    const textContent = extractTextContent(msg.content);
    if (textContent.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          error: {
            message: `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
            type: 'invalid_request_error',
          },
        },
        { status: 400 },
      );
    }
    totalLength += textContent.length;
  }

  if (totalLength > MAX_TOTAL_LENGTH) {
    return NextResponse.json(
      {
        error: {
          message: `Total message content exceeds maximum length of ${MAX_TOTAL_LENGTH} characters`,
          type: 'invalid_request_error',
        },
      },
      { status: 400 },
    );
  }

  // Estimate tokens
  const estimatedPromptTokens = chatRequest.messages.reduce((sum, msg) => {
    const textContent = extractTextContent(msg.content);
    const baseTokens = Math.ceil(textContent.length / 3.5);
    const overheadTokens = 4;
    return sum + baseTokens + overheadTokens;
  }, 0);

  const maxTokens = chatRequest.max_tokens || chatRequest.max_completion_tokens || 1000;
  let estimatedCostCents = LLMCostCalculator.estimateCost(
    provider,
    chatRequest.model,
    estimatedPromptTokens,
    maxTokens,
  );

  // Check credits
  const hasCredits = await CreditService.checkAvailable(user.id, estimatedCostCents);

  if (!hasCredits) {
    const balance = await CreditService.getBalance(user.id);
    const deductResult = await CreditService.deductCredits(
      user.id,
      estimatedCostCents,
      'Credit check',
    );

    // Try fallback model
    const fallbackModel = findCheaperFallbackModel(
      chatRequest.model,
      provider,
      estimatedPromptTokens,
      maxTokens,
    );

    if (fallbackModel) {
      const fallbackProvider = LLMProviderFactory.getProviderFromModel(fallbackModel.model);
      const fallbackCostCents = LLMCostCalculator.estimateCost(
        fallbackProvider,
        fallbackModel.model,
        estimatedPromptTokens,
        maxTokens,
      );

      const hasFallbackCredits = await CreditService.checkAvailable(user.id, fallbackCostCents);

      if (hasFallbackCredits) {
        usedFallback = true;
        fallbackReason = `Insufficient credits for ${originalModel}, switched to ${fallbackModel.model}`;
        chatRequest.model = fallbackModel.model;
        provider = fallbackProvider;
        estimatedCostCents = fallbackCostCents;
      } else {
        return handleCreditError(deductResult, balance);
      }
    } else {
      return handleCreditError(deductResult, balance);
    }
  }

  // Reserve credits with idempotency key (prevents double-charging on retry)
  const reservationKey = CreditService.generateIdempotencyKey(user.id, 'reservation', requestId);
  const reserveResult = await CreditService.deductCredits(
    user.id,
    estimatedCostCents,
    `Credit reservation: ${provider}/${chatRequest.model}`,
    {
      provider,
      model: chatRequest.model,
      type: 'reservation',
      estimatedPromptTokens,
      estimatedMaxTokens: maxTokens,
      requestId,
    },
    reservationKey,
  );

  if (!reserveResult.success) {
    const balance = await CreditService.getBalance(user.id);
    return handleCreditError(reserveResult, balance);
  }

  // Convert messages to internal format
  const internalMessages = chatRequest.messages.map((msg) => ({
    role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
    content: extractTextContent(msg.content),
    tool_calls: msg.tool_calls,
    tool_call_id: msg.tool_call_id,
  }));

  const llmRequest = {
    model: chatRequest.model,
    messages: internalMessages,
    temperature: chatRequest.temperature,
    max_tokens: maxTokens,
    stream: chatRequest.stream,
    tools: chatRequest.tools,
    tool_choice: chatRequest.tool_choice,
    thinking_mode: chatRequest.thinking_mode,
    usePromptCache: chatRequest.use_prompt_cache,
  };

  // Handle streaming
  if (chatRequest.stream) {
    try {
      const stream = await LLMProviderFactory.streamRequest(provider, llmRequest);

      const userId = user.id;
      const modelUsed = chatRequest.model;
      const providerUsed = provider;

      let inputTokens = 0;
      let outputTokens = 0;
      let buffer = '';

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);

          const text = new TextDecoder().decode(chunk);
          buffer += text;

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const event = JSON.parse(jsonStr);

                if (event.type === 'message_delta' && event.usage) {
                  outputTokens = event.usage.output_tokens || outputTokens;
                }
                if (event.type === 'message_start' && event.message?.usage) {
                  inputTokens = event.message.usage.input_tokens || inputTokens;
                }
                if (event.usage) {
                  inputTokens = event.usage.prompt_tokens || inputTokens;
                  outputTokens = event.usage.completion_tokens || outputTokens;
                }
                if (event.usageMetadata) {
                  inputTokens = event.usageMetadata.promptTokenCount || inputTokens;
                  outputTokens = event.usageMetadata.candidatesTokenCount || outputTokens;
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        },
        async flush() {
          const totalTokens = inputTokens + outputTokens;

          if (totalTokens > 0) {
            const actualCostCents = LLMCostCalculator.calculateCost(providerUsed, modelUsed, {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens,
            });

            const costDifference = actualCostCents - estimatedCostCents;

            if (costDifference !== 0) {
              // Use idempotency key for reconciliation to prevent duplicate adjustments
              const reconciliationKey = CreditService.generateIdempotencyKey(
                userId,
                'reconciliation',
                requestId,
              );
              await CreditService.deductCredits(
                userId,
                costDifference,
                `Credit adjustment (streaming): ${providerUsed}/${modelUsed}`,
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
            }
          }
        },
      });

      const reconciledStream = stream.pipeThrough(transformStream);

      return new NextResponse(reconciledStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      // Refund on failure with idempotency key to prevent duplicate refunds
      const refundKey = CreditService.generateIdempotencyKey(user.id, 'refund', requestId);
      await CreditService.deductCredits(
        user.id,
        -estimatedCostCents,
        `Refund for failed streaming request: ${provider}/${chatRequest.model}`,
        { type: 'refund', reason: 'streaming_failure', requestId },
        refundKey,
      );

      logger.error({ error, provider, model: chatRequest.model }, 'Streaming request failed');

      return NextResponse.json(
        {
          error: {
            message: error instanceof Error ? error.message : 'Streaming request failed',
            type: 'server_error',
          },
        },
        { status: 500 },
      );
    }
  }

  // Non-streaming request
  let llmResponse;
  try {
    llmResponse = await LLMProviderFactory.sendRequest(provider, llmRequest);
  } catch (error) {
    // Refund on failure with idempotency key to prevent duplicate refunds
    const refundKey = CreditService.generateIdempotencyKey(user.id, 'refund', requestId);
    await CreditService.deductCredits(
      user.id,
      -estimatedCostCents,
      `Refund for failed request: ${provider}/${chatRequest.model}`,
      { type: 'refund', reason: 'request_failure', requestId },
      refundKey,
    );

    logger.error({ error, provider, model: chatRequest.model }, 'LLM request failed');

    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Request failed',
          type: 'server_error',
        },
      },
      { status: 500 },
    );
  }

  // Calculate actual cost and reconcile
  const actualCostCents = LLMCostCalculator.calculateCost(provider, llmResponse.model, {
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
  });

  const costDifference = actualCostCents - estimatedCostCents;

  if (costDifference !== 0) {
    // Use idempotency key for reconciliation to prevent duplicate adjustments
    const reconciliationKey = CreditService.generateIdempotencyKey(
      user.id,
      'reconciliation',
      requestId,
    );
    await CreditService.deductCredits(
      user.id,
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

  // Cache analytics
  const cacheMetrics = calculateCacheSavings(
    llmResponse,
    LLMCostCalculator.getInputCostPerMtok(provider, llmResponse.model),
  );

  if (llmResponse.cacheCreationInputTokens || llmResponse.cachedInputTokens) {
    logCacheAnalytics(user.id, llmResponse.model, provider, llmResponse, cacheMetrics);
  }

  // Return OpenAI-compatible response
  const responseId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return NextResponse.json(
    {
      id: responseId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: llmResponse.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: llmResponse.content,
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
      // Extended AGI Workforce fields
      x_agi_workforce: {
        provider,
        cost_cents: actualCostCents,
        ...(usedFallback && {
          fallback: {
            original_model: originalModel,
            reason: fallbackReason,
          },
        }),
        cache: {
          tokens_saved: cacheMetrics.tokensSavedByCache,
          cost_saved_cents: cacheMetrics.savedCostCents,
        },
      },
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

export const POST = withErrorHandler(handleChatCompletions);
export const OPTIONS = handleChatCompletions;
