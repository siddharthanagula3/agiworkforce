import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ToolCallResponseSchema } from '@/lib/validations/tool-calls';
import { MAX_MESSAGE_LENGTH, ToolChoiceSchema, ToolDefinitionSchema } from '@/lib/validations/llm';
import { logger } from '@/lib/logger';
import {
  resolveCodeExecutionTools,
  e2bExecutionToolDefs,
  providerRoutesToE2B,
} from '@/lib/e2b/execution-tools';
import { e2bCutoverEnabled } from '@/lib/e2b/gate';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { webSearchToolDef, webSearchBackendConfigured } from '@/lib/web-search/web-search-tool';
import { webSearchNeedsGenericTool } from '@agiworkforce/search';
import { extractCandidateMemoryFacts } from '@agiworkforce/agent-core';
import { supportsOpenAIReasoningEffort } from '@agiworkforce/provider-protocol';
import { CreditService } from '@/lib/services/credit-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  FREE_TRIAL_MODEL,
  applyFreeTrialProviderBudget,
  beginFreeTrialRequest,
  isFreeTrialRequest,
  isFreePlanTier,
  settleFreeTrialRequest,
  type FreeTrialReservation,
} from '@/lib/services/free-trial-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';
import { canAccessModel } from '@/lib/model-tiers';
import { validateEgressUrl, validateUserImageUrl, EgressPolicyError } from '@/lib/egress-policy';
import {
  ANTHROPIC_THINKING_BUDGET,
  CLOUD_WORK_MODES,
  getEconomyFallbackModels,
  getModelMetadataById,
  getMinimumRequiredTier,
  getModelReasoning,
  type Effort,
  getSlotForModel,
  normalizeModelId,
  canUseBillingPlanCapability,
} from '@agiworkforce/types';
import type { RoutingSlot, ThinkingBlock } from '@agiworkforce/types';
import {
  applyConversationContext,
  classifyTaskLocally,
  detectIndicScript,
  estimateTokens,
  resolveAutoRoute,
} from '@agiworkforce/routing';
import type { RoutingTaskType } from '@agiworkforce/routing';
import type { AuthGateSuccess } from './auth-gate';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  MANAGED_CHAT_CONTRACT_VERSION,
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  fingerprintManagedUsageRequest,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import {
  applyProjectContext,
  formatProjectSystemPrompt,
  loadProjectContext,
} from '@/lib/services/project-context-service';
import {
  applyManagedMemoryContext,
  formatManagedMemorySystemPrompt,
  loadManagedMemoryContext,
  type ManagedMemoryContextDb,
} from '@/lib/services/managed-memory-context-service';
import {
  createSkillToolDefinition,
  formatSkillsForToolPrompt,
  type Skill,
} from '@agiworkforce/skills';
import {
  getManagedSkillCatalog,
  SkillCatalogUnavailableError,
} from '@/lib/services/skill-catalog-service';
import { resolveCloudChatSurface, type CloudChatSurface } from '@/lib/free-chat-surface-policy';
import {
  createManagedOfficeFileToolDefinition,
  MANAGED_OFFICE_FILE_TOOL_NAME,
} from '@/lib/services/managed-office-file-service';

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
  // Logical client selection only. The server owns the Office schemas,
  // generation runtime, storage target, and emitted file descriptors.
  office_creation: z.boolean().optional(),
  // Product mode, not a provider hint. `agiwork` is paid managed-cloud work
  // that exposes AGI's server-owned search/fetch/sandbox tools below.
  work_mode: z.enum(CLOUD_WORK_MODES).optional(),
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
  // Optional, additive: identifies the owned cloud conversation this request belongs to.
  // The processor verifies it against web_conversations.user_id before billing, provider,
  // tool, or E2B work. A conversation id is never an authorization token.
  conversation_id: z.string().uuid().optional(),
  // Composer activation sends only a catalog identity. Host locations and
  // instruction content are never accepted on the browser contract.
  skill_name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
      (name) =>
        !name.includes('/') &&
        !name.includes('\\') &&
        Array.from(name).every((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint > 31 && codePoint !== 127;
        }),
      'skill_name must be a catalog name',
    )
    .optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export type ManagedSkillSelectionResult =
  | { ok: true }
  | { ok: false; code: 'skill_not_found'; message: string };

type QuotaFeature = 'chat' | 'image' | 'video' | 'computer_use';

/**
 * Add only path-free Skill metadata and the canonical server-owned definition.
 * The selected body remains withheld until the model makes a real load call.
 */
export function applyManagedSkillSelection(
  request: ChatCompletionRequest,
  catalog: readonly Skill[],
): ManagedSkillSelectionResult {
  if (!request.skill_name) return { ok: true };
  if (!catalog.some((skill) => skill.name === request.skill_name)) {
    return {
      ok: false,
      code: 'skill_not_found',
      message: 'The selected skill is not available.',
    };
  }

  const prompt = formatSkillsForToolPrompt(catalog, { selectedSkillName: request.skill_name });
  request.messages.unshift({ role: 'system', content: prompt });
  request.tools = [
    ...(request.tools ?? []).filter((tool) => tool.function.name !== 'skill'),
    createSkillToolDefinition(),
  ];
  return { ok: true };
}

