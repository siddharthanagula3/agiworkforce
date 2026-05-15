import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { MODEL_TIER_REQUIREMENTS, canAccessModel } from '@/lib/model-tiers';
import { validateEgressUrl, validateUserImageUrl, EgressPolicyError } from '@/lib/egress-policy';
import {
  getEconomyFallbackModels,
  getSlotForModel,
  normalizeModelId,
  resolveAutoModeModel,
} from '@agiworkforce/types';
import type { RoutingSlot } from '@agiworkforce/types';
import {
  applyConversationContext,
  classifyTaskLocally,
  detectIndicScript,
  estimateTokens,
} from '@agiworkforce/routing';
import type { RoutingTaskType } from '@agiworkforce/routing';
import { assertQuota, reconcileUsage } from '@/lib/assert-quota';
import type { QuotaFeature, QuotaOutcome } from '@/lib/assert-quota';
import type { AuthGateSuccess } from './auth-gate';

// OpenAI-compatible request schema
export const ChatCompletionRequestSchema = z.object({
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
  // SECURITY: cap output token requests — 64 000 is generous for current frontier models.
  max_tokens: z.number().int().positive().max(64000).optional(),
  max_completion_tokens: z.number().int().positive().max(64000).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  logit_bias: z
    .record(
      z.string().regex(/^\d+$/, 'logit_bias keys must be token IDs (numeric strings)'),
      z.number().min(-100).max(100),
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
  web_search: z.boolean().optional(),
  web_fetch: z.boolean().optional(),
  code_execution: z.boolean().optional(),
  thinking_mode: z.boolean().optional(),
  thinking: z
    .object({
      type: z.string(),
      // SECURITY: Anthropic's documented max for extended thinking is 32 000.
      budget_tokens: z.number().int().positive().max(32000).optional(),
    })
    .optional(),
  effort: z.string().optional(),
  use_prompt_cache: z.boolean().optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export type ProcessedRequest = {
  requestId: string;
  chatRequest: ChatCompletionRequest;
  requestedModel: string;
  provider: string;
  estimatedCostCents: number;
  estimatedPromptTokens: number;
  maxTokens: number;
  usedFallback: boolean;
  fallbackReason: string | undefined;
  originalModel: string;
  resolvedTaskType: RoutingTaskType;
  classifierConfidence: number;
  resolvedSlot: RoutingSlot | null;
  quotaFeature: QuotaFeature;
  quotaWarningHeader: string | null;
  isFlagshipRequest: boolean;
  indicResult: ReturnType<typeof detectIndicScript>;
  llmRequest: {
    model: string;
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      multimodal_content?: unknown[];
      tool_calls?: unknown[];
      tool_call_id?: string;
    }>;
    temperature?: number;
    max_tokens: number;
    stream?: boolean;
    tools?: unknown[];
    tool_choice?: unknown;
    thinking_mode?: boolean;
    thinking?: { type: string; budget_tokens?: number };
    effort?: string;
    usePromptCache?: boolean;
  };
};

type ProcessFailure = { ok: false; response: NextResponse };
type ProcessSuccess = { ok: true } & ProcessedRequest;
export type ProcessResult = ProcessSuccess | ProcessFailure;

export function extractTextContent(
  content: string | Array<{ type: string; text?: string; image_url?: unknown }>,
): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text!)
    .join('\n');
}

function resolveAutoModel(
  model: string,
  subscriptionTier?: string,
  taskType?: RoutingTaskType,
): string {
  return resolveAutoModeModel(model, subscriptionTier, taskType) ?? model;
}

