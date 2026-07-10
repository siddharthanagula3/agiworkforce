import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { ToolCallResponseSchema } from '@/lib/validations/tool-calls';
import { MAX_MESSAGE_LENGTH, ToolChoiceSchema, ToolDefinitionSchema } from '@/lib/validations/llm';
import { logger } from '@/lib/logger';
import {
  resolveCodeExecutionTools,
  e2bExecutionToolDefs,
  providerRoutesToE2B,
} from '@/lib/e2b/execution-tools';
import { e2bCutoverEnabled } from '@/lib/e2b/gate';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  FREE_TRIAL_MAX_INPUT_CHARS,
  FREE_TRIAL_MAX_INPUT_TOKENS,
  FREE_TRIAL_MAX_OUTPUT_TOKENS,
  FREE_TRIAL_MODEL,
  FREE_TRIAL_PROMPT_LIMIT,
  isFreeTrialRequest,
  isFreePlanTier,
  reserveFreeTrialPrompt,
  type FreeTrialReservation,
} from '@/lib/services/free-trial-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';
import { MODEL_TIER_REQUIREMENTS, canAccessModel } from '@/lib/model-tiers';
import { validateEgressUrl, validateUserImageUrl, EgressPolicyError } from '@/lib/egress-policy';
import {
  ANTHROPIC_THINKING_BUDGET,
  OPENAI_REASONING_EFFORT,
  getEconomyFallbackModels,
  getModelMetadataById,
  getModelReasoning,
  type Effort,
  getSlotForModel,
  normalizeModelId,
  resolveAutoModeModel,
} from '@agiworkforce/types';
import type { RoutingSlot, ThinkingBlock } from '@agiworkforce/types';
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
                // AUDIT-FIX: C-3 · schema-level SSRF gate (defense-in-depth, runtime check still at line ~321).
                url: z.string().superRefine((value, ctx) => {
                  try {
                    validateUserImageUrl(value);
                  } catch (err) {
                    ctx.addIssue({
                      code: z.ZodIssueCode.custom,
                      message:
                        err instanceof EgressPolicyError
                          ? 'image_url blocked by egress policy'
                          : 'invalid image_url',
                    });
                  }
                }),
                detail: z.enum(['auto', 'low', 'high']).optional(),
              })
              .optional(),
          }),
        ),
      ]),
      name: z.string().optional(),
      // WEB-21 (audit 2026-05-19): strict tool_calls schema replaces z.unknown.
      tool_calls: z.array(ToolCallResponseSchema).max(32).optional(),
      tool_call_id: z.string().max(256).optional(),
    }),
  ),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  // SECURITY: cap output token requests · 64 000 is generous for current frontier models.
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
  tools: z.array(ToolDefinitionSchema).max(64).optional(),
  tool_choice: ToolChoiceSchema.optional(),
  response_format: z
    .object({
      type: z.enum(['text', 'json_object', 'json_schema']).optional(),
      json_schema: z.unknown().optional(),
    })
    .optional(),
  seed: z.number().int().optional(),
  web_search: z.boolean().optional(),
  web_fetch: z.boolean().optional(),
  research: z.boolean().optional(),
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
  // Optional, additive: identifies the web conversation this request belongs to (see
  // shared/stores/chat-store.ts). Backward-compatible -- any caller that omits it (other
  // surfaces, direct API users) is unaffected. Used ONLY to key conversation-scoped E2B
  // sandbox persistence (lib/e2b/runtime.ts); never trusted for authorization (ownership
  // is enforced separately by /api/chat/conversations routes).
  conversation_id: z.string().max(256).optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export type ProcessedRequest = {
  requestId: string;
  chatRequest: ChatCompletionRequest;
  /** Conversation this request belongs to, if the caller sent one (see conversation_id). */
  conversationId: string | undefined;
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
  freeTrial?: FreeTrialReservation;
  llmRequest: {
    model: string;
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      multimodal_content?: unknown[];
      tool_calls?: unknown[];
      tool_call_id?: string;
      /**
       * INTERNAL, tool-loop-only: signed thinking blocks re-attached to an
       * assistant tool_use turn the agentic loop replays to Anthropic under
       * extended thinking. Set only by tool-loop.ts, forwarded to the request
       * builder by canonical-request.ts's `toWireMessage`, and never present
       * on a client-supplied message nor serialized onto any client wire.
       * Fixes known-flaw TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01.
       */
      __canonicalThinking?: ThinkingBlock[];
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

const EFFORT_VALUES: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function normalizeEffort(value: string | undefined): Effort | undefined {
  const normalized = value?.toLowerCase();
  return normalized && EFFORT_VALUES.has(normalized) ? (normalized as Effort) : undefined;
}

function modelSupportsEffort(provider: string, model: string): boolean {
  const metadata = getModelMetadataById(model);
  if (metadata) return metadata.capabilities.thinking;
  return provider === 'anthropic' || provider === 'openai' || provider === 'google';
}

/**
 * Whether an Anthropic model uses the NEW adaptive-thinking + `output_config.effort`
 * API generation (Opus 4.8, Sonnet 4.6) vs the classic manual
 * `thinking:{type:"enabled",budget_tokens}` generation (Haiku 4.5).
 *
 * CRITICAL: keys off the per-model `reasoning.control`, NOT just
 * `capabilities.thinking`. Opus 4.8 REJECTS the classic enabled+budget shape with
 * a 400; Haiku 4.5 is classic-only. Before this was control-aware, flipping
 * Haiku's `capabilities.thinking` to true (correct — it does think) would have
 * routed Haiku through `{type:"adaptive"}`, which is unverified on Haiku. Matrix
 * flag 3 + docs/research/reasoning-effort-capability-matrix-2026-07-10.md.
 *
 * The lookup uses `getModelMetadataById`, which resolves BOTH the catalog id
 * (`claude-opus-4.8`) AND the apiModelId (`claude-opus-4-8`) via modelIdAliases —
 * so the route can pass either form without falling through to enabled+budget
 * (which would 400 live on Opus). Matrix flag 3 (Opus id-resolution).
 */
export function anthropicUsesAdaptiveThinking(model: string): boolean {
  const metadata = getModelMetadataById(model);
  if (metadata?.provider !== 'anthropic' || !metadata.capabilities.thinking) return false;
  const control = metadata.reasoning?.control;
  // effort_levels ⇒ adaptive+output_config.effort (Opus 4.8 / Sonnet 4.6).
  // thinking_budget ⇒ classic enabled+budget (Haiku 4.5) — NOT adaptive.
  if (control === 'thinking_budget') return false;
  return true;
}

export function buildThinkingConfig({
  provider,
  model,
  explicitThinking,
  thinkingMode,
  effort,
}: {
  provider: string;
  model: string;
  explicitThinking: ChatCompletionRequest['thinking'];
  thinkingMode: boolean | undefined;
  effort: Effort | undefined;
}): { type: string; budget_tokens?: number } | undefined {
  if (provider !== 'anthropic') return undefined;

  const usesAdaptive = anthropicUsesAdaptiveThinking(model);

  if (explicitThinking) {
    if (usesAdaptive && explicitThinking.type !== 'adaptive') {
      return { type: 'adaptive' };
    }
    return explicitThinking;
  }

  if (!thinkingMode) return undefined;

  if (usesAdaptive) return { type: 'adaptive' };

  // Classic manual budget (Haiku 4.5, control=thinking_budget). Clamp the
  // effort→budget preset to the model's declared thinkingBudget.max so a high
  // effort can't exceed what the model accepts (Haiku max 32768 < the 'max'
  // preset 65536). Matrix: Haiku budget min ~1024 / model-max.
  const budgetMax = getModelReasoning(model).thinkingBudget?.max;
  const preset = ANTHROPIC_THINKING_BUDGET[effort ?? 'medium'];
  return {
    type: 'enabled',
    budget_tokens: typeof budgetMax === 'number' ? Math.min(preset, budgetMax) : preset,
  };
}

export function extractTextContent(
  content: string | Array<{ type: string; text?: string; image_url?: unknown }>,
): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text!)
    .join('\n');
}

