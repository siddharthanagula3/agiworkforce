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
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';

const TTFT_SLO_TARGET_MS = Number(process.env.LLM_TTFT_SLO_TARGET_MS ?? 2500);
const TTFT_SLO_BREACH_MS = Number(process.env.LLM_TTFT_SLO_BREACH_MS ?? 5000);

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
  logit_bias: z
    .record(
      z.string().regex(/^\d+$/, 'logit_bias keys must be token IDs (numeric strings)'),
      z.number(),
    )
    .optional(),
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
  thinking: z
    .object({
      type: z.string(),
      budget_tokens: z.number().int().positive().optional(),
    })
    .optional(),
  effort: z.string().optional(),
  use_prompt_cache: z.boolean().optional(),
});

// Model tier requirements
const MODEL_TIER_REQUIREMENTS: Record<string, ('pro' | 'max' | 'enterprise')[]> = {
  'claude-opus-4.5': ['max', 'enterprise'],
  'claude-opus-4.5-20251101': ['max', 'enterprise'],
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

// Auto model tier mappings - translate tier-based model selections to actual models
const AUTO_MODEL_MAPPINGS: Record<string, string> = {
  'auto-economy': 'gpt-4o-mini', // Fast, cost-effective
  'auto-balanced': 'gpt-4o', // Good balance of speed and quality
  'auto-premium': 'claude-sonnet-4-20250514', // Best quality
};

/**
 * Resolve auto model names to actual LLM model names
 * Handles 'auto-economy', 'auto-balanced', 'auto-premium' mappings
 */
function resolveAutoModel(model: string): string {
  const modelLower = model.toLowerCase();
  return AUTO_MODEL_MAPPINGS[modelLower] || model;
}

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
    { model: 'claude-haiku-4.5', provider: 'anthropic' },
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
  _balance?: CreditBalance | null,
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
  // Handle CORS preflight with proper origin validation
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
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
  const MAX_BODY_BYTES = 2_000_000; // 2 MB

  // SECURITY: Early rejection based on Content-Length header to avoid buffering
  // obviously oversized payloads. This prevents most abuse without reading the body.
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: {
          message: `Request body too large (Content-Length: ${contentLength} bytes). Maximum is ${MAX_BODY_BYTES} bytes.`,
          type: 'invalid_request_error',
          code: 'payload_too_large',
        },
      },
      { status: 413 },
    );
  }

  // SECURITY: Also enforce actual body size limit after reading — Content-Length can be
  // absent, spoofed, or omitted with chunked transfer encoding.
  let body: unknown;
  try {
    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        {
          error: {
            message: `Request body too large (${rawBody.byteLength} bytes). Maximum is ${MAX_BODY_BYTES} bytes.`,
            type: 'invalid_request_error',
            code: 'payload_too_large',
          },
        },
        { status: 413 },
      );
    }
    body = JSON.parse(new TextDecoder().decode(rawBody));
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

  // Resolve auto model names (auto-economy, auto-balanced, auto-premium) to actual models
  const requestedModel = chatRequest.model;
  chatRequest.model = resolveAutoModel(chatRequest.model);

  // Log if auto model was resolved
  if (requestedModel !== chatRequest.model) {
    logger.info(
      { userId: user.id, requestedModel, resolvedModel: chatRequest.model },
      'Auto model resolved to actual model',
    );
  }

  // Check model access
  if (!checkModelTierAccess(chatRequest.model, subscription.plan_tier)) {
    const modelKey = chatRequest.model.toLowerCase();
    const requiredTiers = MODEL_TIER_REQUIREMENTS[modelKey];
    // Safely get the first required tier, defaulting to 'PRO' if not found
    const requiredTier =
      requiredTiers && requiredTiers.length > 0 ? requiredTiers[0].toUpperCase() : 'PRO';
    return NextResponse.json(
      {
        error: {
          message: `Model ${chatRequest.model} requires ${requiredTier} subscription or higher.`,
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

  // Ensure credits are allocated for the user's subscription period
  // This handles cases where subscription was created but credits weren't allocated
  let existingBalance = await CreditService.getBalance(user.id);

  logger.debug(
    {
      userId: user.id,
      hasBalance: !!existingBalance,
      accountId: existingBalance?.account_id,
      remaining: existingBalance?.credits_remaining_cents,
      planTier: subscription.plan_tier,
    },
    'Credit balance check',
  );

  if (!existingBalance || !existingBalance.account_id) {
    logger.info(
      { userId: user.id, subscriptionId: subscription.id, planTier: subscription.plan_tier },
      'No credit account found, allocating credits for subscription period',
    );

    try {
      const accountId = await SubscriptionService.allocateCreditsForPeriod(
        user.id,
        subscription.id,
        subscription.plan_tier,
        subscription.current_period_start,
        subscription.current_period_end,
      );

      if (accountId) {
        logger.info({ userId: user.id, accountId }, 'Credits allocated successfully');
        // Re-fetch balance after allocation
        existingBalance = await CreditService.getBalance(user.id);
        logger.debug(
          {
            userId: user.id,
            newBalance: existingBalance?.credits_remaining_cents,
            accountId: existingBalance?.account_id,
          },
          'Balance after allocation',
        );
      } else {
        logger.warn(
          { userId: user.id, planTier: subscription.plan_tier },
          'Credit allocation returned no account ID - plan may not include credits',
        );
      }
    } catch (allocError) {
      logger.error(
        { error: allocError, userId: user.id, planTier: subscription.plan_tier },
        'Failed to allocate credits - continuing with credit check',
      );
    }
  }

  // Check credits with detailed logging
  const hasCredits = await CreditService.checkAvailable(user.id, estimatedCostCents);

  logger.debug(
    {
      userId: user.id,
      estimatedCostCents,
      hasCredits,
      balanceRemaining: existingBalance?.credits_remaining_cents,
      dailyRemaining: existingBalance?.daily_remaining_cents,
    },
    'Credit availability check result',
  );

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
    thinking: chatRequest.thinking,
    effort: chatRequest.effort,
    usePromptCache: chatRequest.use_prompt_cache,
  };

  // Handle streaming
  if (chatRequest.stream) {
    try {
      const stream = await LLMProviderFactory.streamRequest(provider, llmRequest);

      const userId = user.id;
      const modelUsed = chatRequest.model;
      const providerUsed = provider;
      // Use the user-requested model name for responses, not the internal API model
      // e.g., user requests "gpt-5-nano" -> internally uses "gpt-4o-mini" -> return "gpt-5-nano"
      const responseModelName = usedFallback ? chatRequest.model : requestedModel;

      let inputTokens = 0;
      let outputTokens = 0;
      let buffer = '';
      const encoder = new TextEncoder();
      const streamStartedAt = Date.now();
      let firstTokenTimestampMs: number | null = null;

      // Track active block types to handle closing tags relative to block index
      const activeBlockTypes = new Map<number, string>();

      // Single transform that handles both model name replacement and credit tracking
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const text = new TextDecoder().decode(chunk);
          buffer += text;

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          // Process complete lines and replace model names in SSE events
          const processedLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') {
                processedLines.push(line);
                continue;
              }

              try {
                const event = JSON.parse(jsonStr);

                // Transform Anthropic SSE format to OpenAI format for desktop compatibility
                let transformedEvent = event;
                if (providerUsed === 'anthropic') {
                  // Desktop expects OpenAI SSE format: data: {"choices":[{"delta":{"content":"text"}}]}
                  // Anthropic sends: event: content_block_delta, data: {"type":"content_block_delta","delta":{"text":"text"}}

                  if (event.type === 'content_block_delta' && event.delta?.text) {
                    // Transform text delta to OpenAI format
                    transformedEvent = {
                      choices: [
                        {
                          delta: {
                            content: event.delta.text,
                          },
                          index: event.index || 0,
                        },
                      ],
                      model: responseModelName,
                    };
                  } else if (
                    event.type === 'content_block_delta' &&
                    event.delta?.type === 'input_json_delta'
                  ) {
                    // Transform tool call delta to OpenAI format
                    // Anthropic sends: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"..."}}
                    transformedEvent = {
                      choices: [
                        {
                          delta: {
                            tool_calls: [
                              {
                                index: event.index || 0,
                                function: {
                                  arguments: event.delta.partial_json || '',
                                },
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
                    // Track this block type
                    if (event.index !== undefined) {
                      activeBlockTypes.set(event.index, 'tool_use');
                    }

                    // Transform tool call start to OpenAI format
                    // Anthropic sends: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_...","name":"tool_name"}}
                    transformedEvent = {
                      choices: [
                        {
                          delta: {
                            tool_calls: [
                              {
                                index: event.index || 0,
                                id: event.content_block.id,
                                type: 'function',
                                function: {
                                  name: event.content_block.name,
                                  arguments: '',
                                },
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
                    event.content_block?.type === 'thinking'
                  ) {
                    // Track this block type
                    if (event.index !== undefined) {
                      activeBlockTypes.set(event.index, 'thinking');
                    }

                    // Transform thinking start to <thinking> tag for frontend parsing
                    transformedEvent = {
                      choices: [
                        {
                          delta: {
                            content: '<thinking>',
                          },
                          index: 0,
                        },
                      ],
                      model: responseModelName,
                    };
                  } else if (
                    event.type === 'content_block_delta' &&
                    event.delta?.type === 'thinking_delta'
                  ) {
                    // Pass thinking content through as standard text content (inside the tags)
                    transformedEvent = {
                      choices: [
                        {
                          delta: {
                            content: event.delta.thinking,
                          },
                          index: 0,
                        },
                      ],
                      model: responseModelName,
                    };
                  } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
                    // Transform message_delta to OpenAI finish event
                    // Normalize Anthropic stop_reason to OpenAI finish_reason
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
                    // Transform message_stop to OpenAI [DONE]
                    processedLines.push('data: [DONE]');
                    continue;
                  } else if (event.type === 'message_start') {
                    // Skip message_start, not needed in OpenAI format
                    continue;
                  } else if (
                    event.type === 'content_block_start' &&
                    event.content_block?.type === 'text'
                  ) {
                    // Track this block type
                    if (event.index !== undefined) {
                      activeBlockTypes.set(event.index, 'text');
                    }
                    // Skip text block start, not needed in OpenAI format
                    continue;
                  } else if (event.type === 'content_block_stop') {
                    // Check if we need to close a thinking block
                    const blockType = activeBlockTypes.get(event.index || 0);
                    if (blockType === 'thinking') {
                      transformedEvent = {
                        choices: [
                          {
                            delta: {
                              content: '</thinking>',
                            },
                            index: 0,
                          },
                        ],
                        model: responseModelName,
                      };
                    } else {
                      // Skip other block stop events
                      continue;
                    }
                  }
                }

                // Replace the internal API model name with the user-requested model name
                if (transformedEvent.model) {
                  transformedEvent.model = responseModelName;
                }

                // Track usage metrics for credit reconciliation
                // Use Math.max to accumulate tokens properly (handles race conditions)
                if (event.type === 'message_delta' && event.usage) {
                  outputTokens = Math.max(outputTokens, event.usage.output_tokens || 0);
                }
                if (event.type === 'message_start' && event.message?.usage) {
                  inputTokens = Math.max(inputTokens, event.message.usage.input_tokens || 0);
                }
                if (event.usage) {
                  inputTokens = Math.max(inputTokens, event.usage.prompt_tokens || 0);
                  outputTokens = Math.max(outputTokens, event.usage.completion_tokens || 0);
                }
                if (event.usageMetadata) {
                  inputTokens = Math.max(inputTokens, event.usageMetadata.promptTokenCount || 0);
                  outputTokens = Math.max(
                    outputTokens,
                    event.usageMetadata.candidatesTokenCount || 0,
                  );
                }

                // Re-serialize with the corrected model name
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
                // AUDIT-P3-008-014: Log JSON parsing errors at debug level for monitoring
                logger.debug(
                  { jsonStr: jsonStr.substring(0, 100), error: parseError },
                  'Stream JSON parse error - passing through unchanged',
                );
                // If parse fails, pass through unchanged
                processedLines.push(line);
              }
            } else if (line.trim()) {
              // Non-data lines (e.g., event:) pass through only if non-empty
              processedLines.push(line);
            }
            // Empty lines are silently dropped to prevent SSE format corruption
          }

          // Enqueue the processed lines with proper SSE formatting
          if (processedLines.length > 0) {
            // SSE format: event: and data: lines separated by \n, events separated by \n\n
            // Join lines with single \n (keeps event: and data: together), add \n\n at end
            controller.enqueue(encoder.encode(processedLines.join('\n') + '\n\n'));
          }
        },
        async flush(controller) {
          // Handle any remaining buffer content
          if (buffer.trim()) {
            controller.enqueue(encoder.encode(buffer));
          }

          // Credit reconciliation at end of stream with error handling
          // CRITICAL: Errors here cannot return error responses (stream already started)
          // Log errors but don't crash the stream
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
          } catch (reconciliationError) {
            // Stream already sent to client - can't return error response
            // Log for monitoring and manual reconciliation
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
            // Stream continues - user already received response
          }
        },
      });

      const reconciledStream = stream.pipeThrough(transformStream);

      return new NextResponse(reconciledStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
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

      // Enhanced error logging for debugging model-specific issues
      logger.error(
        {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          provider,
          model: chatRequest.model,
          originalModel: requestedModel,
          userId: user.id,
          requestId,
        },
        'Streaming request failed',
      );

      // Determine appropriate status code based on error type
      const errorMessage = error instanceof Error ? error.message : 'Streaming request failed';
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
        {
          error: {
            message: errorMessage,
            type: errorType,
          },
        },
        { status: statusCode },
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

    // Enhanced error logging for debugging model-specific issues
    logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        provider,
        model: chatRequest.model,
        originalModel: requestedModel,
        userId: user.id,
        requestId,
      },
      'LLM request failed',
    );

    // Determine appropriate status code based on error type
    const errorMessage = error instanceof Error ? error.message : 'Request failed';
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
      {
        error: {
          message: errorMessage,
          type: errorType,
        },
      },
      { status: statusCode },
    );
  }

  // Calculate actual cost and reconcile
  const actualCostCents = LLMCostCalculator.calculateCost(provider, llmResponse.model, {
    promptTokens: llmResponse.promptTokens,
    completionTokens: llmResponse.completionTokens,
    totalTokens: llmResponse.totalTokens,
  });

  const costDifference = actualCostCents - estimatedCostCents;

  // Wrap post-provider operations in try-catch to prevent 500 errors after successful generation
  try {
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
  } catch (reconciliationError) {
    // Provider succeeded - don't fail the request due to credit reconciliation issues
    // Log for monitoring and manual adjustment
    logger.error(
      {
        error: reconciliationError,
        userId: user.id,
        requestId,
        provider,
        model: llmResponse.model,
        estimatedCostCents,
        actualCostCents,
        costDifference,
      },
      'Credit reconciliation failed after successful LLM response - may require manual adjustment',
    );
    // Continue to return the successful LLM response
  }

  // Cache analytics - wrap in try-catch to prevent logging failures from failing the request
  // Default cache metrics in case calculation fails
  let cacheMetrics = { tokensSavedByCache: 0, savedCostCents: 0, cacheWriteCostCents: 0 };
  try {
    cacheMetrics = calculateCacheSavings(
      llmResponse,
      LLMCostCalculator.getInputCostPerMtok(provider, llmResponse.model),
    );

    if (llmResponse.cacheCreationInputTokens || llmResponse.cachedInputTokens) {
      logCacheAnalytics(user.id, llmResponse.model, provider, llmResponse, cacheMetrics);
    }
  } catch (analyticsError) {
    // Non-critical - just log and continue
    logger.warn(
      { error: analyticsError, userId: user.id, requestId },
      'Cache analytics logging failed',
    );
  }

  // Return OpenAI-compatible response
  const responseId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Return the user-requested model name, not the internal API model name
  // e.g., user requests "gpt-5-nano" -> internally uses "gpt-4o-mini" -> return "gpt-5-nano"
  const responseModel = usedFallback ? chatRequest.model : requestedModel;

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
            tool_calls: llmResponse.tool_calls, // ✅ Include tool calls if present
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
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    },
  );
}

export const POST = withErrorHandler(handleChatCompletions);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