function checkModelTierAccess(model: string, subscriptionTier: string): boolean {
  const allowed = canAccessModel(model, subscriptionTier);
  if (!allowed && subscriptionTier.toLowerCase() !== 'free') {
    logger.warn(
      { model: model.toLowerCase(), tier: subscriptionTier.toLowerCase() },
      'Model access denied - not in economy or tier requirements map',
    );
  }
  return allowed;
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

  const canonicalCurrentModel = normalizeModelId(currentModel) ?? currentModel.toLowerCase();
  const fallbackModels = getEconomyFallbackModels();

  for (const fallback of fallbackModels) {
    if (fallback.model === canonicalCurrentModel || fallback.model === currentModel.toLowerCase()) {
      continue;
    }

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

export function handleCreditError(_deductResult: {
  code?: string;
  daily_remaining?: number;
  daily_limit?: number;
  daily_used?: number;
}): NextResponse {
  return NextResponse.json(
    {
      error: {
        message:
          'Usage budget exhausted for this billing period. Upgrade your plan or add credits.',
        type: 'insufficient_quota',
        code: 'monthly_limit_exceeded',
      },
    },
    { status: 402 },
  );
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_MESSAGE_LENGTH = 100000;
const MAX_TOTAL_LENGTH = 1000000;

export async function processRequest(
  request: NextRequest,
  auth: AuthGateSuccess,
): Promise<ProcessResult> {
  const { user, token, subscription, userClient } = auth;

  const requestId = randomUUID();

  // Body size guard (Content-Length header)
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `Request body too large (Content-Length: ${contentLength} bytes). Maximum is ${MAX_BODY_BYTES} bytes.`,
            type: 'invalid_request_error',
            code: 'payload_too_large',
          },
        },
        { status: 413 },
      ),
    };
  }

  // Body size guard (actual bytes — Content-Length can be absent or spoofed)
  let body: unknown;
  try {
    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > MAX_BODY_BYTES) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: `Request body too large (${rawBody.byteLength} bytes). Maximum is ${MAX_BODY_BYTES} bytes.`,
              type: 'invalid_request_error',
              code: 'payload_too_large',
            },
          },
          { status: 413 },
        ),
      };
    }
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'Invalid JSON in request body',
            type: 'invalid_request_error',
          },
        },
        { status: 400 },
      ),
    };
  }

  const validationResult = ChatCompletionRequestSchema.safeParse(body);
  if (!validationResult.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: validationResult.error.message,
            type: 'invalid_request_error',
            param: validationResult.error.issues[0]?.path.join('.'),
          },
        },
        { status: 400 },
      ),
    };
  }

  const chatRequest = validationResult.data;

  // WEB-MULTIMODAL-IMAGE-SSRF: validate every user-supplied image_url before forwarding.
  for (let mi = 0; mi < chatRequest.messages.length; mi++) {
    const msg = chatRequest.messages[mi]!;
    if (!Array.isArray(msg.content)) continue;
    for (let pi = 0; pi < msg.content.length; pi++) {
      const part = msg.content[pi]!;
      if (part.type !== 'image_url') continue;
      const imageUrl = part.image_url?.url;
      if (typeof imageUrl !== 'string') continue;
      try {
        validateUserImageUrl(imageUrl);
      } catch (err) {
        if (err instanceof EgressPolicyError) {
          logger.warn(
            { userId: user.id, messageIndex: mi, partIndex: pi },
            'Blocked user-supplied image URL (egress policy)',
          );
          return {
            ok: false,
            response: NextResponse.json(
              {
                error: {
                  message:
                    'Image URL not permitted: must be https with a non-internal hostname, or a data: URL',
                  type: 'invalid_request_error',
                  code: 'image_url_blocked',
                  param: `messages.${mi}.content.${pi}.image_url.url`,
                },
              },
              { status: 400 },
            ),
          };
        }
        throw err;
      }
    }
  }

  // Task-aware classifier (synchronous — no DB/network)
  const lastUserMsg = chatRequest.messages
    .slice()
    .reverse()
    .find((m) => m.role === 'user');
  const lastUserText = lastUserMsg ? extractTextContent(lastUserMsg.content) : '';

  const routingHistory = chatRequest.messages
    .filter(
      (
        m,
      ): m is (typeof chatRequest.messages)[number] & {
        role: 'user' | 'assistant' | 'system' | 'tool';
      } => ['user', 'assistant', 'system', 'tool'].includes(m.role),
    )
    .map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: extractTextContent(m.content),
    }));

  let classifierResult = classifyTaskLocally(lastUserText, routingHistory);

  if (routingHistory.length > 1) {
    const cumulativeTokens = routingHistory.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      estimateTokens(lastUserText),
    );
    const recentTaskTypes = routingHistory
      .filter((m) => m.role === 'user')
      .map(() => classifierResult.type);
    classifierResult = applyConversationContext(classifierResult, {
      cumulativeTokens,
      recentTaskTypes,
    });
  }

  const resolvedTaskType: RoutingTaskType = classifierResult.type;

  const indicResult = detectIndicScript(lastUserText);
  if (indicResult.isIndic && indicResult.dominantScript) {
    logger.info(
      {
        userId: user.id,
        requestId,
        indicRatio: indicResult.indicRatio,
        dominantScript: indicResult.dominantScript,
      },
      '[indic-detect] non-Latin Indic script detected — Pool C candidate',
    );
  }

  // Resolve auto model names to actual models (task-aware, tier-aware)
  const requestedModel = chatRequest.model;
  chatRequest.model = resolveAutoModel(chatRequest.model, subscription.plan_tier, resolvedTaskType);

  if (requestedModel !== chatRequest.model) {
    logger.info(
      {
        userId: user.id,
        requestedModel,
        resolvedModel: chatRequest.model,
        taskType: resolvedTaskType,
        taskConfidence: classifierResult.confidence,
        tier: subscription.plan_tier,
      },
      'Auto model resolved to actual model',
    );
  }

  // Model tier access check
  if (!checkModelTierAccess(chatRequest.model, subscription.plan_tier)) {
    const modelKey = chatRequest.model.toLowerCase();
    const requiredTiers = MODEL_TIER_REQUIREMENTS[modelKey];
    const requiredTier =
      requiredTiers && requiredTiers.length > 0
        ? (requiredTiers[0]?.toUpperCase() ?? 'PRO')
        : 'PRO';
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `Model ${chatRequest.model} requires ${requiredTier} subscription or higher.`,
            type: 'invalid_request_error',
            code: 'model_not_available',
          },
        },
        { status: 403 },
      ),
    };
  }

  const originalModel = chatRequest.model;
  let usedFallback = false;
  let fallbackReason: string | undefined;

  let provider = LLMProviderFactory.getProviderFromModel(chatRequest.model);

  // Tier-aware quota gate
  const resolvedSlot: RoutingSlot | null = getSlotForModel(chatRequest.model);
  const isFlagshipRequest =
    resolvedSlot === 'flagship_coding_pro_plus' || resolvedSlot === 'flagship_general_pro_plus';

  const quotaEstimateTokens = chatRequest.messages.reduce((sum, msg) => {
    return sum + estimateTokens(extractTextContent(msg.content));
  }, 0);

  let quotaFeature: QuotaFeature = 'chat';
  if (resolvedSlot === 'image_generation') {
    quotaFeature = 'image';
  } else if (resolvedSlot === 'video_generation' || resolvedSlot === 'video_generation_pro_plus') {
    quotaFeature = 'video';
  } else if (resolvedSlot === 'computer_use' || resolvedSlot === 'computer_use_premium') {
    quotaFeature = 'computer_use';
  }

  let quotaOutcome: QuotaOutcome = { kind: 'ok' };
  let quotaWarningHeader: string | null = null;
  try {
    quotaOutcome = await assertQuota({
      userId: user.id,
      token,
      tier: subscription.plan_tier,
      requestedTokens: quotaEstimateTokens,
      feature: quotaFeature,
      slot: resolvedSlot ?? undefined,
    });
  } catch (gateError) {
    // Fail-open: gate error falls back to legacy CreditService flow
    logger.warn(
      { userId: user.id, error: gateError instanceof Error ? gateError.message : gateError },
      '[assertQuota] gate errored, falling back to credit-only flow',
    );
  }

  if (quotaOutcome.kind === 'paywall') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: quotaOutcome.reason,
            type: 'paywall',
            code: 'tier_quota_exceeded',
            paywall: {
              feature: quotaOutcome.feature,
              requiredTier: quotaOutcome.requiredTier,
              reason: quotaOutcome.reason,
            },
          },
        },
        { status: 429 },
      ),
    };
  }

  if (quotaOutcome.kind === 'downgrade') {
    logger.info(
      {
        userId: user.id,
        from: chatRequest.model,
        to: quotaOutcome.modelOverride,
        reason: quotaOutcome.reason,
      },
      '[assertQuota] downgrade applied',
    );
    chatRequest.model = quotaOutcome.modelOverride;
    provider = LLMProviderFactory.getProviderFromModel(chatRequest.model);
    usedFallback = true;
    fallbackReason = quotaOutcome.reason;
  } else if (quotaOutcome.kind === 'warn') {
    quotaWarningHeader = quotaOutcome.warning;
  }

  // Egress policy: validate custom provider base URLs
  const providerBaseUrlEnvMap: Record<string, string> = {
    openai: 'OPENAI_BASE_URL',
    qwen: 'QWEN_BASE_URL',
    deepseek: 'DEEPSEEK_BASE_URL',
    moonshot: 'MOONSHOT_BASE_URL',
  };
  const baseUrlEnvKey = providerBaseUrlEnvMap[provider.toLowerCase()];
  const customBaseUrl = baseUrlEnvKey ? process.env[baseUrlEnvKey] : undefined;

  if (customBaseUrl) {
    try {
      validateEgressUrl(customBaseUrl);
    } catch (err) {
      if (err instanceof EgressPolicyError) {
        logger.warn(
          { provider, customBaseUrl, model: chatRequest.model },
          'Egress policy blocked custom provider base URL',
        );
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: {
                message: 'Provider endpoint not in approved egress allowlist',
                type: 'invalid_request_error',
                code: 'egress_blocked',
              },
            },
            { status: 403 },
          ),
        };
      }
    }
  }

  // Message length validation
  let totalLength = 0;
  for (const msg of chatRequest.messages) {
    const textContent = extractTextContent(msg.content);
    if (textContent.length > MAX_MESSAGE_LENGTH) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
              type: 'invalid_request_error',
            },
          },
          { status: 400 },
        ),
      };
    }
    totalLength += textContent.length;
  }

  if (totalLength > MAX_TOTAL_LENGTH) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `Total message content exceeds maximum length of ${MAX_TOTAL_LENGTH} characters`,
            type: 'invalid_request_error',
          },
        },
        { status: 400 },
      ),
    };
  }

  // Token + cost estimation
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

  // Credit allocation + availability check
  let existingBalance = await CreditService.getBalance(userClient, user.id);

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
        { stripePriceId: subscription.stripe_price_id },
      );

      if (accountId) {
        logger.info({ userId: user.id, accountId }, 'Credits allocated successfully');
        existingBalance = await CreditService.getBalance(userClient, user.id);
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

  const hasCredits = await CreditService.checkAvailable(userClient, user.id, estimatedCostCents);

  logger.debug(
    {
      userId: user.id,
      estimatedCostCents,
      hasCredits,
      balanceRemaining: existingBalance?.credits_remaining_cents,
    },
    'Credit availability check result',
  );

  if (!hasCredits) {
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

      const hasFallbackCredits = await CreditService.checkAvailable(
        userClient,
        user.id,
        fallbackCostCents,
      );

      if (hasFallbackCredits) {
        usedFallback = true;
        fallbackReason = `Insufficient credits for ${originalModel}, switched to ${fallbackModel.model}`;
        chatRequest.model = fallbackModel.model;
        provider = fallbackProvider;
        estimatedCostCents = fallbackCostCents;
      } else {
        return { ok: false, response: handleCreditError({ code: 'MONTHLY_CREDIT_LIMIT_REACHED' }) };
      }
    } else {
      return { ok: false, response: handleCreditError({ code: 'MONTHLY_CREDIT_LIMIT_REACHED' }) };
    }
  }

  // Reserve credits with idempotency key
  const reservationKey = CreditService.generateIdempotencyKey(user.id, 'reservation', requestId);
  const reserveResult = await CreditService.deductCredits(
    userClient,
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
    return { ok: false, response: handleCreditError(reserveResult) };
  }

  // Build internal message format (preserving multimodal parts)
  const internalMessages = chatRequest.messages.map((msg) => ({
    role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
    content: extractTextContent(msg.content),
    multimodal_content: Array.isArray(msg.content) ? (msg.content as unknown[]) : undefined,
    tool_calls: msg.tool_calls as unknown[] | undefined,
    tool_call_id: msg.tool_call_id,
  }));

  // Inject provider-specific built-in tools
  let resolvedTools = chatRequest.tools;
  const providerLower = provider.toLowerCase();

  if (chatRequest.web_search) {
    if (providerLower === 'anthropic') {
      resolvedTools = [
        ...(resolvedTools ?? []),
        { type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] },
      ];
    } else if (providerLower === 'google') {
      resolvedTools = [...(resolvedTools ?? []), { google_search: {} }];
    } else if (providerLower === 'openai') {
      resolvedTools = [...(resolvedTools ?? []), { type: 'web_search_preview' }];
    }
  }

  if (chatRequest.web_fetch && providerLower === 'anthropic') {
    resolvedTools = [
      ...(resolvedTools ?? []),
      { type: 'web_fetch_20260209', name: 'web_fetch', allowed_callers: ['direct'] },
    ];
  }

  if (chatRequest.code_execution) {
    if (providerLower === 'anthropic') {
      resolvedTools = [
        ...(resolvedTools ?? []),
        { type: 'code_execution_20260120', name: 'code_execution', allowed_callers: ['direct'] },
      ];
    } else if (providerLower === 'google') {
      resolvedTools = [...(resolvedTools ?? []), { code_execution: {} }];
    } else if (providerLower === 'openai') {
      resolvedTools = [...(resolvedTools ?? []), { type: 'code_interpreter' }];
    }
  }

  const thinkingConfig =
    chatRequest.thinking ??
    (chatRequest.thinking_mode ? { type: 'enabled', budget_tokens: 10000 } : undefined);

  const llmRequest = {
    model: chatRequest.model,
    messages: internalMessages,
    temperature: chatRequest.temperature,
    max_tokens: maxTokens,
    stream: chatRequest.stream,
    tools: resolvedTools as unknown[] | undefined,
    tool_choice: chatRequest.tool_choice,
    thinking_mode: chatRequest.thinking_mode,
    thinking: thinkingConfig,
    effort: chatRequest.effort,
    usePromptCache: chatRequest.use_prompt_cache,
  };

  return {
    ok: true,
    requestId,
    chatRequest,
    requestedModel,
    provider,
    estimatedCostCents,
    estimatedPromptTokens,
    maxTokens,
    usedFallback,
    fallbackReason,
    originalModel,
    resolvedTaskType,
    classifierConfidence: classifierResult.confidence,
    resolvedSlot,
    quotaFeature,
    quotaWarningHeader,
    isFlagshipRequest,
    indicResult,
    llmRequest,
  };
}

export { reconcileUsage };