// Exported so it can be unit-tested without importing the full processRequest stack.
export const RESEARCH_SYSTEM_PROMPT =
  'You are in deep research mode. Your job is to produce a thorough, well-structured report.' +
  ' Search the web using several distinct, targeted queries that cover different angles of the topic.' +
  ' Cross-reference multiple sources before drawing conclusions.' +
  ' Inline-cite every factual claim with a bracketed number, e.g. [1], matched to a numbered Sources list at the end.' +
  ' Structure the report with a brief executive summary, clearly labeled sections, and a Sources list.' +
  ' Use plain language; avoid jargon where simpler terms work just as well.' +
  ' Do not pad the report with filler sentences; every paragraph must add new information.';

/**
 * Mutates chatRequest in place: forces web_search on and prepends the research
 * system prompt. Should only be called when the model supports search (caller's guard).
 */
export function applyResearchMode(chatRequest: ChatCompletionRequest): void {
  chatRequest.web_search = true;
  const firstMessage = chatRequest.messages[0];
  if (firstMessage?.role === 'system') {
    firstMessage.content = RESEARCH_SYSTEM_PROMPT + '\n\n' + firstMessage.content;
  } else {
    chatRequest.messages.unshift({ role: 'system', content: RESEARCH_SYSTEM_PROMPT });
  }
}