/** Add the canonical server-owned Office creator without trusting client schemas. */
export function applyManagedOfficeFileCreation(request: ChatCompletionRequest): void {
  if (!request.office_creation) return;
  request.tools = [
    ...(request.tools ?? []).filter((tool) => tool.function.name !== MANAGED_OFFICE_FILE_TOOL_NAME),
    createManagedOfficeFileToolDefinition(),
  ];
}

/** Make the AGI Work composer mode operational at the server trust boundary. */
export function applyWorkMode(chatRequest: ChatCompletionRequest): void {
  if (chatRequest.work_mode !== 'agiwork') return;

  chatRequest.stream = true;
  chatRequest.web_search = true;
  chatRequest.web_fetch = true;
  chatRequest.code_execution = true;
}

export type WorkModeEntitlementError = {
  code: 'agi_work_plan_required';
  message: string;
  requiredTier: 'pro';
};

/**
 * AGI Work is a separate paid capability from ordinary Managed Cloud chat.
 * Keep this gate independent from the caller surface so Basic cannot enable
 * the tool loop by sending `work_mode: "agiwork"` from Web or Desktop.
 */
export function getWorkModeEntitlementError(
  workMode: ChatCompletionRequest['work_mode'],
  planTier: string | null | undefined,
): WorkModeEntitlementError | null {
  if (workMode !== 'agiwork' || canUseBillingPlanCapability(planTier, 'agi_work')) return null;
  return {
    code: 'agi_work_plan_required',
    message: 'AGI Work requires Pro or higher.',
    requiredTier: 'pro',
  };
}

/**
 * Keep ordinary request recovery responsive while giving durable AGI Work
 * workflows enough time to span many bounded invocations without the billing
 * recovery job classifying an active run as abandoned.
 */
export function resolveManagedUsageLeaseSeconds(
  workMode: ChatCompletionRequest['work_mode'],
): number {
  return workMode === 'agiwork' ? 86_400 : 900;
}

