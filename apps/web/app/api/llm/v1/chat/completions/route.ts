import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getUserClient } from '@/lib/supabase-server';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { calculateCacheSavings, logCacheAnalytics } from '@/lib/prompt-cache-helper';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
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

const TTFT_SLO_TARGET_MS = Number(process.env['LLM_TTFT_SLO_TARGET_MS'] ?? 2500);
const TTFT_SLO_BREACH_MS = Number(process.env['LLM_TTFT_SLO_BREACH_MS'] ?? 5000);

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
  // SECURITY: cap output token requests so a single hobbyist can't run
  // multi-million-token cost bombs against the upstream provider. 64 000 is
  // generous for current frontier models (Opus 4.7 / GPT-5.4 max output) and
  // tier-aware ceilings are enforced separately in `resolveAutoModel`.
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
  // Extended parameters for AGI Workforce
  web_search: z.boolean().optional(),
  web_fetch: z.boolean().optional(),
  code_execution: z.boolean().optional(),
  thinking_mode: z.boolean().optional(),
  thinking: z
    .object({
      type: z.string(),
      // SECURITY: same cost-bomb concern as max_tokens. Anthropic's
      // documented max for extended thinking is 32 000.
      budget_tokens: z.number().int().positive().max(32000).optional(),
    })
    .optional(),
  effort: z.string().optional(),
  use_prompt_cache: z.boolean().optional(),
});

/**
 * Resolve auto model names to actual LLM model names.
 * Handles 'auto-economy', 'auto-balanced', 'auto-premium' mappings.
 * Tier-aware AND task-aware: Pro/Max users get *_pro slot routing
 * (e.g. coding -> coding_premium_pro -> claude-sonnet-4.6).
 *
 * The taskType comes from the heuristic classifier (packages/routing
 * classifyTaskLocally + applyConversationContext) earlier in the route handler.
 * resolveAutoModeModel from @agiworkforce/types now accepts the 3rd arg
 * directly; callers who pass undefined fall back to the legacy auto-mode path.
 */
function resolveAutoModel(
  model: string,
  subscriptionTier?: string,
  taskType?: RoutingTaskType,
): string {
  return resolveAutoModeModel(model, subscriptionTier, taskType) ?? model;
}

/**
 * Check if a subscription tier allows access to a model.
 * Delegates to the shared canAccessModel() from lib/model-tiers.ts.
 */
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