/**
 * Append the provider-native web-search server tool to `tools` when the caller has
 * requested web search and the resolved model supports search. Pure and exported so
 * the injection is unit-testable across every provider (the previous inline block
 * silently no-op'd for any provider without a branch — xai/qwen/moonshot, whose
 * catalog `search:true` lit the composer toggle, so the request went out with no
 * search tool and the model answered "I can't browse the internet"; those providers
 * are now gated out of the toggle client-side via `providerSupportsWebSearch`).
 *
 * Providers WITH a branch (kept in sync with `WEB_SEARCH_INJECTION_PROVIDERS`):
 *   - anthropic: `web_search_20260209` with `allowed_callers:['direct']` (verified
 *     against platform.claude.com — the current dynamic-filtering tool version;
 *     `allowed_callers:['direct']` is required to call it without code execution).
 *   - google:    `{ google_search: {} }`.
 *   - openai:    `{ type: 'web_search_preview' }` (Responses API).
 * `caps.search ?? true` keeps unknown/missing catalog entries permissive (a missing
 * entry never silently drops the tool for a provider that does support it).
 */
export function appendWebSearchTool(
  providerLower: string,
  tools: unknown[] | undefined,
  caps: { search?: boolean } | undefined,
): unknown[] | undefined {
  if (!(caps?.search ?? true)) return tools;
  if (providerLower === 'anthropic') {
    return [
      ...(tools ?? []),
      { type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] },
    ];
  }
  if (providerLower === 'google') {
    return [...(tools ?? []), { google_search: {} }];
  }
  if (providerLower === 'openai') {
    return [...(tools ?? []), { type: 'web_search_preview' }];
  }
  return tools;
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
const MAX_TOTAL_LENGTH = 1000000;

