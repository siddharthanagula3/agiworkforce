import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { ResearchStep } from '@agiworkforce/types';
import { ToolCallResponseSchema } from '@/lib/validations/tool-calls';
import { AgiWorkGoalSchema } from './agiwork-plan';
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
  isAutoModeModelId,
  type Effort,
  getSlotForModel,
  normalizeModelId,
  canUseBillingPlanCapability,
  isValidIanaTimeZone,
} from '@agiworkforce/types';
import type { RoutingSlot, ThinkingBlock } from '@agiworkforce/types';
import {
  applyConversationContext,
  classifyTaskFamily,
  classifyTaskLocally,
  detectIndicScript,
  estimateTokens,
  resolveAutoRoute,
  taskFamilyRoutingStageEnabled,
} from '@agiworkforce/routing';
import type {
  RoutingAttachment,
  RoutingTaskType,
  TaskFamily,
  TaskFamilySignals,
} from '@agiworkforce/routing';
import { trimMessagesToContextWindow } from './context-window';
import { buildInterimRoutePlanId } from '@/lib/cpst-telemetry';
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
import { JSON_OBJECT_DIRECTIVE, wantsJsonObject } from './json-object-mode';
import {
  applyManagedMemoryContext,
  DISABLED_MANAGED_MEMORY_POLICY,
  formatManagedMemorySystemPrompt,
  loadManagedMemoryContext,
  loadManagedMemoryPolicy,
  type ManagedMemoryContextDb,
  type ManagedMemoryPolicy,
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
import { buildCapabilityPreamble } from './capability-preamble';
import {
  createManagedOfficeFileToolDefinition,
  MANAGED_OFFICE_FILE_TOOL_NAME,
} from '@/lib/services/managed-office-file-service';
import { ChatAttachmentHydrationError, hydrateChatAttachments } from './chat-attachment-hydration';
// PER-7: Settings promises "AGI will keep these in mind across chats"; this is
// the read side that makes that true (see the injection site below).
import { buildCustomInstructionsPreamble } from '@/lib/server/user-identity';
// GOV-18: real `X-Quota-Warning` derivation, replacing the hardcoded null.
import { buildQuotaWarningHeader } from '@/lib/server/managed-usage-policy';
import {
  enforceManagedContentSafetyPreference,
  ManagedContentSafetyPolicyError,
} from '@/lib/services/managed-content-safety-service';

// OpenAI-compatible request schema
export const ChatCompletionRequestSchema = z
  .object({
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
              file: z
                .object({
                  asset_id: z.string().uuid(),
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
    /*
     * CAPABILITY HONESTY: this field was once validated here and read nowhere
     * else, so a caller could ask for `json_object` / `json_schema`, receive
     * 200 OK, and get prose. Silently ignoring a structured-output request is
     * worse than refusing it — the caller's parser fails downstream with no
     * indication of why.
     *
     * `text` and `json_object` are now both REAL: `json_object` appends a
     * directive and the non-streaming response path parses and validates the
     * completion before returning it (`lib/json-object-mode.ts`), so a 200 with
     * `json_object` means the body genuinely parses as a JSON object.
     *
     * `json_schema` remains refused. Enforcing a caller-supplied schema needs
     * either native per-provider support — which differs in shape and coverage
     * across the providers this gateway routes to — or a validate-and-retry loop
     * that spends the caller's money on retries they did not ask for. Tool
     * calling (`tools` + `tool_choice`) IS wired and is the supported way to get
     * a schema-shaped payload today.
     */
    response_format: z
      .object({
        type: z.enum(['text', 'json_object', 'json_schema']).optional(),
        json_schema: z.unknown().optional(),
      })
      .refine((value) => value.type !== 'json_schema', {
        message:
          "response_format type 'json_schema' is not enforced on this endpoint, and " +
          'returning unvalidated output for a schema request would be silently wrong. ' +
          "Use type 'json_object' for a guaranteed JSON object, or `tools` with " +
          '`tool_choice` for a schema-shaped payload.',
        path: ['type'],
      })
      .optional(),
    seed: z.number().int().optional(),
    web_search: z.boolean().optional(),
    web_fetch: z.boolean().optional(),
    research: z.boolean().optional(),
    /**
     * CAP-045 slice 4: material carried forward when the user retries a research
     * run that errored or was interrupted. Purely additive and fully bounded —
     * the loop pre-seeds these sources into its aggregator (keeping their citation
     * numbers stable) and tells the model not to repeat the completed queries, so
     * a retry does not pay to re-run work that already succeeded.
     *
     * This is a HINT, not a grant: the retry still goes through the normal
     * request path, so reservation, metering, and every quota gate apply exactly
     * as they do to a first attempt.
     */
    research_resume: z
      .object({
        sources: z
          .array(
            z.object({
              url: z.string().trim().url().max(2000),
              title: z.string().max(500).optional(),
              snippet: z.string().max(2000).optional(),
            }),
          )
          .max(100)
          .optional(),
        steps: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(100),
              type: z.enum(['search', 'read', 'analyze', 'synthesize', 'verify']),
              description: z.string().trim().min(1).max(500),
              status: z.enum(['pending', 'running', 'completed', 'failed']),
            }),
          )
          .max(50)
          .optional(),
      })
      .optional(),
    code_execution: z.boolean().optional(),
    // Logical client selection only. The server owns the Office schemas,
    // generation runtime, storage target, and emitted file descriptors.
    office_creation: z.boolean().optional(),
    // Product mode, not a provider hint. `agiwork` is paid managed-cloud work
    // that exposes AGI's server-owned search/fetch/sandbox tools below.
    work_mode: z.enum(CLOUD_WORK_MODES).optional(),
    // CAP-048: the structured goal the composer captures in AGI Work mode. Purely
    // additive and fully bounded — the server stores it on the run's journal (so
    // `/tasks` can show WHICH task a run is) and threads it into the tool-free
    // planning turn. Ignored unless `work_mode === 'agiwork'`.
    agi_work_goal: AgiWorkGoalSchema.optional(),
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
    // Browser-reported IANA zone is a display/context hint only. The server's
    // clock remains authoritative and derives the corresponding local instant.
    client_timezone: z
      .string()
      .trim()
      .max(64)
      .refine(isValidIanaTimeZone, 'client_timezone must be a valid IANA time zone')
      .optional(),
    // Optional, additive: identifies the owned cloud conversation this request belongs to.
    // The processor verifies it against web_conversations.user_id before billing, provider,
    // tool, or E2B work. A conversation id is never an authorization token.
    conversation_id: z.string().uuid().optional(),
    // BUG-10/STR-5: the row id the CLIENT will use for this turn's assistant
    // message. Optional and additive. When present the server persists the
    // assistant turn itself (see assistant-turn-persistence.ts) under the SAME
    // id, so the server write and the client's own `/api/chat/conversations/
    // [id]/messages` upsert collapse into one row instead of duplicating the
    // turn in the transcript. Absent means the caller owns persistence.
    assistant_message_id: z.string().uuid().optional(),
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
  })
  .superRefine((value, ctx) => {
    /*
     * json_object cannot be honoured on a stream. A stream hands the caller
     * bytes as they arrive, so by the time the payload could be parsed it has
     * already been delivered; buffering the whole response to validate it would
     * make `stream: true` a lie. Refusing here — with the fix named — is the
     * only option that does not silently break one promise to keep the other.
     */
    if (value.response_format?.type === 'json_object' && value.stream) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['response_format', 'type'],
        message:
          "response_format type 'json_object' requires stream: false. A streamed " +
          'response is delivered before it can be validated as JSON, so the guarantee ' +
          'could not be kept.',
      });
    }
  });

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export type ManagedSkillSelectionResult =
  | { ok: true }
  | { ok: false; code: 'skill_not_found'; message: string };