function handleCreditError(_deductResult: {
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

  // CSRF protection
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

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

  // Verify user with Supabase using service role for server-side JWT verification ONLY.
  // SECURITY (WEB-RLS-BYPASS mitigation per docs/plans/UNIFIED_LAUNCH_PLAN.md §1):
  // The service-role client below MUST NOT be reused for downstream DB reads — it
  // bypasses RLS. All downstream DB access goes through dedicated services
  // (SubscriptionService, CreditService, etc.) that scope queries by userId.
  // Linting: this `supabaseAdmin` reference must not appear after line ~`auth.getUser` below.
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

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

  // RLS-bound client for all downstream DB ops on behalf of this user.
  const userClient = getUserClient(token);

  // Generate unique request ID for idempotency (prevents duplicate charges on retry)
  const requestId = randomUUID();

  // Get subscription
  const subscription = await SubscriptionService.getSubscription(userClient, user.id);

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

  // SECURITY: Also enforce actual body size limit after reading - Content-Length can be
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

  // WEB-MULTIMODAL-IMAGE-SSRF (red-team finding 2026-05): validate every
  // user-supplied `image_url` BEFORE forwarding to upstream providers.
  // Anthropic / OpenAI / Google fetch these URLs server-side and surface
  // the response in the model output — so a request with
  //     image_url: { url: "http://169.254.169.254/latest/meta-data/" }
  // would have provider infrastructure fetch IMDS on the attacker's behalf.
  // We refuse non-https, internal IPs (any encoding), userinfo-bearing,
  // and obvious internal-service-port URLs. `data:` URLs pass through.
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
          return NextResponse.json(
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
          );
        }
        throw err;
      }
    }
  }

  // ----- Task-aware classifier (sync - Vercel async-cheap-condition-before-await) -----
  // Run the heuristic classifier NOW, before any downstream await, so we never
  // pay async overhead for a pure-CPU operation. classifyTaskLocally is
  // synchronous and reads only frozen module-scope state (no DB, no network).
  //
  // Classifier input: the last user message in the conversation (most recent
  // turn is the highest-signal input for routing). History is passed for
  // token estimation and the 5-turn sticky-pivot conversation context.
  const lastUserMsg = chatRequest.messages
    .slice()
    .reverse()
    .find((m) => m.role === 'user');
  const lastUserText = lastUserMsg ? extractTextContent(lastUserMsg.content) : '';

  // Build RoutingMessage history for token estimation and sticky-pivot context.
  // js-early-exit: only build history when there is more than one message.
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

  // Run the local heuristic classifier. The result includes `type` and `confidence`.
  let classifierResult = classifyTaskLocally(lastUserText, routingHistory);

  // Apply conversation context (sticky-pivot + long-context guard) only when
  // the conversation has prior turns worth inspecting.
  if (routingHistory.length > 1) {
    const cumulativeTokens = routingHistory.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      estimateTokens(lastUserText),
    );
    // Prior turns have no saved taskType in this path; pass current type as
    // placeholder so sticky-pivot boost fires for consistent conversations.
    const recentTaskTypes = routingHistory
      .filter((m) => m.role === 'user')
      .map(() => classifierResult.type);
    classifierResult = applyConversationContext(classifierResult, {
      cumulativeTokens,
      recentTaskTypes,
    });
  }

  const resolvedTaskType: RoutingTaskType = classifierResult.type;

  // Indic script detection (Pool C overlay gate). Sarvam-M integration is
  // pending an API key (spec §13 cross-phase India launch); for now we
  // detect + log so analytics + future routing decisions have the signal.
  // The detection runs on the latest user message only — sticky pivot is
  // handled at the model level once Sarvam-M is wired.
  const indicResult = detectIndicScript(lastUserText);
  if (indicResult.isIndic && indicResult.dominantScript) {
    logger.info(
      {
        userId: user.id,
        requestId,
        indicRatio: indicResult.indicRatio,
        dominantScript: indicResult.dominantScript,
        // model: chatRequest.model — at this point still pre-resolution.
      },
      '[indic-detect] non-Latin Indic script detected — Pool C candidate',
    );
  }
  // ---- end classifier ----

  // Resolve auto model names (auto-economy, auto-balanced, auto-premium) to actual models.
  // Task-aware (Phase 2): Pro/Max/Enterprise tiers route to *_pro slots via
  // resolvedTaskType (e.g. Pro + coding -> coding_premium_pro -> claude-sonnet-4.6).
  // Legacy callers using non-auto model IDs pass through unchanged.
  const requestedModel = chatRequest.model;
  chatRequest.model = resolveAutoModel(chatRequest.model, subscription.plan_tier, resolvedTaskType);

  // Log if auto model was resolved
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

  // Check model access
  if (!checkModelTierAccess(chatRequest.model, subscription.plan_tier)) {
    const modelKey = chatRequest.model.toLowerCase();
    const requiredTiers = MODEL_TIER_REQUIREMENTS[modelKey];
    // Safely get the first required tier, defaulting to 'PRO' if not found
    const requiredTier =
      requiredTiers && requiredTiers.length > 0
        ? (requiredTiers[0]?.toUpperCase() ?? 'PRO')
        : 'PRO';
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

  // ── Tier-aware quota gate ─────────────────────────────────────────────
  // assertQuota enforces tier paywalls + Pro+ flagship daily caps + video
  // and computer-use sub-quotas. Runs alongside the legacy CreditService
  // flow below: if assertQuota returns paywall, we short-circuit; if it
  // returns downgrade, we swap chatRequest.model to the equivalent
  // non-flagship slot model and let CreditService re-cost the request.
  // The slot is reverse-derived from the resolved model so flagship_*
  // requests are recognised even when the caller passed an explicit model
  // ID rather than auto-* mode.
  const resolvedSlot: RoutingSlot | null = getSlotForModel(chatRequest.model);
  const isFlagshipRequest =
    resolvedSlot === 'flagship_coding_pro_plus' || resolvedSlot === 'flagship_general_pro_plus';

  // Heuristic: estimate tokens for the quota gate. Re-estimated below for
  // the cost calculator; keeping a single number here for the gate is fine
  // because monthly caps are coarse-grained and daily flagship cap is in
  // tokens (15K), not cents.
  const quotaEstimateTokens = chatRequest.messages.reduce((sum, msg) => {
    return sum + estimateTokens(extractTextContent(msg.content));
  }, 0);

  // Map our internal slot/feature back to QuotaFeature so sub-quota checks
  // (image/video/computer_use) fire when relevant.
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
    // Fail-open: if the gate errors, fall back to the legacy CreditService
    // path so we don't take the route down on a transient DB hiccup.
    logger.warn(
      { userId: user.id, error: gateError instanceof Error ? gateError.message : gateError },
      '[assertQuota] gate errored, falling back to credit-only flow',
    );
  }

  if (quotaOutcome.kind === 'paywall') {
    return NextResponse.json(
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
    );
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
  // ───────────────────────────────────────────────────────────────────────

  // Egress policy: validate custom base URLs from env vars before making external requests.
  // Standard provider URLs (api.openai.com, api.anthropic.com, etc.) are already in the
  // egress allowlist. This catches custom/overridden base URLs that admins may configure.
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
        return NextResponse.json(
          {
            error: {
              message: 'Provider endpoint not in approved egress allowlist',
              type: 'invalid_request_error',
              code: 'egress_blocked',
            },
          },
          { status: 403 },
        );
      }
    }
  }

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
        // Re-fetch balance after allocation
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

  // Check credits with detailed logging
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
    // Try fallback model before returning an error
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
        return handleCreditError({ code: 'MONTHLY_CREDIT_LIMIT_REACHED' });
      }
    } else {
      return handleCreditError({ code: 'MONTHLY_CREDIT_LIMIT_REACHED' });
    }
  }

  // Reserve credits with idempotency key (prevents double-charging on retry)
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
    return handleCreditError(reserveResult);
  }

  // Convert messages to internal format; preserve multimodal parts (images) separately
  const internalMessages = chatRequest.messages.map((msg) => ({
    role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
    content: extractTextContent(msg.content),
    multimodal_content: Array.isArray(msg.content) ? msg.content : undefined,
    tool_calls: msg.tool_calls,
    tool_call_id: msg.tool_call_id,
  }));

  // Inject provider-specific built-in tools when enabled
  let resolvedTools = chatRequest.tools;
  const providerLower = provider.toLowerCase();

  // Web Search - each provider has a native search tool
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

  // Web Fetch - Anthropic's URL content reading tool
  if (chatRequest.web_fetch && providerLower === 'anthropic') {
    resolvedTools = [
      ...(resolvedTools ?? []),
      { type: 'web_fetch_20260209', name: 'web_fetch', allowed_callers: ['direct'] },
    ];
  }

  // Code Execution - sandboxed Python/code execution
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

  // Resolve thinking config: boolean shorthand → Anthropic thinking object
  const thinkingConfig =
    chatRequest.thinking ??
    (chatRequest.thinking_mode ? { type: 'enabled', budget_tokens: 10000 } : undefined);

  const llmRequest = {
    model: chatRequest.model,
    messages: internalMessages,
    temperature: chatRequest.temperature,
    max_tokens: maxTokens,
    stream: chatRequest.stream,
    tools: resolvedTools,
    tool_choice: chatRequest.tool_choice,
    thinking_mode: chatRequest.thinking_mode,
    thinking: thinkingConfig,
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
      // Use the user-requested model name for responses, not the internal canonical API model.
      // This preserves compatibility when older aliases are normalized internally.
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
                    // Skip input_json_delta for server-managed tools (web_search, code_execution)
                    // - the server executes these, so the client doesn't need the tool input
                    const blockType = activeBlockTypes.get(event.index ?? -1);
                    if (blockType === 'server_tool_use') {
                      continue;
                    }
                    // Transform client-executed tool call delta to OpenAI format
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
                    event.content_block?.type === 'server_tool_use'
                  ) {
                    // Anthropic server-managed tool execution (e.g., web_search).
                    // The server executes the tool - no client-side action needed.
                    // Track block type and skip (the search happens server-side).
                    if (event.index !== undefined) {
                      activeBlockTypes.set(event.index, 'server_tool_use');
                    }
                    // Emit a status indicator for any server-managed tool.
                    // Use tool-appropriate status label: web_search → 'searching',
                    // code_execution → 'executing', anything else → 'running'.
                    const toolName: string = event.content_block.name || 'web_search';
                    const toolStatus =
                      toolName === 'code_execution'
                        ? 'executing'
                        : toolName === 'web_search'
                          ? 'searching'
                          : toolName === 'web_fetch'
                            ? 'fetching'
                            : 'running';
                    transformedEvent = {
                      choices: [
                        {
                          delta: {
                            x_tool_status: {
                              type: 'server_tool_use',
                              name: toolName,
                              status: toolStatus,
                            },
                          },
                          index: 0,
                        },
                      ],
                      model: responseModelName,
                    };
                  } else if (
                    event.type === 'content_block_start' &&
                    event.content_block?.type === 'code_execution_tool_result'
                  ) {
                    // Anthropic code execution result - contains stdout, stderr, and
                    // optional image outputs (e.g., matplotlib plots as base64 PNGs).
                    if (event.index !== undefined) {
                      activeBlockTypes.set(event.index, 'code_execution_tool_result');
                    }
                    // Forward the result block as x_code_result for the client to render
                    transformedEvent = {
                      choices: [
                        {
                          delta: {
                            x_code_result: event.content_block,
                          },
                          index: 0,
                        },
                      ],
                      model: responseModelName,
                    };
                  } else if (
                    event.type === 'content_block_start' &&
                    event.content_block?.type === 'web_search_tool_result'
                  ) {
                    // Anthropic web search results block - contains the search results
                    // that the model will use to generate its response with citations.
                    if (event.index !== undefined) {
                      activeBlockTypes.set(event.index, 'web_search_tool_result');
                    }
                    // Forward search results as extended metadata for the client
                    transformedEvent = {
                      choices: [
                        {
                          delta: {
                            x_search_results: event.content_block,
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
                  userClient,
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

          // Tier-quota counter update — fire-and-forget. Mirrors the credit
          // reconciliation but feeds token_credits.flagship_daily_tokens so
          // the next request's assertQuota can enforce the Pro+ daily cap.
          // Recompute here because `totalTokens` is scoped to the try block above.
          const finalTotalTokens = inputTokens + outputTokens;
          if (finalTotalTokens > 0) {
            void reconcileUsage({
              userId,
              token,
              actualTokens: finalTotalTokens,
              feature: quotaFeature,
              isFlagship: isFlagshipRequest,
            }).catch((err) => {
              logger.warn(
                { userId, requestId, error: err instanceof Error ? err.message : err },
                '[reconcileUsage] streaming counter update failed',
              );
            });
          }
        },
      });

      const reconciledStream = stream.pipeThrough(transformStream);

      const streamHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      };
      if (quotaWarningHeader) {
        streamHeaders['X-Quota-Warning'] = quotaWarningHeader;
      }

      return new NextResponse(reconciledStream, {
        headers: streamHeaders,
      });
    } catch (error) {
      // Refund on failure with idempotency key to prevent duplicate refunds
      const refundKey = CreditService.generateIdempotencyKey(user.id, 'refund', requestId);
      await CreditService.deductCredits(
        userClient,
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
      userClient,
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
        userClient,
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

  // Return the user-requested model name, not the internal canonical API model name.
  // This preserves compatibility when older aliases are normalized internally.
  const responseModel = usedFallback ? chatRequest.model : requestedModel;

  // Tier-quota counter update for non-stream path (mirrors stream path).
  if (llmResponse.totalTokens > 0) {
    void reconcileUsage({
      userId: user.id,
      token,
      actualTokens: llmResponse.totalTokens,
      feature: quotaFeature,
      isFlagship: isFlagshipRequest,
    }).catch((err) => {
      logger.warn(
        { userId: user.id, requestId, error: err instanceof Error ? err.message : err },
        '[reconcileUsage] non-stream counter update failed',
      );
    });
  }

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
      // Web search citations and results (from Anthropic server-managed web_search tool)
      ...(llmResponse.citations &&
        llmResponse.citations.length > 0 && { citations: llmResponse.citations }),
      ...(llmResponse.search_results &&
        llmResponse.search_results.length > 0 && { search_results: llmResponse.search_results }),
      // Extended AGI Workforce fields
      x_agi_workforce: {
        provider,
        cost_cents: actualCostCents,
        routing: {
          task_type: resolvedTaskType,
          task_confidence: classifierResult.confidence,
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
      headers: responseHeaders,
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