export async function processRequest(
  request: NextRequest,
  auth: AuthGateSuccess,
): Promise<ProcessResult> {
  const { userId, token, subscription } = auth;

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

  // Body size guard (actual bytes · Content-Length can be absent or spoofed)
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
  const requestedModel = chatRequest.model;
  const freeTrialEnabled = isFreeTrialRequest({
    requestedModel,
    planTier: subscription.plan_tier,
  });

  if (isFreePlanTier(subscription.plan_tier) && !freeTrialEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message:
              'Free managed cloud access currently supports Auto Economy only. Select Auto Economy, upgrade your plan, or use local/BYOK.',
            type: 'invalid_request_error',
            code: 'free_trial_model_only',
          },
        },
        { status: 403 },
      ),
    };
  }

  if (freeTrialEnabled) {
    // Free = full Hobby experience, gated per-model: a prompt is never wasted on an
    // action the selected model can't perform (e.g. images to a no-vision model).
    // The shared 3-prompt cap + per-prompt token budget (below) bound cost.
    const trialCaps = getModelMetadataById(requestedModel)?.capabilities;
    const hasImagePart = chatRequest.messages.some((msg) =>
      Array.isArray(msg.content)
        ? msg.content.some((part) => part.type === 'image_url' && part.image_url)
        : false,
    );

    const unsupportedFeature =
      ((chatRequest.web_search || chatRequest.web_fetch) && !trialCaps?.search && 'web search') ||
      (chatRequest.code_execution && !trialCaps?.codeExecution && 'code execution') ||
      ((chatRequest.thinking_mode || chatRequest.thinking || chatRequest.effort) &&
        !trialCaps?.thinking &&
        'extended thinking') ||
      (hasImagePart && !trialCaps?.vision && 'image input');

    if (unsupportedFeature) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: `The selected model doesn't support ${unsupportedFeature}. Pick a model that does, or turn that option off.`,
              type: 'invalid_request_error',
              code: 'free_trial_model_capability',
            },
          },
          { status: 400 },
        ),
      };
    }

    // Custom client tool definitions and multiple completions stay blocked on the
    // trial — they aren't surfaced in the composer and are token/cost abuse vectors.
    const usesBlockedAddOn =
      (chatRequest.tools?.length ?? 0) > 0 ||
      (chatRequest.tool_choice !== undefined && chatRequest.tool_choice !== 'none') ||
      (chatRequest.n ?? 1) > 1;

    if (usesBlockedAddOn) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message:
                'The free trial does not support custom tool definitions or multiple completions. Use the built-in web search, images, or thinking instead.',
              type: 'invalid_request_error',
              code: 'free_trial_feature_unavailable',
            },
          },
          { status: 403 },
        ),
      };
    }

    chatRequest.max_tokens = Math.min(
      chatRequest.max_tokens ?? FREE_TRIAL_MAX_OUTPUT_TOKENS,
      FREE_TRIAL_MAX_OUTPUT_TOKENS,
    );
    chatRequest.max_completion_tokens = Math.min(
      chatRequest.max_completion_tokens ?? FREE_TRIAL_MAX_OUTPUT_TOKENS,
      FREE_TRIAL_MAX_OUTPUT_TOKENS,
    );
  }

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
            { userId: userId, messageIndex: mi, partIndex: pi },
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

  // Task-aware classifier (synchronous · no DB/network)
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
        userId: userId,
        requestId,
        indicRatio: indicResult.indicRatio,
        dominantScript: indicResult.dominantScript,
      },
      '[indic-detect] non-Latin Indic script detected · Pool C candidate',
    );
  }

  // Resolve auto model names to actual models (task-aware, tier-aware)
  chatRequest.model = resolveAutoModel(chatRequest.model, subscription.plan_tier, resolvedTaskType);

  if (requestedModel !== chatRequest.model) {
    logger.info(
      {
        userId: userId,
        requestedModel,
        resolvedModel: chatRequest.model,
        taskType: resolvedTaskType,
        taskConfidence: classifierResult.confidence,
        tier: subscription.plan_tier,
      },
      'Auto model resolved to actual model',
    );
  }

  // Defense-in-depth (all tiers): never forward image parts to a model without
  // vision — the provider would reject them and the request/credits would be wasted.
  const resolvedModelCaps = getModelMetadataById(chatRequest.model)?.capabilities;
  if (resolvedModelCaps && !resolvedModelCaps.vision) {
    const hasImagePart = chatRequest.messages.some((msg) =>
      Array.isArray(msg.content)
        ? msg.content.some((part) => part.type === 'image_url' && part.image_url)
        : false,
    );
    if (hasImagePart) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: 'The selected model cannot read images. Choose a vision-capable model.',
              type: 'invalid_request_error',
              code: 'model_no_vision',
            },
          },
          { status: 400 },
        ),
      };
    }
  }

  // Deep Research mode: when the frontend sends research:true and the resolved
  // model supports web search, inject the research system prompt and force
  // web_search on so the tool-injection block below picks it up automatically.
  // Non-search models silently skip this block (no crash, no wasted request).
  if (chatRequest.research && (resolvedModelCaps?.search ?? false)) {
    applyResearchMode(chatRequest);
  }

  // Model tier access check
  if (!freeTrialEnabled && !checkModelTierAccess(chatRequest.model, subscription.plan_tier)) {
    const modelKey = chatRequest.model.toLowerCase();
    const requiredTiers = MODEL_TIER_REQUIREMENTS[modelKey];
    // Lowercase key (e.g. 'pro') for clients to pattern-match on, alongside the
    // uppercased word used in the human-readable message below. Clients (mobile,
    // desktop, web) key their upgrade-prompt UI off this field the same way they
    // already do for the HTTP 429 paywall shape (`{kind:'paywall', requiredTier}`)
    // — before this field existed, a model-tier-gate rejection had no structured
    // way to tell it apart from a generic server error, so every client fell back
    // to a blank "Something went wrong" message instead of an actionable upgrade
    // prompt.
    const requiredTierKey = requiredTiers && requiredTiers.length > 0 ? requiredTiers[0] : 'pro';
    const requiredTier = requiredTierKey?.toUpperCase() ?? 'PRO';
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `Model ${chatRequest.model} requires ${requiredTier} subscription or higher.`,
            type: 'invalid_request_error',
            code: 'model_not_available',
            requiredTier: requiredTierKey,
          },
        },
        { status: 403 },
      ),
    };
  }

  const originalModel = chatRequest.model;
  let usedFallback = false;
  let fallbackReason: string | undefined;

  let provider = resolveProviderFromModel(chatRequest.model);

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
  if (!freeTrialEnabled) {
    try {
      quotaOutcome = await assertQuota({
        userId: userId,
        token,
        tier: subscription.plan_tier,
        requestedTokens: quotaEstimateTokens,
        feature: quotaFeature,
        slot: resolvedSlot ?? undefined,
      });
    } catch (gateError) {
      // Fail-open: gate error falls back to legacy CreditService flow
      logger.warn(
        { userId: userId, error: gateError instanceof Error ? gateError.message : gateError },
        '[assertQuota] gate errored, falling back to credit-only flow',
      );
    }
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
        userId: userId,
        from: chatRequest.model,
        to: quotaOutcome.modelOverride,
        reason: quotaOutcome.reason,
      },
      '[assertQuota] downgrade applied',
    );
    chatRequest.model = quotaOutcome.modelOverride;
    provider = resolveProviderFromModel(chatRequest.model);
    usedFallback = true;
    fallbackReason = quotaOutcome.reason;
  } else if (quotaOutcome.kind === 'warn') {
    quotaWarningHeader = quotaOutcome.warning;
  }

  // Egress policy: validate custom provider base URLs
  // WEB-30 (audit 2026-05-19): extended map from 4 providers to 9 so all
  // *_BASE_URL overrides flow through the allowlist. Pre-fix, an operator
  // who set `ANTHROPIC_BASE_URL=http://169.254.169.254/...` (or any other
  // unguarded provider) would bypass the egress allowlist entirely.
  const providerBaseUrlEnvMap: Record<string, string> = {
    openai: 'OPENAI_BASE_URL',
    qwen: 'QWEN_BASE_URL',
    deepseek: 'DEEPSEEK_BASE_URL',
    moonshot: 'MOONSHOT_BASE_URL',
    anthropic: 'ANTHROPIC_BASE_URL',
    xai: 'XAI_BASE_URL',
    perplexity: 'PERPLEXITY_BASE_URL',
    zhipu: 'ZHIPU_BASE_URL',
    google: 'GOOGLE_BASE_URL',
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

  if (freeTrialEnabled && totalLength > FREE_TRIAL_MAX_INPUT_CHARS) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `Free prompts are limited to ${FREE_TRIAL_MAX_INPUT_CHARS.toLocaleString()} input characters.`,
            type: 'invalid_request_error',
            code: 'free_trial_prompt_too_large',
          },
        },
        { status: 413 },
      ),
    };
  }

  // Token + cost estimation
  const rawEstimatedPromptTokens = chatRequest.messages.reduce((sum, msg) => {
    const textContent = extractTextContent(msg.content);
    const baseTokens = Math.ceil(textContent.length / 3.5);
    const overheadTokens = 4;
    return sum + baseTokens + overheadTokens;
  }, 0);
  // Clamp the prompt-token estimate to a realistic ceiling. No real prompt exceeds the
  // largest model context window (~1M tokens), so a larger figure is a malformed/runaway
  // estimate — and because this estimate drives the credit RESERVE, an inflated value
  // produced huge per-request charges (e.g. an unresolved "unknown"-model request reserving
  // $10+ that was never reconciled back down). The reserve is only an upper bound; the
  // post-response reconciliation settles the real cost from actual tokens, so clamping here
  // can only ever reduce an over-reserve, never under-charge a legitimate request.
  const MAX_ESTIMATED_PROMPT_TOKENS = 1_000_000;
  const estimatedPromptTokens = Math.min(rawEstimatedPromptTokens, MAX_ESTIMATED_PROMPT_TOKENS);

  // Per-prompt input-token cap for the free trial — abuse control so a single
  // free prompt can't burn cost on a giant context across the 3 chances.
  if (freeTrialEnabled && estimatedPromptTokens > FREE_TRIAL_MAX_INPUT_TOKENS) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `Free prompts are limited to ${FREE_TRIAL_MAX_INPUT_TOKENS.toLocaleString()} input tokens. Shorten your prompt or upgrade for more.`,
            type: 'invalid_request_error',
            code: 'free_trial_prompt_too_large',
          },
        },
        { status: 413 },
      ),
    };
  }

  const providerLower = provider.toLowerCase();
  const normalizedEffort = normalizeEffort(chatRequest.effort);
  const effectiveEffort = modelSupportsEffort(providerLower, chatRequest.model)
    ? normalizedEffort
    : undefined;
  const thinkingConfig = buildThinkingConfig({
    provider: providerLower,
    model: chatRequest.model,
    explicitThinking: chatRequest.thinking,
    thinkingMode: chatRequest.thinking_mode,
    effort: effectiveEffort,
  });

  // Default output cap when the client doesn't specify one. 1000 was far too low: it
  // truncated HTML/code artifacts mid-stream, so the closing ``` fence never arrived, the
  // artifact couldn't be extracted into a card, and the transcript was left showing raw
  // code (this broke claude.ai-style artifact parity). 8192 lets a full artifact / long
  // answer complete. It is a CAP, not a target — short replies still stop early, so cost
  // for them is unchanged; only genuinely long responses use the extra headroom.
  const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
  let maxTokens =
    chatRequest.max_tokens || chatRequest.max_completion_tokens || DEFAULT_MAX_OUTPUT_TOKENS;
  if (
    providerLower === 'anthropic' &&
    thinkingConfig?.type === 'enabled' &&
    typeof thinkingConfig.budget_tokens === 'number' &&
    thinkingConfig.budget_tokens >= maxTokens
  ) {
    maxTokens = Math.min(64000, thinkingConfig.budget_tokens + 1024);
  }

  let estimatedCostCents = LLMCostCalculator.estimateCost(
    provider,
    chatRequest.model,
    estimatedPromptTokens,
    maxTokens,
  );
  let freeTrial: FreeTrialReservation | undefined;

  if (freeTrialEnabled) {
    estimatedCostCents = 0;
    const trialReservationResult = await reserveFreeTrialPrompt({ userId, requestId });
    if (!trialReservationResult.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message:
                'You have used the 3 free Auto Economy prompts for this account. Upgrade your plan or use local/BYOK to continue.',
              type: 'insufficient_quota',
              code: 'website_trial_prompt_limit_reached',
              trial: {
                model: FREE_TRIAL_MODEL,
                prompt_limit: FREE_TRIAL_PROMPT_LIMIT,
              },
            },
          },
          { status: 429 },
        ),
      };
    }
    freeTrial = trialReservationResult.reservation;
  } else {
    // Credit allocation + availability check
    let existingBalance = await CreditService.getBalance(userId);

    logger.debug(
      {
        userId: userId,
        hasBalance: !!existingBalance,
        accountId: existingBalance?.account_id,
        remaining: existingBalance?.credits_remaining_cents,
        planTier: subscription.plan_tier,
      },
      'Credit balance check',
    );

    if (!existingBalance || !existingBalance.account_id) {
      logger.info(
        { userId: userId, subscriptionId: subscription.id, planTier: subscription.plan_tier },
        'No credit account found, allocating credits for subscription period',
      );

      try {
        const accountId = await SubscriptionService.allocateCreditsForPeriod(
          userId,
          subscription.id,
          subscription.plan_tier,
          subscription.current_period_start,
          subscription.current_period_end,
          { stripePriceId: subscription.stripe_price_id },
        );

        if (accountId) {
          logger.info({ userId: userId, accountId }, 'Credits allocated successfully');
          existingBalance = await CreditService.getBalance(userId);
          logger.debug(
            {
              userId: userId,
              newBalance: existingBalance?.credits_remaining_cents,
              accountId: existingBalance?.account_id,
            },
            'Balance after allocation',
          );
        } else {
          logger.warn(
            { userId: userId, planTier: subscription.plan_tier },
            'Credit allocation returned no account ID - plan may not include credits',
          );
        }
      } catch (allocError) {
        logger.error(
          { error: allocError, userId: userId, planTier: subscription.plan_tier },
          'Failed to allocate credits - continuing with credit check',
        );
      }
    }

    const hasCredits = await CreditService.checkAvailable(userId, estimatedCostCents);

    logger.debug(
      {
        userId: userId,
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
        const fallbackProvider = resolveProviderFromModel(fallbackModel.model);
        const fallbackCostCents = LLMCostCalculator.estimateCost(
          fallbackProvider,
          fallbackModel.model,
          estimatedPromptTokens,
          maxTokens,
        );

        const hasFallbackCredits = await CreditService.checkAvailable(userId, fallbackCostCents);

        if (hasFallbackCredits) {
          usedFallback = true;
          fallbackReason = `Insufficient credits for ${originalModel}, switched to ${fallbackModel.model}`;
          chatRequest.model = fallbackModel.model;
          provider = fallbackProvider;
          estimatedCostCents = fallbackCostCents;
        } else {
          return {
            ok: false,
            response: handleCreditError({ code: 'MONTHLY_CREDIT_LIMIT_REACHED' }),
          };
        }
      } else {
        return {
          ok: false,
          response: handleCreditError({ code: 'MONTHLY_CREDIT_LIMIT_REACHED' }),
        };
      }
    }

    // Reserve credits with idempotency key
    const reservationKey = CreditService.generateIdempotencyKey(userId, 'reservation', requestId);
    const reserveResult = await CreditService.deductCredits(
      userId,
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
  // Only inject a built-in tool the resolved model can actually use (unknown models
  // default to allowed so a missing catalog entry never silently drops the tool).
  let resolvedTools: unknown[] | undefined = chatRequest.tools;
  if (chatRequest.web_search) {
    resolvedTools = appendWebSearchTool(providerLower, resolvedTools, resolvedModelCaps);
  }

  if (
    chatRequest.web_fetch &&
    providerLower === 'anthropic' &&
    (resolvedModelCaps?.search ?? true)
  ) {
    resolvedTools = [
      ...(resolvedTools ?? []),
      { type: 'web_fetch_20260209', name: 'web_fetch', allowed_callers: ['direct'] },
    ];
  }

  if (chatRequest.code_execution && (resolvedModelCaps?.codeExecution ?? true)) {
    // Code-execution router: tiered by provider when AGI_E2B_EXECUTION=1; native-always otherwise.
    //
    // E2B CUT-OVER (flag ON, streaming, non-free-trial):
    //   - Anthropic + Google: free-native tier — they run code in their own sandboxes at no
    //     E2B credit cost, so we keep their provider-native tools.
    //   - OpenAI + everyone else: E2B-credit tier — routes to the platform-executed E2B sandbox
    //     (avoids OpenAI per-session fees; provides a sandbox for providers with no native exec).
    //
    // The offer is guarded to streaming non-free-trial only (offer⊆run constraint): E2B tools
    // are platform-executed and require the agentic loop to actually run them. That loop is only
    // entered on the streaming non-free-trial path in route.ts. Offering E2B tools on non-streaming
    // or free-trial paths would inject a tool_call that nothing executes and stall the turn.
    //
    // FLAG OFF (default): byte-for-byte the pre-P3 behavior regardless of E2B configuration.
    // See docs/plans/e2b-universal-execution-design-* for the full design rationale.
    if (
      e2bCutoverEnabled() &&
      providerRoutesToE2B(providerLower) &&
      chatRequest.stream &&
      !freeTrial
    ) {
      resolvedTools = [...(resolvedTools ?? []), ...e2bExecutionToolDefs()];
    } else {
      resolvedTools = [...(resolvedTools ?? []), ...resolveCodeExecutionTools(providerLower)];
    }
  }

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
    effort:
      providerLower === 'openai' && effectiveEffort
        ? OPENAI_REASONING_EFFORT[effectiveEffort]
        : effectiveEffort,
    usePromptCache: chatRequest.use_prompt_cache,
  };

  return {
    ok: true,
    requestId,
    chatRequest,
    conversationId: chatRequest.conversation_id,
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
    freeTrial,
    llmRequest,
  };
}

export { reconcileUsage };