export type ProcessedRequest = {
  requestId: string;
  /** Durable paid-request lifecycle; absent only for the free-trial path. */
  managedUsage?: ManagedUsageRequestReservation;
  chatRequest: ChatCompletionRequest;
  /** Conversation this request belongs to, if the caller sent one (see conversation_id). */
  conversationId: string | undefined;
  /** Conservative user-authored facts captured before server prompt enrichment. */
  autoMemoryFacts?: string[];
  requestedModel: string;
  provider: string;
  estimatedCostCents: number;
  estimatedPromptTokens: number;
  maxTokens: number;
  usedFallback: boolean;
  fallbackReason: string | undefined;
  originalModel: string;
  /**
   * The resolver's ordered managed-failover plan (AUTO-ROUTER-MIGRATION-01,
   * web twin of the gateway's x-agi-fallback-models execution): registry-
   * ordered, tier-admitted candidate model ids that route.ts may rotate to
   * when the primary attempt fails on an availability-class error before
   * the first byte reaches the client. STRUCTURALLY EMPTY for explicit
   * (non-Auto) selections — the resolver emits no fallbacks for them, so an
   * explicit selection can never rotate — and empty for free-trial requests
   * (their pinned model and prompt accounting must not hop providers).
   * Optional (additive schema evolution): absent means no failover, so
   * pre-existing ProcessedRequest fixtures stay valid.
   */
  fallbackModels?: string[];
  /**
   * Plan tier the request was admitted under; managed-failover re-checks
   * candidate admission against it per attempt (a stale plan entry must be
   * skipped, never served). Optional for the same fixture-compat reason.
   */
  subscriptionTier?: string;
  resolvedTaskType: RoutingTaskType;
  classifierConfidence: number;
  resolvedSlot: RoutingSlot | null;
  quotaFeature: QuotaFeature;
  quotaWarningHeader: string | null;
  isFlagshipRequest: boolean;
  /**
   * True when Deep Research mode was applied (research:true and the resolved
   * model supports web search). route.ts uses this to enter the multi-turn
   * research loop on streaming, non-free-trial requests. Optional (additive
   * schema evolution): absent/undefined means false, so pre-existing
   * ProcessedRequest fixtures stay valid without churn.
   */
  researchMode?: boolean;
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
 * Resolve the user-facing effort selection against the selected model's
 * canonical capability metadata. OpenAI effort ladders vary by model, so a
 * global provider map would silently discard newly introduced levels (or send
 * unsupported ones) until application code was edited.
 */
export function resolveRequestEffort(
  provider: string,
  model: string,
  effort: string | undefined,
): Effort | undefined {
  const normalized = normalizeEffort(effort);
  if (!normalized || !modelSupportsEffort(provider, model)) return undefined;
  if (
    provider === 'openai' &&
    !supportsOpenAIReasoningEffort({ provider: 'openai', id: model }, normalized)
  ) {
    return undefined;
  }
  return normalized;
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
  // effort_levels ⇒ adaptive+output_config.effort (Opus 4.8 / Sonnet 5).
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

/**
 * Collect every prompt-bearing string used for quota and reserve estimates.
 * Server-owned function definitions consume provider input tokens just like
 * messages, so omitting them would undercount tool-enabled requests.
 */
export function collectManagedPromptMaterials(request: ChatCompletionRequest): string[] {
  const materials = request.messages.map((message) => extractTextContent(message.content));
  if (request.tools?.length) materials.push(JSON.stringify(request.tools));
  return materials;
}

/**
 * Apply server-owned account memories when the conversation policy allows it.
 * Exported so the Temporary Chat boundary and prompt-accounting behavior stay
 * covered without importing route or database globals into the test.
 */
export async function enrichManagedMemoryContext(params: {
  db: ManagedMemoryContextDb;
  userId: string;
  chatRequest: ChatCompletionRequest;
  isTemporary: boolean;
}): Promise<void> {
  if (params.isTemporary) return;

  const memories = await loadManagedMemoryContext(params.db, { userId: params.userId });
  const prompt = formatManagedMemorySystemPrompt(memories);
  if (prompt) applyManagedMemoryContext(params.chatRequest, prompt);
}

/** Website-first capture policy; later release slices enable other Cloud clients. */
export function prepareManagedAutoMemoryFacts(params: {
  message: string;
  isTemporary: boolean;
  surface: CloudChatSurface;
}): string[] {
  if (params.isTemporary || params.surface !== 'web') return [];
  return extractCandidateMemoryFacts(params.message).slice(0, 5);
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
 * Mutates chatRequest in place: forces web_search AND web_fetch on and prepends
 * the research system prompt. Should only be called when the model supports
 * search (caller's guard). web_fetch lets research gathering rounds read full
 * pages: Anthropic gets its native web_fetch server tool; other tool-calling
 * providers get the platform url_fetch function tool (see the tool injection
 * block below).
 */
export function applyResearchMode(chatRequest: ChatCompletionRequest): void {
  chatRequest.web_search = true;
  chatRequest.web_fetch = true;
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
 * the injection is unit-testable across every provider. This handles ONLY the native
 * path (anthropic/google/openai). Providers without a native branch (xai/qwen/zhipu/
 * deepseek/mistral/…) are NOT gated out of web search — when the model is tools-capable
 * and the generic backend is configured (`PERPLEXITY_API_KEY`, surfaced as the
 * `generic_web_search` feature flag), the composer offers web search via
 * `isWebSearchAvailable`, and the request routes through the generic fallback tool
 * (`shouldOfferGenericWebSearchTool` → `webSearchToolDef`, executed in the tool loop)
 * rather than this native injection. The old failure mode (a lit toggle producing no
 * search tool, so the model answered "I can't browse the internet") only applied to
 * the retired inline block; the two-path design above closes it for every provider.
 *
 * Providers WITH a branch (kept in sync with `WEB_SEARCH_INJECTION_PROVIDERS` in
 * `@agiworkforce/search`):
 *   - anthropic: `web_search_20260209` with `allowed_callers:['direct']` (verified
 *     against platform.claude.com — the current dynamic-filtering tool version;
 *     `allowed_callers:['direct']` is required to call it without code execution).
 *   - google:    `{ google_search: {} }`.
 *   - openai:    stable Responses `{ type: 'web_search' }`, with complete
 *     source metadata requested by the provider adapter.
 * `caps.search ?? true` keeps unknown/missing catalog entries permissive (a missing
 * entry never silently drops the tool for a provider that does support it).
 *
 * OpenAI uses the Responses API for catalog-known native OpenAI models. The
 * provider adapter passes this server tool through verbatim and translates
 * its activity/citations into AGI's canonical stream.
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
    return [...(tools ?? []), { type: 'web_search' }];
  }
  return tools;
}

/**
 * WP4 — should the generic platform-executed `web_search` function tool be offered
 * for this request? Pure and exported (same reason as `appendWebSearchTool`: unit
 * testable without invoking the rest of `processRequest`).
 *
 * True when: the provider has no working native search path on this route
 * (`webSearchNeedsGenericTool` reports that fallback requirement), the
 * resolved model is tools-capable (unknown models
 * default to allowed), the request is streaming (offer ⊆ run — only that path
 * enters the tool loop in route.ts, mirrors url_fetch/E2B below), and
 * a search backend is actually configured (`backendConfigured` —
 * `webSearchBackendConfigured()` in production — so the tool is never offered as a
 * promise the server can't back up).
 */
export function shouldOfferGenericWebSearchTool({
  providerLower,
  toolsCapable,
  stream,
  freeTrial: _freeTrial,
  backendConfigured,
}: {
  providerLower: string;
  toolsCapable: boolean;
  stream: boolean | undefined;
  freeTrial: boolean;
  backendConfigured: boolean;
}): boolean {
  return (
    webSearchNeedsGenericTool(providerLower) && toolsCapable && Boolean(stream) && backendConfigured
  );
}

/**
 * Free chat includes first-party chat capabilities, but not Deep Research,
 * arbitrary API-defined tools, or multiple completions. Custom remote MCPs are
 * server-owned connector tools and therefore do not pass through this check.
 */
export function isFreeTierBlockedAddOn(
  request: Pick<
    ChatCompletionRequest,
    'research' | 'tools' | 'tool_choice' | 'n' | 'web_search' | 'work_mode'
  >,
): boolean {
  return (
    request.work_mode === 'agiwork' ||
    request.research === true ||
    (request.tools?.length ?? 0) > 0 ||
    (request.tool_choice !== undefined && request.tool_choice !== 'none') ||
    (request.n ?? 1) > 1
  );
}

export function resolveWebCloudModelRoute(
  model: string,
  subscriptionTier: string | undefined,
  taskType: RoutingTaskType,
  usage?: {
    /** Remaining managed-usage budget in cents; when set, Auto prefers the
     *  best model this budget can still cover (bias, not a gate). */
    budgetRemainingCents?: number;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
  },
) {
  return resolveAutoRoute({
    selection: model,
    taskType,
    subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
    ...(usage?.budgetRemainingCents !== undefined
      ? { budgetRemainingCents: usage.budgetRemainingCents }
      : {}),
    ...(usage?.estimatedInputTokens !== undefined
      ? { estimatedInputTokens: usage.estimatedInputTokens }
      : {}),
    ...(usage?.estimatedOutputTokens !== undefined
      ? { estimatedOutputTokens: usage.estimatedOutputTokens }
      : {}),
  });
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

function managedUsageErrorResponse(error: ManagedUsageRequestError): NextResponse {
  return NextResponse.json(createManagedUsageErrorBody(error, 'invalid_request_error'), {
    status: error.status,
    headers: { 'X-AGI-Chat-Contract-Version': MANAGED_CHAT_CONTRACT_VERSION },
  });
}

function freeTrialBudgetReachedResponse(): ProcessFailure {
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: {
          message:
            'You have reached the current free usage limit. Upgrade your plan, or switch to Local or BYOK to keep going.',
          type: 'insufficient_quota',
          code: 'free_trial_token_budget_reached',
          trial: { model: FREE_TRIAL_MODEL },
        },
      },
      { status: 429 },
    ),
  };
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_TOTAL_LENGTH = 1000000;

export async function processRequest(
  request: NextRequest,
  auth: AuthGateSuccess,
): Promise<ProcessResult> {
  const { userId, subscription } = auth;

  let requestId: string;
  try {
    requestId = parseManagedUsageIdempotencyKey(request.headers.get('idempotency-key'));
  } catch (error) {
    if (error instanceof ManagedUsageRequestError) {
      return { ok: false, response: managedUsageErrorResponse(error) };
    }
    throw error;
  }

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

  // Fingerprint the caller's validated logical request before any server-side
  // routing/fallback mutates `chatRequest`. Reusing a key with a different
  // payload is a conflict; transport retries of the same payload are stable.
  const managedRequestHash = fingerprintManagedUsageRequest(validationResult.data);

  const chatRequest = validationResult.data;
  const workModeEntitlementError = getWorkModeEntitlementError(
    chatRequest.work_mode,
    subscription.plan_tier,
  );
  if (workModeEntitlementError) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            ...workModeEntitlementError,
            type: 'invalid_request_error',
          },
        },
        { status: 403 },
      ),
    };
  }

  let userScopedDb: Awaited<ReturnType<typeof getUserScopedDb>> | undefined;
  let conversationIsTemporary = false;

  if (chatRequest.conversation_id) {
    try {
      userScopedDb = await getUserScopedDb(request);
      if (userScopedDb.userId !== userId) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: {
                message: 'Conversation not found',
                type: 'invalid_request_error',
                code: 'conversation_not_found',
              },
            },
            { status: 404 },
          ),
        };
      }

      const ownedRows = await userScopedDb.db.query<{
        id: string;
        project_id: string | null;
        is_temporary: boolean;
      }>(
        `select id, project_id, is_temporary
           from web_conversations
          where id = $1 and user_id = $2 and deleted_at is null
          limit 1`,
        [chatRequest.conversation_id, userId],
      );
      if (!ownedRows[0]) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: {
                message: 'Conversation not found',
                type: 'invalid_request_error',
                code: 'conversation_not_found',
              },
            },
            { status: 404 },
          ),
        };
      }

      conversationIsTemporary = ownedRows[0].is_temporary;

      // Project-scoped conversation ("AGI Work"): load the owned project's
      // instructions + knowledge-file manifest and merge them into the system
      // context. Without this, a persisted project_id scopes nothing and the
      // composer's project picker would be cosmetic. Enrichment is
      // best-effort: a project-load failure must not take down the chat turn
      // (ownership above already hard-fails), but it is logged loudly because
      // silently dropping the user's project instructions is a scope lie.
      if (ownedRows[0].project_id) {
        try {
          const projectContext = await loadProjectContext(userScopedDb.db, {
            projectId: ownedRows[0].project_id,
            userId,
            currentConversationId: ownedRows[0].id,
          });
          const projectPrompt = projectContext ? formatProjectSystemPrompt(projectContext) : null;
          if (projectPrompt) {
            applyProjectContext(chatRequest, projectPrompt);
          }
        } catch (error) {
          logger.error(
            {
              error,
              userId,
              conversationId: chatRequest.conversation_id,
              projectId: ownedRows[0].project_id,
            },
            'Project context load failed; continuing without project instructions',
          );
        }
      }
    } catch (error) {
      logger.error(
        { error, userId, conversationId: chatRequest.conversation_id },
        'Managed conversation ownership lookup failed',
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: 'Conversation ownership could not be verified',
              type: 'server_error',
              code: 'conversation_lookup_unavailable',
            },
          },
          { status: 503 },
        ),
      };
    }
  }

  // Managed account memory is server-owned context shared by every Cloud
  // client. Temporary Chats deliberately opt out. Loading is best-effort so a
  // memory-store outage cannot take down an otherwise valid chat turn, while
  // owner mismatch always fails closed by skipping enrichment.
  if (!conversationIsTemporary) {
    try {
      userScopedDb ??= await getUserScopedDb(request);
      if (userScopedDb.userId !== userId) {
        logger.error(
          { userId, scopedUserId: userScopedDb.userId },
          'Managed memory owner mismatch; continuing without account memory',
        );
      } else {
        await enrichManagedMemoryContext({
          db: userScopedDb.db,
          userId,
          chatRequest,
          isTemporary: false,
        });
      }
    } catch (error) {
      logger.error(
        { error, userId, conversationId: chatRequest.conversation_id },
        'Managed memory load failed; continuing without account memory',
      );
    }
  }

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
    // Aggregate usage is gated by private server policy after this capability check.
    const trialCaps = getModelMetadataById(requestedModel)?.capabilities;
    const trialProviderLower =
      getModelMetadataById(requestedModel)?.provider?.toLowerCase() ?? null;
    // Model-agnostic web search: a tools-capable model WITHOUT a native search path
    // (kimi-k3, deepseek, qwen, glm, groq, minimax…) still gets platform web search
    // via the generic Perplexity fallback tool. The composer lights the Web-search
    // toggle for these on `tools`, not `search`, so the trial capability gate must
    // match — do not 403 them just because the model's intrinsic `search` cap is
    // false. Whether the tool actually fires is still decided downstream by
    // shouldOfferGenericWebSearchTool (backend + streaming).
    const hasGenericWebSearchFallback =
      webSearchNeedsGenericTool(trialProviderLower) && trialCaps?.tools === true;
    const hasImagePart = chatRequest.messages.some((msg) =>
      Array.isArray(msg.content)
        ? msg.content.some((part) => part.type === 'image_url' && part.image_url)
        : false,
    );

    const unsupportedFeature =
      ((chatRequest.web_search || chatRequest.web_fetch) &&
        !trialCaps?.search &&
        !hasGenericWebSearchFallback &&
        'web search') ||
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

    if (isFreeTierBlockedAddOn(chatRequest)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message:
                'AGI Work, Deep Research, custom API tool definitions, and multiple completions require a paid plan. Free chat still includes web search, skills, files, code execution, and extended thinking.',
              type: 'invalid_request_error',
              code: 'free_trial_feature_unavailable',
            },
          },
          { status: 403 },
        ),
      };
    }
  }

  applyWorkMode(chatRequest);

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
  let lastUserIndex = -1;
  for (let index = chatRequest.messages.length - 1; index >= 0; index -= 1) {
    if (chatRequest.messages[index]?.role === 'user') {
      lastUserIndex = index;
      break;
    }
  }
  const lastUserMsg = lastUserIndex >= 0 ? chatRequest.messages[lastUserIndex] : undefined;
  const lastUserText = lastUserMsg ? extractTextContent(lastUserMsg.content) : '';
  const autoMemoryFacts = prepareManagedAutoMemoryFacts({
    message: lastUserText,
    isTemporary: conversationIsTemporary,
    surface: resolveCloudChatSurface(request),
  });

  // The classifier contract expects PRIOR turns only; including the outgoing
  // user message here double-counted its tokens and could trigger long-context
  // routing prematurely. Multimodal parts are passed separately so Auto chooses
  // a vision-capable route before the provider call.
  const routingHistory = chatRequest.messages
    .slice(0, Math.max(lastUserIndex, 0))
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

  const routingAttachments = Array.isArray(lastUserMsg?.content)
    ? lastUserMsg.content
        .filter((part) => part.type === 'image_url' && typeof part.image_url?.url === 'string')
        .map((part) => {
          const dataMime = /^data:([^;,]+)/i.exec(part.image_url!.url)?.[1];
          return {
            mime: dataMime?.startsWith('image/') ? dataMime : 'image/*',
            type: 'image' as const,
          };
        })
    : undefined;

  let classifierResult = classifyTaskLocally(lastUserText, routingHistory, routingAttachments);

  if (routingHistory.length > 0) {
    const cumulativeTokens = routingHistory.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      estimateTokens(lastUserText),
    );
    const recentTaskTypes = routingHistory
      .filter((m) => m.role === 'user')
      .map((m) => classifyTaskLocally(m.content, []).type);
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

  // Usage-aware Auto: read the cheap single-row credit balance for paid users
  // so Auto prefers the best model the remaining budget still covers. Bias only,
  // and fail-open — a balance-read error just drops the signal (the durable
  // usage reservation below stays the hard limit). Free-trial users carry no
  // cents budget (they run on the free-trial token budget), so skip the read.
  let routeBudgetRemainingCents: number | undefined;
  if (!freeTrialEnabled) {
    try {
      const budgetBalance = await CreditService.getBalance(userId);
      if ((budgetBalance?.credits_allocated_cents ?? 0) > 0) {
        routeBudgetRemainingCents = budgetBalance?.credits_remaining_cents;
      }
    } catch (error) {
      logger.warn(
        { error, userId, requestId },
        'Usage-aware routing: balance read failed; routing without the affordability bias',
      );
    }
  }
  const routeEstimatedInputTokens = routingHistory.reduce(
    (sum, message) => sum + estimateTokens(message.content),
    estimateTokens(lastUserText),
  );

  // Canonical registry admission for both Auto aliases and explicit selections.
  // This is the same policy seam used by unified-chat/Desktop. It validates the
  // Web managed-cloud runtime profile, exact provider route, model lifecycle,
  // intrinsic capabilities, tier policy, and harness implementation status.
  const routeDecision = resolveWebCloudModelRoute(
    chatRequest.model,
    subscription.plan_tier,
    resolvedTaskType,
    {
      ...(routeBudgetRemainingCents !== undefined
        ? { budgetRemainingCents: routeBudgetRemainingCents }
        : {}),
      estimatedInputTokens: routeEstimatedInputTokens,
    },
  );
  if (routeDecision.status === 'unavailable') {
    logger.warn(
      {
        userId,
        requestId,
        requestedModel,
        taskType: resolvedTaskType,
        routeCode: routeDecision.code,
        reasons: routeDecision.reasons,
      },
      'Managed Web model route unavailable',
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'The selected model is not available for this task in Managed Web chat.',
            type: 'invalid_request_error',
            code: 'model_route_unavailable',
          },
        },
        { status: 422 },
      ),
    };
  }

  if (routeDecision.harnessId.endsWith('/media')) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'This request requires the managed media-generation endpoint.',
            type: 'invalid_request_error',
            code: 'model_route_requires_media_dispatch',
          },
        },
        { status: 422 },
      ),
    };
  }

  chatRequest.model = routeDecision.modelKey;

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
  const researchMode = chatRequest.research === true && (resolvedModelCaps?.search ?? false);
  if (researchMode) {
    applyResearchMode(chatRequest);
  }

  // Model tier access check
  if (!freeTrialEnabled && !checkModelTierAccess(chatRequest.model, subscription.plan_tier)) {
    // Lowercase key (e.g. 'pro') for clients to pattern-match on, alongside the
    // uppercased word used in the human-readable message below. Clients (mobile,
    // desktop, web) key their upgrade-prompt UI off this field the same way they
    // already do for the HTTP 429 paywall shape (`{kind:'paywall', requiredTier}`)
    // — before this field existed, a model-tier-gate rejection had no structured
    // way to tell it apart from a generic server error, so every client fell back
    // to a blank "Something went wrong" message instead of an actionable upgrade
    // prompt.
    const requiredTierKey = getMinimumRequiredTier(chatRequest.model) ?? 'pro';
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

  if (chatRequest.skill_name) {
    let managedSkillCatalog: Skill[];
    try {
      managedSkillCatalog = await getManagedSkillCatalog();
    } catch (error) {
      if (error instanceof SkillCatalogUnavailableError) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: {
                message: error.message,
                type: 'server_error',
                code: 'skill_catalog_unavailable',
              },
            },
            { status: 503 },
          ),
        };
      }
      throw error;
    }
    if (resolvedModelCaps?.tools === false) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: 'The selected model cannot load skills. Choose a tool-capable model.',
              type: 'invalid_request_error',
              code: 'skill_model_unsupported',
              param: 'model',
            },
          },
          { status: 422 },
        ),
      };
    }
    const selection = applyManagedSkillSelection(chatRequest, managedSkillCatalog);
    if (!selection.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: selection.message,
              type: 'invalid_request_error',
              code: selection.code,
              param: 'skill_name',
            },
          },
          { status: 422 },
        ),
      };
    }
  }

  if (chatRequest.office_creation) {
    if (!chatRequest.stream) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: 'Office file creation requires a streaming chat request.',
              type: 'invalid_request_error',
              code: 'office_creation_stream_required',
              param: 'stream',
            },
          },
          { status: 422 },
        ),
      };
    }
    if (resolvedModelCaps?.tools === false) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message:
                'The selected model cannot create Office files. Choose a tool-capable model.',
              type: 'invalid_request_error',
              code: 'office_creation_model_unsupported',
              param: 'model',
            },
          },
          { status: 422 },
        ),
      };
    }
    applyManagedOfficeFileCreation(chatRequest);
  }

  const originalModel = chatRequest.model;
  let usedFallback = false;
  let fallbackReason: string | undefined;

  let provider = routeDecision.provider;

  // Tier-aware quota gate
  const resolvedSlot: RoutingSlot | null = getSlotForModel(chatRequest.model);
  const isFlagshipRequest =
    resolvedSlot === 'flagship_coding_pro_plus' || resolvedSlot === 'flagship_general_pro_plus';

  let quotaFeature: QuotaFeature = 'chat';
  if (resolvedSlot === 'image_generation') {
    quotaFeature = 'image';
  } else if (resolvedSlot === 'video_generation' || resolvedSlot === 'video_generation_pro_plus') {
    quotaFeature = 'video';
  } else if (resolvedSlot === 'computer_use' || resolvedSlot === 'computer_use_premium') {
    quotaFeature = 'computer_use';
  }

  // The durable managed-usage reservation below is the sole paid usage gate.
  // Keeping the former token/daily assertQuota gate here created a second,
  // fail-open policy owner that could contradict the canonical 5-hour,
  // weekly, flagship-weekly, and billing-period spend caps.
  const quotaWarningHeader: string | null = null;

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

  // Token + cost estimation
  const rawEstimatedPromptTokens = collectManagedPromptMaterials(chatRequest).reduce(
    (sum, material) => {
      const baseTokens = Math.ceil(material.length / 3.5);
      const overheadTokens = 4;
      return sum + baseTokens + overheadTokens;
    },
    0,
  );
  // Clamp the prompt-token estimate to a realistic ceiling. No real prompt exceeds the
  // largest model context window (~1M tokens), so a larger figure is a malformed/runaway
  // estimate — and because this estimate drives the credit RESERVE, an inflated value
  // produced huge per-request charges (e.g. an unresolved "unknown"-model request reserving
  // $10+ that was never reconciled back down). The reserve is only an upper bound; the
  // post-response reconciliation settles the real cost from actual tokens, so clamping here
  // can only ever reduce an over-reserve, never under-charge a legitimate request.
  const MAX_ESTIMATED_PROMPT_TOKENS = 1_000_000;
  const estimatedPromptTokens = Math.min(rawEstimatedPromptTokens, MAX_ESTIMATED_PROMPT_TOKENS);

  const providerLower = provider.toLowerCase();

  // Capability honesty (QA 1.7.20 / 1.11.1), BEFORE any credit reservation: a
  // caller that explicitly asked to search must not receive a silent model-only
  // answer. Native-search providers (anthropic/google/openai) search in both
  // streaming and non-streaming paths, but every other provider searches only
  // through the generic fallback tool, which runs inside the agentic loop and
  // therefore requires streaming. So `web_search: true` on a generic-fallback
  // provider with `stream: false` would attach no search tool at all and answer
  // without browsing — reject it explicitly (mirrors office_creation_stream_required).
  if (chatRequest.web_search && !chatRequest.stream && webSearchNeedsGenericTool(providerLower)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message:
              'Web search on this provider requires a streaming chat request. Set stream: true.',
            type: 'invalid_request_error',
            code: 'web_search_stream_required',
            param: 'stream',
          },
        },
        { status: 422 },
      ),
    };
  }

  const effectiveEffort = resolveRequestEffort(
    providerLower,
    chatRequest.model,
    chatRequest.effort,
  );
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
  let managedUsage: ManagedUsageRequestReservation | undefined;

  if (freeTrialEnabled) {
    estimatedCostCents = 0;
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

    // The request claim and financial reserve are one RLS-bound database
    // transition. A concurrent/replayed key never reaches the provider twice.
    try {
      const scoped = userScopedDb ?? (await getUserScopedDb(request));
      if (scoped.userId !== userId) {
        throw new ManagedUsageRequestError(
          'Managed usage tenant mismatch.',
          403,
          'tenant_mismatch',
        );
      }
      managedUsage = await reserveManagedUsageRequest({
        db: scoped.db,
        userId,
        idempotencyKey: requestId,
        requestHash: managedRequestHash,
        provider,
        model: chatRequest.model,
        estimatedCostCents,
        leaseSeconds: resolveManagedUsageLeaseSeconds(chatRequest.work_mode),
        planTier: subscription.plan_tier,
        isFlagship: isFlagshipRequest,
      });
      estimatedCostCents = managedUsage.estimatedCostCents;
    } catch (error) {
      const managedError =
        error instanceof ManagedUsageRequestError
          ? error
          : new ManagedUsageRequestError(
              'Managed usage billing is temporarily unavailable.',
              503,
              'billing_unavailable',
            );
      return { ok: false, response: managedUsageErrorResponse(managedError) };
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

    // WP4 generic fallback: platform-executed `web_search` function tool for every
    // provider with no working native search path on this route (xai/deepseek/
    // qwen/moonshot/zhipu/mistral/groq/nvidia_nim/open_router, which never had
    // a native branch at all).
    // Executed by the agentic tool loop exactly like url_fetch below.
    if (
      shouldOfferGenericWebSearchTool({
        providerLower,
        toolsCapable: resolvedModelCaps?.tools ?? true,
        stream: chatRequest.stream,
        freeTrial: freeTrialEnabled,
        backendConfigured: webSearchBackendConfigured(),
      })
    ) {
      resolvedTools = [...(resolvedTools ?? []), webSearchToolDef()];
    }
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

  // Platform url_fetch tool: URL-fetch parity for every provider WITHOUT a native
  // web-fetch server tool (Anthropic keeps its native tool above). Executed by the
  // agentic tool loop (SSRF-guarded, read-only — auto-approved like E2B tools).
  //
  // Offer ⊆ run constraint (same as E2B): only offered on streaming requests
  // because only that path enters the tool loop in route.ts; offering it
  // elsewhere would inject a tool_call nothing executes. Gated on the resolved
  // model's `tools` capability (unknown models default to allowed so a missing
  // catalog entry never silently drops the tool).
  if (
    chatRequest.web_fetch &&
    providerLower !== 'anthropic' &&
    chatRequest.stream &&
    (resolvedModelCaps?.tools ?? true)
  ) {
    resolvedTools = [...(resolvedTools ?? []), urlFetchToolDef()];
  }

  if (chatRequest.code_execution) {
    // Code-execution router: tiered by provider when AGI_E2B_EXECUTION=1; native-always otherwise.
    //
    // E2B CUT-OVER (flag ON, streaming):
    //   - Anthropic + Google: free-native tier — they run code in their own sandboxes at no
    //     E2B credit cost, so we keep their provider-native tools.
    //   - OpenAI + everyone else: E2B-credit tier — routes to the platform-executed E2B sandbox
    //     (avoids OpenAI per-session fees; provides a sandbox for providers with no native exec).
    //
    // Model-agnostic: the E2B sandbox is platform-executed — it only needs the model to emit
    // tool calls, exactly like the url_fetch tool above — so it is gated on the `tools`
    // capability, NOT the per-model `codeExecution` cap. That lets tools-capable open-weight
    // models (kimi-k3, deepseek, qwen, glm…) that carry `codeExecution:false` (meaning "no
    // *native* interpreter", which stays truthful in the catalog) still run code in the shared
    // sandbox. The AGI_E2B_EXECUTION flag remains the single operator gate protecting
    // managed-compute billing/abuse. The NATIVE fallback path keeps the `codeExecution` cap:
    // only providers with a real native interpreter (anthropic/google/openai) resolve a tool;
    // everyone else fails closed.
    //
    // The offer is guarded to streaming only (offer⊆run constraint): E2B tools
    // are platform-executed and require the agentic loop to actually run them. That loop is only
    // entered on the streaming path in route.ts. Offering E2B tools on a non-streaming
    // request would inject a tool_call that nothing executes and stall the turn.
    //
    // FLAG OFF (default): byte-for-byte the pre-P3 behavior — the native path keyed on the
    // model's own `codeExecution` cap. See docs/plans/e2b-universal-execution-design-* for the
    // full design rationale.
    if (e2bCutoverEnabled() && providerRoutesToE2B(providerLower) && chatRequest.stream) {
      if (resolvedModelCaps?.tools ?? true) {
        resolvedTools = [...(resolvedTools ?? []), ...e2bExecutionToolDefs()];
      }
    } else if (resolvedModelCaps?.codeExecution ?? true) {
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
    effort: effectiveEffort,
    usePromptCache: chatRequest.use_prompt_cache,
  };

  if (freeTrialEnabled) {
    const trialReservationResult = await beginFreeTrialRequest({ userId, requestId });
    if (!trialReservationResult.ok) return freeTrialBudgetReachedResponse();

    freeTrial = trialReservationResult.reservation;
    const fitted = applyFreeTrialProviderBudget({
      reservation: freeTrial,
      provider,
      request: llmRequest,
    });
    if (!fitted.ok) {
      await settleFreeTrialRequest({ reservation: freeTrial, outcome: 'failed' });
      return freeTrialBudgetReachedResponse();
    }
    maxTokens = llmRequest.max_tokens;
  }

  return {
    ok: true,
    requestId,
    managedUsage,
    chatRequest,
    conversationId: chatRequest.conversation_id,
    autoMemoryFacts,
    requestedModel,
    provider,
    estimatedCostCents,
    estimatedPromptTokens,
    maxTokens,
    usedFallback,
    fallbackReason,
    originalModel,
    // The resolver already emits [] for explicit selections (rotation-free by
    // structure, not by a route.ts conditional); free-trial requests are
    // additionally pinned to their admitted model.
    fallbackModels: freeTrialEnabled
      ? []
      : routeDecision.fallbacks.map((fallback) => fallback.modelKey),
    subscriptionTier: subscription.plan_tier,
    resolvedTaskType,
    classifierConfidence: classifierResult.confidence,
    resolvedSlot,
    quotaFeature,
    quotaWarningHeader,
    isFlagshipRequest,
    researchMode,
    indicResult,
    freeTrial,
    llmRequest,
  };
}