type QuotaFeature = 'chat' | 'image' | 'video' | 'computer_use';

/** Explicit execution verbs paired with an executable subject. */
const RE_CODE_EXECUTION_ACTION = /\b(run|execute|test|benchmark)\b/i;
const RE_CODE_EXECUTION_SUBJECT =
  /\b(code|script|program|python|javascript|typescript|sql|notebook|command)\b|```/i;

/** Data-analysis requests that require an interpreter rather than prose-only reasoning. */
const RE_DATA_EXECUTION_ACTION = /\b(analyze|calculate|compute|process|plot|chart)\b/i;
const RE_DATA_EXECUTION_SUBJECT = /\b(data|dataset|csv|spreadsheet|table|statistics?)\b/i;

/** Editable Office deliverables supported by the canonical managed Office tool. */
const RE_OFFICE_CREATION_ACTION = /\b(create|generate|make|prepare|produce|export|build)\b/i;
const RE_OFFICE_CREATION_ARTIFACT =
  /\.(docx|pptx)\b|\b(word document|powerpoint|slide deck|presentation|office file)\b/i;

/** A supplied URL is fetched only when the user explicitly asks us to inspect it. */
const RE_HTTP_URL = /https?:\/\/[^\s<>"']+/i;
const RE_URL_FETCH_ACTION = /\b(read|summarize|analyse|analyze|review|check|inspect|open|fetch)\b/i;

export type ImplicitManagedToolIntentContext = {
  prompt: string;
  taskType: RoutingTaskType;
  planTier: string | null | undefined;
};

/**
 * Infer safe, reversible tool availability from explicit user intent.
 *
 * This is server-owned product policy because Web, Desktop Cloud, and Mobile
 * Cloud share this request boundary. The model still decides whether to call
 * an offered tool; this function never executes a tool by itself. Normal-chat
 * execution remains metered by the plan's usage limits, while the separate
 * long-running AGI Work mode remains Pro-and-above (`agi_work` capability) and
 * explicitly user-selected.
 */
export function applyImplicitManagedToolIntent(
  request: ChatCompletionRequest,
  context: ImplicitManagedToolIntentContext,
): void {
  if (request.web_search === undefined && context.taskType === 'research') {
    request.web_search = true;
  }

  // The platform-executed tool loop is a streaming contract. Do not turn a
  // valid non-streaming API request into a downstream 422 implicitly.
  if (!request.stream) return;

  if (
    request.web_fetch === undefined &&
    RE_HTTP_URL.test(context.prompt) &&
    RE_URL_FETCH_ACTION.test(context.prompt)
  ) {
    request.web_fetch = true;
  }

  if (
    request.office_creation === undefined &&
    RE_OFFICE_CREATION_ACTION.test(context.prompt) &&
    RE_OFFICE_CREATION_ARTIFACT.test(context.prompt)
  ) {
    request.office_creation = true;
  }

  const hasExplicitCodeExecutionIntent =
    (RE_CODE_EXECUTION_ACTION.test(context.prompt) &&
      RE_CODE_EXECUTION_SUBJECT.test(context.prompt)) ||
    (RE_DATA_EXECUTION_ACTION.test(context.prompt) &&
      RE_DATA_EXECUTION_SUBJECT.test(context.prompt));

  if (request.code_execution === undefined && hasExplicitCodeExecutionIntent) {
    request.code_execution = true;
  }
}

/**
 * Make explicit tool modes part of Auto's route decision. The classifier only
 * sees message prose, so without this step a user could enable Deep Research,
 * Office creation, or Run code and still be routed to a model that cannot
 * execute the selected mode.
 */
export function resolveToolAwareTaskType(
  classifiedTaskType: RoutingTaskType,
  request: Pick<
    ChatCompletionRequest,
    'research' | 'work_mode' | 'office_creation' | 'code_execution'
  >,
): RoutingTaskType {
  if (request.research === true) return 'research';
  if (request.work_mode === 'agiwork' || request.office_creation === true) return 'agentic';
  if (request.code_execution === true) return 'coding';
  return classifiedTaskType;
}

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
  chatRequest.messages.unshift({
    role: 'system',
    content:
      'AGI Work mode is active. Always call an appropriate available tool before ' +
      'responding. Complete requested actions and file creation with the tools; do not ' +
      'merely describe the work or claim that tools are unavailable.',
  });
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
 * Keep ordinary request recovery responsive while giving durable agent runs
 * enough time to span many bounded invocations without the billing recovery job
 * classifying an active run as abandoned.
 *
 * The long lease used to be AGI Work's alone, which was correct while AGI Work
 * was the only thing that ran on the durable transport. It no longer is: an
 * ordinary chat turn that reaches for a tool now runs as a durable workflow too
 * (`AGI_DURABLE_INITIAL_TURNS`), chaining bounded ~210 s invocations without
 * settling in between. A chain of five is already past the 900 s lease, at which
 * point `recover_stale_managed_usage_requests` would refund a reservation whose
 * run is still executing — silently, and in the customer's favour, so nothing
 * would ever surface it.
 *
 * So the lease follows the transport, not the label: any turn that can enter the
 * tool loop gets the long lease. Plain chat, which never goes durable and is
 * capped by the route's own `maxDuration`, keeps the responsive one.
 */
export function resolveManagedUsageLeaseSeconds(
  chatRequest: Pick<ChatCompletionRequest, 'work_mode' | 'tools' | 'web_search' | 'code_execution'>,
): number {
  const canEnterToolLoop =
    chatRequest.work_mode === 'agiwork' ||
    (Array.isArray(chatRequest.tools) && chatRequest.tools.length > 0) ||
    chatRequest.web_search === true ||
    chatRequest.code_execution === true;
  return canEnterToolLoop ? 86_400 : 900;
}

export type ProcessedRequest = {
  requestId: string;
  /** Durable paid-request lifecycle; absent only for the free-trial path. */
  managedUsage?: ManagedUsageRequestReservation;
  chatRequest: ChatCompletionRequest;
  /** Conversation this request belongs to, if the caller sent one (see conversation_id). */
  conversationId: string | undefined;
  /**
   * BUG-10/STR-5: true when the owned conversation is a Temporary Chat.
   * Server-side assistant-turn persistence is skipped for them, matching the
   * client and the Temporary Chat contract.
   */
  conversationIsTemporary?: boolean;
  /**
   * BUG-10/STR-5: caller-supplied row id for this turn's assistant message.
   * The single join key that lets the server-side write and the client-side
   * write be the same row. Absent for callers that own persistence entirely.
   */
  assistantMessageId?: string | undefined;
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
  /**
   * CPST Stage-0 telemetry, MANAGED CLOUD ONLY
   * (docs/design/execution-plan-contract-and-cpst-2026-08-05.md §4.2/§4.3).
   * Interim route identity for the resolved route, built by
   * `buildInterimRoutePlanId`. It is NOT an `ExecutionPlan` id — that contract
   * does not exist yet (§3) — and is self-labelled `interim:` so no consumer
   * mistakes it for one. Persisted into the managed-usage `usage` jsonb at
   * finalize time and never used to make a routing decision. Optional for the
   * same additive-schema reason as the fields above: absent means unknown.
   */
  routePlanId?: string;
  /**
   * CPST Stage-0 telemetry, MANAGED CLOUD ONLY: additional provider attempts
   * inside THIS billed request, incremented only by `buildFailoverAttemptView`
   * (lib/managed-failover.ts), which is the sole place an extra attempt is
   * created. Absent when no rotation happened — task-scoped retry counting
   * needs the task identifier the design document leaves undecided (OQ-6), so
   * absence is recorded as unknown rather than asserted as zero.
   */
  retries?: number;
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
  /**
   * CAP-045 slice 4: validated retry material (`research_resume`), surfaced only
   * when this really is a research request. route.ts seeds the loop with it.
   */
  researchResume?: {
    sources: Array<{ url: string; title?: string; snippet?: string }>;
    steps: ResearchStep[];
  };
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

const EFFORT_VALUES: ReadonlySet<string> = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

function normalizeEffort(value: string | undefined): Effort | undefined {
  const normalized = value?.toLowerCase();
  return normalized && EFFORT_VALUES.has(normalized) ? (normalized as Effort) : undefined;
}

function modelSupportsEffort(provider: string, model: string): boolean {
  const metadata = getModelMetadataById(model);
  if (metadata) {
    const request = metadata.reasoning?.request;
    return Boolean(request?.effortPath || request?.responsesEffortPath);
  }
  return provider === 'anthropic' || provider === 'openai' || provider === 'google';
}

/**
 * An explicit "Run code" request is a product instruction, not merely a hint
 * that the model may ignore. Platform-executed E2B tools are ordinary function
 * tools, so require one tool call on the first provider step when that mode is
 * enabled. Native provider sandboxes keep their existing provider-specific
 * behavior, and an API caller's explicit tool_choice always wins.
 * Anthropic stays on `auto`: official Claude model compatibility lists Haiku
 * 4.5 as supporting only `auto` and `none`, so forcing `required` would turn a
 * valid E2B request into a provider 400. AGI Work's server-owned prompt gives
 * Claude the corresponding strong tool-use instruction instead.
 */
export function resolveInitialManagedCodeToolChoice(input: {
  requestedToolChoice: ChatCompletionRequest['tool_choice'];
  codeExecution: boolean | undefined;
  stream: boolean | undefined;
  provider: string;
  e2bEnabled: boolean;
  toolsCapable: boolean;
}): ChatCompletionRequest['tool_choice'] {
  if (input.requestedToolChoice !== undefined) return input.requestedToolChoice;
  if (
    input.codeExecution === true &&
    input.stream === true &&
    input.e2bEnabled &&
    input.toolsCapable &&
    input.provider.toLowerCase() !== 'anthropic' &&
    providerRoutesToE2B(input.provider)
  ) {
    return 'required';
  }
  return undefined;
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
 * API generation (Opus 5, Sonnet 4.6) vs the classic manual
 * `thinking:{type:"enabled",budget_tokens}` generation (Haiku 4.5).
 *
 * CRITICAL: keys off the per-model `reasoning.control`, NOT just
 * `capabilities.thinking`. Opus 5 REJECTS the classic enabled+budget shape with
 * a 400; Haiku 4.5 is classic-only. Before this was control-aware, flipping
 * Haiku's `capabilities.thinking` to true (correct — it does think) would have
 * routed Haiku through `{type:"adaptive"}`, which is unverified on Haiku. Matrix
 * flag 3 + docs/research/reasoning-effort-capability-matrix-2026-07-10.md.
 *
 * The lookup uses `getModelMetadataById`, so request behavior comes from the
 * canonical catalog instead of model-family string matching. This matters for
 * Opus 5 because a manual enabled+budget block would be rejected by the live
 * provider contract.
 */
export function anthropicUsesAdaptiveThinking(model: string): boolean {
  const metadata = getModelMetadataById(model);
  if (metadata?.provider !== 'anthropic' || !metadata.capabilities.thinking) return false;
  if (metadata.reasoning?.thinkingDefault === 'adaptive') return true;
  const control = metadata.reasoning?.control;
  // effort_levels ⇒ adaptive+output_config.effort (Opus 5 / Sonnet 5).
  // thinking_budget ⇒ classic enabled+budget (Haiku 4.5) — NOT adaptive.
  if (control === 'thinking_budget') return false;
  return true;
}

const EFFORT_ORDER: readonly Effort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

function effortExceeds(effort: Effort | undefined, maximum: Effort | undefined): boolean {
  if (!effort || !maximum) return false;
  return EFFORT_ORDER.indexOf(effort) > EFFORT_ORDER.indexOf(maximum);
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

  const reasoning = getModelReasoning(model);
  const usesAdaptive = anthropicUsesAdaptiveThinking(model);
  const explicitlyDisabled =
    explicitThinking?.type === 'disabled' ||
    (explicitThinking === undefined && thinkingMode === false);

  if (explicitlyDisabled) {
    if (reasoning.canDisableThinking === false) {
      throw new Error(`Thinking cannot be disabled for ${model}.`);
    }
    if (effortExceeds(effort, reasoning.maxEffortWhenThinkingDisabled)) {
      throw new Error(
        `Thinking is disabled for ${model}; effort must be ${reasoning.maxEffortWhenThinkingDisabled} or lower.`,
      );
    }
    return { type: 'disabled' };
  }

  if (explicitThinking) {
    if (
      usesAdaptive &&
      (reasoning.supportsManualThinking === false || explicitThinking.type !== 'adaptive')
    ) {
      return { type: 'adaptive' };
    }
    return explicitThinking;
  }

  if (thinkingMode !== true) return undefined;

  if (usesAdaptive) return { type: 'adaptive' };

  // Classic manual budget (Haiku 4.5, control=thinking_budget). Clamp the
  // effort→budget preset to the model's declared thinkingBudget.max so a high
  // effort can't exceed what the model accepts (Haiku max 32768 < the 'max'
  // preset 65536). Matrix: Haiku budget min ~1024 / model-max.
  const budgetMax = getModelReasoning(model).thinkingBudget?.max;
  const budgetEffort = effort === 'none' || effort === 'minimal' ? 'medium' : (effort ?? 'medium');
  const preset = ANTHROPIC_THINKING_BUDGET[budgetEffort];
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
  policy: ManagedMemoryPolicy;
}): string[] {
  if (
    !params.policy.enabled ||
    !params.policy.generateFromHistory ||
    params.isTemporary ||
    params.surface === 'api'
  ) {
    return [];
  }
  return extractCandidateMemoryFacts(params.message).slice(0, 5);
}

/**
 * Conservative generation-scope boundary. A turn that requests or is offered
 * any tool/search/work runtime is treated as tool-assisted; when the user has
 * not opted in, over-blocking generation is safer than persisting a fact from
 * an assisted turn whose terminal callback cannot reconstruct every tool call.
 */
export function isManagedMemoryToolAssistedTurn(
  request: ChatCompletionRequest,
  resolvedTools: readonly unknown[] | undefined,
): boolean {
  return Boolean(
    request.web_search ||
    request.web_fetch ||
    request.research ||
    request.code_execution ||
    request.office_creation ||
    request.work_mode === 'agiwork' ||
    (resolvedTools?.length ?? 0) > 0,
  );
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
/**
 * Mutates chatRequest in place: appends the json_object directive to the system
 * context. Same shape as `applyResearchMode` below.
 *
 * The directive is only half the guarantee — models ignore it often enough that
 * an instruction alone would be exactly the silent-wrongness this mode replaced.
 * The other half is `extractJsonObject` in the non-streaming response path,
 * which parses the completion before it is returned. Neither half is optional.
 */
export function applyJsonObjectMode(chatRequest: ChatCompletionRequest): void {
  const firstMessage = chatRequest.messages[0];
  if (firstMessage?.role === 'system' && typeof firstMessage.content === 'string') {
    // Appended, not prepended: the closing instruction about output format is
    // the one the model should read last.
    firstMessage.content = `${firstMessage.content}\n\n${JSON_OBJECT_DIRECTIVE}`;
  } else {
    chatRequest.messages.unshift({ role: 'system', content: JSON_OBJECT_DIRECTIVE });
  }
}

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
  options: { researchMode?: boolean } = {},
): unknown[] | undefined {
  if (!(caps?.search ?? true)) return tools;
  if (providerLower === 'anthropic') {
    return [
      ...(tools ?? []),
      {
        type: 'web_search_20260209',
        name: 'web_search',
        allowed_callers: ['direct'],
        max_uses: options.researchMode ? 20 : 3,
      },
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

function modelHasNativeAnthropicWebFetch(model: string): boolean {
  const metadata = getModelMetadataById(model);
  return (
    metadata?.provider === 'anthropic' && metadata.providerCompatibility?.nativeWebFetch !== false
  );
}

/**
 * Resolve URL-fetch tooling without pretending every Anthropic model supports
 * Anthropic's native server tool. Models that explicitly opt out use AGI's
 * platform-executed, SSRF-guarded `url_fetch` function in the streaming tool
 * loop, just like non-Anthropic providers.
 */
export function resolveWebFetchTools({
  providerLower,
  model,
  tools,
  toolsCapable,
  stream,
}: {
  providerLower: string;
  model: string;
  tools: unknown[] | undefined;
  toolsCapable: boolean;
  stream: boolean | undefined;
}): unknown[] | undefined {
  if (!toolsCapable) return tools;

  if (providerLower === 'anthropic' && modelHasNativeAnthropicWebFetch(model)) {
    return [
      ...(tools ?? []),
      { type: 'web_fetch_20260209', name: 'web_fetch', allowed_callers: ['direct'] },
    ];
  }

  return stream ? [...(tools ?? []), urlFetchToolDef()] : tools;
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

/**
 * Structural signals for the deterministic task-family fast path
 * (`packages/ai/routing/src/task-family.ts`).
 *
 * Reads only fields this request already carries — the work-mode toggle, the
 * explicit tool toggles, the caller's tool surface, attachment kinds, the token
 * and character lengths already computed for routing, and the canonical
 * runtime profile. It never reads message prose: the prose classifier is
 * `classifyTaskLocally`, and duplicating it here would create a second,
 * silently diverging one.
 *
 * `web/cloud-chat` is passed as the surface because that is the runtime profile
 * `resolveWebCloudModelRoute` hardcodes; the family stage records it and does
 * not branch on it.
 */
export function buildTaskFamilySignals(
  request: Pick<
    ChatCompletionRequest,
    | 'work_mode'
    | 'research'
    | 'web_search'
    | 'web_fetch'
    | 'code_execution'
    | 'office_creation'
    | 'tools'
    | 'tool_choice'
    | 'thinking_mode'
  >,
  context: {
    attachments?: readonly RoutingAttachment[] | undefined;
    estimatedInputTokens: number;
    messageCharCount: number;
    priorTurnCount: number;
  },
): TaskFamilySignals {
  return {
    ...(request.work_mode !== undefined ? { workMode: request.work_mode } : {}),
    ...(request.research !== undefined ? { researchMode: request.research } : {}),
    ...(request.web_search !== undefined ? { webSearch: request.web_search } : {}),
    ...(request.web_fetch !== undefined ? { webFetch: request.web_fetch } : {}),
    ...(request.code_execution !== undefined ? { codeExecution: request.code_execution } : {}),
    ...(request.office_creation !== undefined ? { officeCreation: request.office_creation } : {}),
    ...(request.tools !== undefined ? { declaredToolCount: request.tools.length } : {}),
    ...(request.tool_choice !== undefined
      ? { toolChoiceForced: request.tool_choice !== 'none' }
      : {}),
    ...(request.thinking_mode !== undefined ? { thinkingMode: request.thinking_mode } : {}),
    ...(context.attachments !== undefined ? { attachments: context.attachments } : {}),
    estimatedInputTokens: context.estimatedInputTokens,
    messageCharCount: context.messageCharCount,
    priorTurnCount: context.priorTurnCount,
    runtimeProfileId: 'web/cloud-chat',
  };
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
    /**
     * Deterministic task family, or `null`/omitted when the fast path
     * declined. Never changes `taskType` and never changes admission — it only
     * lets Auto order the candidate set the task type already produced, and
     * only when `AGI_ROUTING_TASK_FAMILY_STAGE=1`.
     */
    taskFamily?: TaskFamily | null;
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
    ...(usage?.taskFamily !== undefined ? { taskFamily: usage.taskFamily } : {}),
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
      // composer's project picker would be cosmetic. This fails closed: a
      // project-scoped turn must never silently run without its requested
      // instructions, sources, and relevant conversation history.
      if (ownedRows[0].project_id) {
        try {
          const projectContext = await loadProjectContext(userScopedDb.db, {
            projectId: ownedRows[0].project_id,
            userId,
            currentConversationId: ownedRows[0].id,
            currentUserQuery: extractTextContent(
              [...chatRequest.messages].reverse().find((message) => message.role === 'user')
                ?.content ?? '',
            ),
          });
          if (!projectContext) {
            return {
              ok: false,
              response: NextResponse.json(
                {
                  error: {
                    message:
                      'This project is archived, deleted, or unavailable. Remove the conversation from the project or restore the project before retrying.',
                    type: 'invalid_request_error',
                    code: 'project_context_unavailable',
                  },
                },
                { status: 409 },
              ),
            };
          }
          const projectPrompt = formatProjectSystemPrompt(projectContext);
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
            'Project context load failed',
          );
          return {
            ok: false,
            response: NextResponse.json(
              {
                error: {
                  message:
                    'Project context could not be loaded. No unscoped response was generated; retry when project sources are available.',
                  type: 'server_error',
                  code: 'project_context_load_failed',
                },
              },
              { status: 503 },
            ),
          };
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

  try {
    userScopedDb ??= await getUserScopedDb(request);
    if (userScopedDb.userId !== userId) {
      throw new ManagedContentSafetyPolicyError('Managed content safety owner mismatch');
    }
    const latestUserPrompt = extractTextContent(
      [...chatRequest.messages].reverse().find((message) => message.role === 'user')?.content ?? '',
    );
    const contentSafety = await enforceManagedContentSafetyPreference(userScopedDb.db, {
      userId,
      prompt: latestUserPrompt,
    });
    if (!contentSafety.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: contentSafety.refusal,
              type: 'invalid_request_error',
              code: 'reduce_sensitive_content',
            },
          },
          { status: 422 },
        ),
      };
    }
  } catch (error) {
    logger.error({ error, userId }, 'Managed content safety preference could not be enforced');
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message:
              'Your content safety preference could not be verified. No model request was sent.',
            type: 'server_error',
            code: 'content_safety_preference_unavailable',
          },
        },
        { status: 503 },
      ),
    };
  }

  try {
    await hydrateChatAttachments(chatRequest.messages, userId);
  } catch (error) {
    if (error instanceof ChatAttachmentHydrationError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: error.message,
              type: 'invalid_request_error',
              code: error.code,
            },
          },
          { status: error.status },
        ),
      };
    }
    logger.error({ error, userId }, 'Chat attachment hydration failed');
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'Attached files could not be loaded.',
            type: 'server_error',
            code: 'attachment_load_unavailable',
          },
        },
        { status: 503 },
      ),
    };
  }

  // Managed account memory is server-owned context shared by every Cloud
  // client. Temporary Chats deliberately opt out. Loading is best-effort so a
  // memory-store outage cannot take down an otherwise valid chat turn, while
  // owner mismatch always fails closed by skipping enrichment.
  let managedMemoryPolicy = DISABLED_MANAGED_MEMORY_POLICY;
  if (!conversationIsTemporary) {
    try {
      userScopedDb ??= await getUserScopedDb(request);
      if (userScopedDb.userId !== userId) {
        logger.error(
          { userId, scopedUserId: userScopedDb.userId },
          'Managed memory owner mismatch; continuing without account memory',
        );
      } else {
        managedMemoryPolicy = await loadManagedMemoryPolicy(userScopedDb.db, {
          userId,
        });
        if (managedMemoryPolicy.enabled) {
          await enrichManagedMemoryContext({
            db: userScopedDb.db,
            userId,
            chatRequest,
            isTemporary: false,
          });
        }
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
  let autoMemoryFacts = prepareManagedAutoMemoryFacts({
    message: lastUserText,
    isTemporary: conversationIsTemporary,
    surface: resolveCloudChatSurface(request),
    policy: managedMemoryPolicy,
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

  let resolvedTaskType: RoutingTaskType = classifierResult.type;

  applyImplicitManagedToolIntent(chatRequest, {
    prompt: lastUserText,
    taskType: resolvedTaskType,
    planTier: subscription.plan_tier,
  });
  resolvedTaskType = resolveToolAwareTaskType(resolvedTaskType, chatRequest);

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

  // Deterministic task-family fast path. Computed ONLY when the operator flag
  // is on, so with the flag off (the default) this path is byte-for-byte the
  // previous behaviour: no classification runs, no family reaches Auto, and
  // the resolver takes its `task_family_stage_disabled` branch. The family
  // refines the already-computed `resolvedTaskType`; it never replaces it and
  // never participates in admission.
  const routeTaskFamily: TaskFamily | null = taskFamilyRoutingStageEnabled()
    ? classifyTaskFamily(
        buildTaskFamilySignals(chatRequest, {
          attachments: routingAttachments,
          estimatedInputTokens: routeEstimatedInputTokens,
          messageCharCount: lastUserText.length,
          priorTurnCount: routingHistory.length,
        }),
      ).family
    : null;

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
      taskFamily: routeTaskFamily,
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

  // json_object mode: append the output-format directive. Placed BEFORE the
  // research block reads nothing from it and AFTER validation, so it applies to
  // exactly the requests that asked for it. The directive alone is not the
  // guarantee — `extractJsonObject` validates the completion before it is
  // returned (see `lib/json-object-mode.ts`).
  if (wantsJsonObject(chatRequest.response_format)) {
    applyJsonObjectMode(chatRequest);
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
  if (
    !freeTrialEnabled &&
    !isAutoModeModelId(requestedModel) &&
    !checkModelTierAccess(chatRequest.model, subscription.plan_tier)
  ) {
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
  // GOV-18: assigned below, once the billing-period credit balance has been
  // read — `buildQuotaWarningHeader` needs plan tier AND used/allocated cents,
  // neither of which exists this early. Declared here so it stays in scope for
  // every emit site that reads it off the processed request.
  let quotaWarningHeader: string | null = null;

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
  if (
    chatRequest.web_fetch &&
    !chatRequest.stream &&
    !(providerLower === 'anthropic' && modelHasNativeAnthropicWebFetch(chatRequest.model))
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'Web fetch on this model requires a streaming chat request. Set stream: true.',
            type: 'invalid_request_error',
            code: 'web_fetch_stream_required',
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
  let thinkingConfig: ReturnType<typeof buildThinkingConfig>;
  try {
    thinkingConfig = buildThinkingConfig({
      provider: providerLower,
      model: chatRequest.model,
      explicitThinking: chatRequest.thinking,
      thinkingMode: chatRequest.thinking_mode,
      effort: effectiveEffort,
    });
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: error instanceof Error ? error.message : 'Invalid thinking configuration.',
            type: 'invalid_request_error',
            code: 'invalid_thinking_configuration',
            param: 'thinking_mode',
          },
        },
        { status: 422 },
      ),
    };
  }

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
        leaseSeconds: resolveManagedUsageLeaseSeconds(chatRequest),
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

    // GOV-18: derive the advisory `X-Quota-Warning` value for this admitted
    // request. Placed here because it is the first point where BOTH the plan
    // tier and the billing-period credit balance are known, and where
    // `estimatedCostCents` is the reservation-adjusted figure, so the warning
    // projects the request being admitted rather than the pre-reservation
    // guess. Free-trial requests are skipped: they run on the token budget,
    // not the cents ledger, so there is no allocation to be a percentage of.
    // Rolling 5-hour/weekly observations are not read here (this path never
    // loads them); the billing-period window alone still warns, and
    // `buildQuotaWarningHeader` returns null for uncapped tiers.
    quotaWarningHeader = buildQuotaWarningHeader({
      planTier: subscription.plan_tier,
      creditsUsedCents: existingBalance?.credits_used_cents ?? 0,
      creditsAllocatedCents: existingBalance?.credits_allocated_cents ?? 0,
      estimatedCostCents,
    });
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
    resolvedTools = appendWebSearchTool(providerLower, resolvedTools, resolvedModelCaps, {
      researchMode,
    });

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

  if (chatRequest.web_fetch) {
    resolvedTools = resolveWebFetchTools({
      providerLower,
      model: chatRequest.model,
      tools: resolvedTools,
      toolsCapable: resolvedModelCaps?.tools ?? true,
      stream: chatRequest.stream,
    });
  }

  if (chatRequest.code_execution) {
    // Code-execution router: tiered by provider when AGI_E2B_EXECUTION=1; native-always otherwise.
    //
    // E2B CUT-OVER (flag ON, streaming): every tools-capable provider uses the
    // same platform sandbox so execution events and durable files behave the
    // same on Web, Desktop, and Mobile. Provider-native tools remain the
    // operator-controlled flag-off fallback.
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

  if (
    !managedMemoryPolicy.allowToolAssistedGeneration &&
    isManagedMemoryToolAssistedTurn(chatRequest, resolvedTools)
  ) {
    autoMemoryFacts = [];
  }

  // AUDIT-FIX SYS-1/SYS-2/SYS-3/SYS-5: prepend the base capability preamble.
  //
  // This route previously assembled NO unconditional system prompt — every
  // role:'system' injection was mode-specific (research, AGI Work, skills,
  // project context, memory), so an ordinary chat turn reached the provider
  // with no identity, no date and no tool inventory. Tools were attached and
  // never described, which is why the model denied having a sandbox or file
  // system while execute_code and write_file sat in its tool array.
  //
  // It is built HERE, after every tool gate has run, precisely because
  // `internalMessages` was snapshotted from chatRequest.messages above: any
  // injection made before `resolvedTools` is final would describe a tool set
  // that does not match the request. Unshifting onto the already-built array
  // keeps the preamble first without reordering the existing mode prompts,
  // which continue to follow it.
  //
  // Skipped for surface 'api': that is the public OpenAI-compatible endpoint,
  // where a third-party integrator owns their own prompt and would not expect
  // us to prepend one.
  if (resolveCloudChatSurface(request) !== 'api') {
    const capabilityPreamble = buildCapabilityPreamble({
      tools: resolvedTools,
      timeZone: chatRequest.client_timezone,
    });

    // PER-7: append the user's standing "Instructions for AGI" to the base
    // preamble. Settings persists them and tells the user "AGI will keep these
    // in mind across chats", but until this call no request path ever read the
    // value, so the promise was false and the feature shipped inert.
    //
    // Appended to the capability preamble (rather than unshifted separately)
    // so the model sees identity/date/tools first and the user's preferences
    // as a trailing block of the same system turn — and so a user who has
    // written no instructions produces byte-identical output to before.
    // `buildCustomInstructionsPreamble` degrades to null on any read failure,
    // so a settings outage drops the block instead of failing the turn.
    // Skipped for surface 'api' along with the rest of the preamble: a
    // third-party integrator owns their own prompt.
    const customInstructionsPreamble = await buildCustomInstructionsPreamble(userId);
    const preamble = [capabilityPreamble, customInstructionsPreamble]
      .filter((block): block is string => Boolean(block))
      .join('\n\n');

    if (preamble) {
      internalMessages.unshift({
        role: 'system',
        content: preamble,
        multimodal_content: undefined,
        tool_calls: undefined,
        tool_call_id: undefined,
      });
    }
  }

  const llmRequest = {
    model: chatRequest.model,
    messages: internalMessages,
    temperature: chatRequest.temperature,
    max_tokens: maxTokens,
    stream: chatRequest.stream,
    tools: resolvedTools as unknown[] | undefined,
    tool_choice: resolveInitialManagedCodeToolChoice({
      requestedToolChoice: chatRequest.tool_choice,
      codeExecution: chatRequest.code_execution,
      stream: chatRequest.stream,
      provider: providerLower,
      e2bEnabled: e2bCutoverEnabled(),
      toolsCapable: resolvedModelCaps?.tools ?? true,
    }),
    thinking_mode: chatRequest.thinking_mode,
    thinking: thinkingConfig,
    effort: effectiveEffort,
    usePromptCache: chatRequest.use_prompt_cache,
  };

  // AUDIT-FIX SYS-16: fit the thread to the RESOLVED model's context window
  // before it ever reaches a provider. Nothing did this, so a long chat was
  // shipped verbatim and the provider rejected the whole request. Mutates
  // `internalMessages` (llmRequest.messages) in place, so every downstream
  // path -- standard single turn, tool loop, research loop -- inherits the
  // fitted thread. No-ops when the model carries no catalog contextWindow.
  trimMessagesToContextWindow(internalMessages, chatRequest.model, maxTokens);

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
    conversationIsTemporary,
    assistantMessageId: chatRequest.assistant_message_id,
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
    // CPST Stage-0 (managed cloud only): the resolver's route identity was
    // computed and then discarded. Recording it costs nothing and changes no
    // decision — it is the interim stand-in for the not-yet-existing
    // ExecutionPlan id.
    routePlanId: buildInterimRoutePlanId(routeDecision),
    resolvedTaskType,
    classifierConfidence: classifierResult.confidence,
    resolvedSlot,
    quotaFeature,
    quotaWarningHeader,
    isFlagshipRequest,
    researchMode,
    // Retry material is only meaningful for a research run; a non-research
    // request that sends it gets it dropped rather than silently applied.
    ...(researchMode && chatRequest.research_resume
      ? {
          researchResume: {
            sources: chatRequest.research_resume.sources ?? [],
            steps: (chatRequest.research_resume.steps ?? []) as ResearchStep[],
          },
        }
      : {}),
    indicResult,
    freeTrial,
    llmRequest,
  };
}
