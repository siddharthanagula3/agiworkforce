import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { ResearchStep } from '@agiworkforce/types';
import { ToolCallResponseSchema } from '@/lib/validations/tool-calls';
import { modelSupportsResearch } from '@/features/chat/lib/research-capability-gate';
import { AgiWorkGoalSchema } from './agiwork-plan';
import { demoteLowConfidencePremiumSelection } from './route-selection';
import { MAX_MESSAGE_LENGTH, ToolChoiceSchema, ToolDefinitionSchema } from '@/lib/validations/llm';
import { logger } from '@/lib/logger';
import { resolveTurnCodeExecutionTools, providerRoutesToE2B } from '@/lib/e2b/execution-tools';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { webSearchToolDef, webSearchBackendConfigured } from '@/lib/web-search/web-search-tool';
import { peekGroundingPool } from '@/lib/web-search/grounding-pool';
import {
  REQUIRED_SEARCH_SYSTEM_NUDGE,
  resolveRequiredSearchEnforcement,
  resolveWebSearchRequirement,
  type RequiredSearchEnforcement,
  type WebSearchRequirement,
} from '@/lib/web-search/required-search';
import { placesBackendConfigured, placesSearchToolDef } from '@/lib/places/places-tool';
import {
  PLACES_UNAVAILABLE_SYSTEM_NOTICE,
  REQUIRED_PLACES_SYSTEM_NUDGE,
  resolvePlacesRequirement,
  resolveRequiredPlacesEnforcement,
  type PlacesRequirement,
  type RequiredPlacesEnforcement,
} from '@/lib/places/required-places';
import { hasExplicitWebSearchIntent, webSearchNeedsGenericTool } from '@agiworkforce/search';
import { extractCandidateMemoryFacts } from '@agiworkforce/agent-core';
import {
  supportsOpenAIReasoningEffort,
  SYSTEM_PROMPT_CACHE_BOUNDARY,
  splitSystemPromptCacheBoundary,
  prependSystemPromptAdditionAfterCacheBoundary,
} from '@agiworkforce/provider-protocol';
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
import { selectCheapestRequestFallback } from '@/lib/services/request-cost-fallback';
import {
  listAvailableManagedProviderIds,
  resolveProviderFromModel,
} from '@/lib/services/provider-adapter-service';
import { readModelPolicy } from '@/lib/services/model-policy-service';
import { resolveZeroDataRetentionPolicy } from '@/lib/services/organization-policy-gate';
import { resolveZeroDataRetentionProviderOverrides } from '@/lib/services/zero-data-retention-provider-overrides';
import {
  evaluateModelAccess,
  type ModelAccessAsk,
  type ModelAccessDecision,
  type ModelAccessPolicy,
} from '@/lib/services/model-policy-evaluator';
import { canAccessModel } from '@/lib/model-tiers';
import { validateEgressUrl, validateUserImageUrl, EgressPolicyError } from '@/lib/egress-policy';
import {
  CLARIFY_TOOL_NAME,
  createClarifyToolDefinition,
  shouldOfferClarifyTool,
} from '@/lib/services/clarify-tool-service';
import {
  ANTHROPIC_THINKING_BUDGET,
  CLOUD_WORK_MODES,
  getEconomyFallbackModels,
  getModelMetadataById,
  getMinimumRequiredTier,
  getModelReasoning,
  clampEffortToEntitlement,
  isAutoModeModelId,
  type Effort,
  getSlotForModel,
  normalizeModelId,
  canUseBillingPlanCapability,
  isFreeBillingPlanTier,
  isValidIanaTimeZone,
  resolveMaxOutputTokens,
} from '@agiworkforce/types';
import type { ModelCapabilities, RoutingSlot, ThinkingBlock } from '@agiworkforce/types';
import {
  applyConversationContext,
  classifyTaskFamily,
  classifyTaskLocally,
  detectIndicScript,
  emptyRuntimeState,
  estimateTokens,
  observedRouteHealthFromSnapshots,
  resolveAutoRoute,
  taskFamilyRoutingStageEnabled,
} from '@agiworkforce/routing';
import type {
  AutoRouteDecision,
  RoutingAttachment,
  RoutingRuntimeState,
  RoutingTaskType,
  TaskFamily,
  TaskFamilySignals,
} from '@agiworkforce/routing';
import { modelRegistry, getRoutePricingForModel } from '@agiworkforce/model-registry';
import {
  getRouteHealthSnapshot,
  getServedRouteAffinity,
  type ServedRouteAffinity,
} from '@/lib/services/free-lane/runtime-state-service';
import { freeLaneObserves, resolveFreeLaneMode } from '@/lib/services/free-lane/mode';
import { ROUTE_LANES, type FreeLanePlan, type RouteLane } from '@/lib/services/free-lane/plan';
import {
  FREE_LANE_SELECTION,
  activateFreeLane,
  buildFreeCapacityUnavailableResponse,
  resolveFreeLaneOutcome,
} from '@/lib/services/free-lane/stage';
import type { ContextTrimResult } from './context-window';
import { compactContextWindow } from './context-compaction';
import { buildInterimRoutePlanId } from '@/lib/cpst-telemetry';
import type { AuthGateSuccess } from './auth-gate';
import { resolveAuthenticatedSurface } from './request-surface';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  MANAGED_CHAT_CONTRACT_VERSION,
  ManagedUsageRequestError,
  createManagedUsageErrorBody,
  fingerprintManagedUsageRequest,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsageRequest,
  resolveManagedQuotaRecovery,
  type ManagedQuotaRecovery,
  type ManagedUsageRequestReservation,
} from '@/lib/services/managed-usage-request-service';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';
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
  loadProjectMemoryScope,
  loadSuppressedMemorySources,
  type ManagedMemoryContextDb,
  type ManagedMemoryPolicy,
} from '@/lib/services/managed-memory-context-service';
import {
  createSkillToolDefinition,
  formatSkillsForToolPrompt,
  hashSkillContent,
  matchSkillsForPrompt,
  SKILL_TOOL_NAME,
  type Skill,
} from '@agiworkforce/skills';
import {
  filterSkillsByInstallOverrides,
  getManagedSkillCatalog,
  getManagedSkillCatalogForPlugins,
  SkillCatalogUnavailableError,
} from '@/lib/services/skill-catalog-service';
import { getSkillInstallOverrides } from '@/lib/services/skill-install-service';
import { findUserSkillByName, type UserSkillRecord } from '@/lib/services/user-skill-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import { buildCapabilityPreamble } from './capability-preamble';
import {
  createManagedOfficeFileToolDefinition,
  MANAGED_OFFICE_FILE_TOOL_NAME,
} from '@/lib/services/managed-office-file-service';
import {
  createMapSearchToolDefinition,
  hasMapSearchIntent,
  MAP_SEARCH_TOOL_NAME,
} from '@/lib/services/map-search-tool-service';
import { ChatAttachmentHydrationError, hydrateChatAttachments } from './chat-attachment-hydration';
import { buildCustomInstructionsPreamble } from '@/lib/server/user-identity';
import {
  buildComputerUseSoftCapWarningHeader,
  buildQuotaWarningHeader,
} from '@/lib/server/managed-usage-policy';
import { assertTierUnitAllowance } from '@/lib/services/tier-unit-quota-service';
import {
  enforceManagedContentSafetyPreference,
  ManagedContentSafetyPolicyError,
} from '@/lib/services/managed-content-safety-service';
import { loadSelectedMcpContext, McpContextError } from '@/lib/connectors/mcp-context-service';
import { moderateManagedPrompt } from '@/lib/moderation';
import { timePhase } from '@/lib/observability/phase-timer';
import { CHAT_TURN_PHASE } from './turn-phases';

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
        tool_calls: z.array(ToolCallResponseSchema).max(32).optional(),
        tool_call_id: z.string().max(256).optional(),
      }),
    ),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    n: z.number().int().positive().optional(),
    stream: z.boolean().optional().default(false),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
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
    x_interactive_cards: z
      .object({
        supported: z.array(z.string().min(1).max(64)).max(16),
        canRespond: z.boolean(),
      })
      .strict()
      .optional(),
    mcp_context: z
      .object({
        prompt: z
          .object({
            connectorId: z.string().min(1).max(200),
            name: z.string().min(1).max(128),
            arguments: z.record(z.string(), z.string().max(8_192)).optional(),
          })
          .strict()
          .optional(),
        resources: z
          .array(
            z
              .object({
                connectorId: z.string().min(1).max(200),
                uri: z.string().min(1).max(4_096),
              })
              .strict(),
          )
          .max(4)
          .optional(),
      })
      .strict()
      .optional(),
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
    /** Per-chat Memory override. False skips memory injection and memory writes for this turn. */
    memory_enabled: z.boolean().optional(),
    research: z.boolean().optional(),
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
        approved_steps: z
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
    office_creation: z.boolean().optional(),
    /**
     * Connector ids the client has switched off for THIS conversation. The
     * tool catalog builder drops any tool whose server id is in this set, so
     * a disabled connector is never advertised to the model for this turn.
     */
    disabled_connector_ids: z.array(z.string().min(1).max(200)).max(64).optional(),
    work_mode: z.enum(CLOUD_WORK_MODES).optional(),
    agi_work_goal: AgiWorkGoalSchema.optional(),
    thinking_mode: z.boolean().optional(),
    thinking: z
      .object({
        type: z.string(),
        budget_tokens: z.number().int().positive().max(32000).optional(),
      })
      .optional(),
    effort: z.string().optional(),
    use_prompt_cache: z.boolean().optional(),
    client_timezone: z
      .string()
      .trim()
      .max(64)
      .refine(isValidIanaTimeZone, 'client_timezone must be a valid IANA time zone')
      .optional(),
    conversation_id: z.string().uuid().optional(),
    assistant_message_id: z.string().uuid().optional(),
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

const RE_CODE_EXECUTION_ACTION = /\b(run|execute|execution|test|benchmark)\b/i;
const RE_CODE_EXECUTION_SUBJECT =
  /\b(code|script|program|python|javascript|typescript|sql|notebook|command)\b|```/i;

const RE_DATA_EXECUTION_ACTION = /\b(analyze|calculate|compute|process|plot|chart)\b/i;
const RE_DATA_EXECUTION_SUBJECT = /\b(data|dataset|csv|spreadsheet|table|statistics?)\b/i;

const RE_OFFICE_CREATION_ACTION = /\b(create|generate|make|prepare|produce|export|build)\b/i;
const RE_OFFICE_CREATION_ARTIFACT =
  /\.(docx|pptx)\b|\b(word document|powerpoint|slide deck|presentation|office file)\b/i;

const RE_HTTP_URL = /https?:\/\/[^\s<>"']+/i;
const RE_URL_FETCH_ACTION = /\b(read|summarize|analyse|analyze|review|check|inspect|open|fetch)\b/i;

export type ImplicitManagedToolIntentContext = {
  prompt: string;
  taskType: RoutingTaskType;
  planTier: string | null | undefined;
};

export function applyImplicitManagedToolIntent(
  request: ChatCompletionRequest,
  context: ImplicitManagedToolIntentContext,
): void {
  if (
    request.web_search === undefined &&
    (context.taskType === 'research' || hasExplicitWebSearchIntent(context.prompt))
  ) {
    request.web_search = true;
  }

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

const USER_SKILL_SOURCE = 'personal' satisfies Skill['source'];
const USER_SKILL_FILE_PATH_PREFIX = 'user-skills';

export function toManagedSkillFromUserSkill(record: UserSkillRecord): Skill {
  return {
    name: record.name,
    description: record.description,
    body: record.body,
    contentHash: hashSkillContent(Buffer.from(record.body, 'utf8')),
    filePath: `${USER_SKILL_FILE_PATH_PREFIX}/${record.id}`,
    source: USER_SKILL_SOURCE,
    metadata: {},
    frontmatter: {},
  };
}

export async function resolveManagedSkillCatalogWithUserFallback(
  requestedSkillName: string,
  managedCatalog: readonly Skill[],
  params: { db: Parameters<typeof findUserSkillByName>[0]; userId: string },
): Promise<readonly Skill[]> {
  if (managedCatalog.some((skill) => skill.name === requestedSkillName)) return managedCatalog;
  const userSkill = await findUserSkillByName(params.db, params.userId, requestedSkillName);
  if (!userSkill) return managedCatalog;
  return [...managedCatalog, toManagedSkillFromUserSkill(userSkill)];
}

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
  request.tool_choice = {
    type: 'function',
    function: { name: SKILL_TOOL_NAME },
  };
  return { ok: true };
}

const SKILL_OFFER_EXCLUDED_SURFACES = new Set<CloudChatSurface>(['vscode', 'cli', 'api']);

export type ImplicitManagedSkillOfferContext = {
  prompt: string;
  surface: CloudChatSurface;
  toolsCapable: boolean;
  loadCatalog: () => Promise<readonly Skill[]>;
};

export async function applyImplicitManagedSkillOffer(
  request: ChatCompletionRequest,
  context: ImplicitManagedSkillOfferContext,
): Promise<string[]> {
  if (request.skill_name) return [];
  if (!context.toolsCapable) return [];
  if (SKILL_OFFER_EXCLUDED_SURFACES.has(context.surface)) return [];
  if (request.tool_choice !== undefined) return [];
  if (!context.prompt.trim()) return [];

  let catalog: readonly Skill[];
  try {
    catalog = await context.loadCatalog();
  } catch (error) {
    if (error instanceof SkillCatalogUnavailableError) return [];
    throw error;
  }

  const matches = matchSkillsForPrompt(catalog, context.prompt);
  if (matches.length === 0) return [];

  const relevant = matches.map((match) => match.skill);
  request.messages.unshift({ role: 'system', content: formatSkillsForToolPrompt(relevant) });
  request.tools = [
    ...(request.tools ?? []).filter((tool) => tool.function.name !== SKILL_TOOL_NAME),
    createSkillToolDefinition(),
  ];
  return relevant.map((skill) => skill.name);
}

export function applyManagedOfficeFileCreation(request: ChatCompletionRequest): void {
  if (!request.office_creation) return;
  request.tools = [
    ...(request.tools ?? []).filter((tool) => tool.function.name !== MANAGED_OFFICE_FILE_TOOL_NAME),
    createManagedOfficeFileToolDefinition(),
  ];
}

/**
 * Offer the model a way to ask a real question. The clarify card's renderer,
 * contract and answer path were all built and nothing produced one, so an
 * ambiguous request came back as prose asking the reader to describe their
 * choice in words. Offered, never forced: unlike the map tool this sets no
 * tool_choice, because most turns should just be answered.
 *
 * The tool's own description could not reliably keep a fast model from
 * calling it on a fully specified turn, so explicit intent is filtered
 * deterministically here: the tool is not even offered when the turn already
 * carries search/research, a long message, a URL, an attachment, a code
 * fence, or an opening verb naming the action to take. See
 * `shouldOfferClarifyTool`.
 */
export function applyClarifyCardCapability(
  request: ChatCompletionRequest,
  params: {
    surface: CloudChatSurface;
    toolsCapable: boolean;
    userMessage: string;
    hasAttachment: boolean;
  },
): void {
  if (
    (params.surface !== 'web' && params.surface !== 'mobile' && params.surface !== 'chrome') ||
    !params.toolsCapable ||
    !request.stream ||
    !request.x_interactive_cards?.supported.includes('clarify.v1') ||
    !shouldOfferClarifyTool({
      userMessage: params.userMessage,
      hasAttachment: params.hasAttachment,
      webSearch: request.web_search === true,
      research: request.research === true,
    })
  ) {
    return;
  }
  request.tools = [
    ...(request.tools ?? []).filter((tool) => tool.function.name !== CLARIFY_TOOL_NAME),
    createClarifyToolDefinition(),
  ];
}

export function applyMapSearchCardCapability(
  request: ChatCompletionRequest,
  params: {
    surface: CloudChatSurface;
    toolsCapable: boolean;
    userMessage: string;
    /**
     * A place question and a map request overlap in wording ("near Union
     * Square" reads as both) but not in what they need: one wants rated,
     * open-now place data, the other wants a picture of a location. When the
     * places tool takes the turn, the map card stands down rather than forcing
     * a second tool choice and ending the turn on a card with no answer.
     */
    placesSearchOffered: boolean;
  },
): void {
  if (
    (params.surface !== 'web' && params.surface !== 'mobile' && params.surface !== 'chrome') ||
    !params.toolsCapable ||
    !request.stream ||
    params.placesSearchOffered ||
    !hasMapSearchIntent(params.userMessage) ||
    !request.x_interactive_cards?.supported.includes('map-search.v1')
  ) {
    return;
  }
  request.tools = [
    ...(request.tools ?? []).filter((tool) => tool.function.name !== MAP_SEARCH_TOOL_NAME),
    createMapSearchToolDefinition(),
  ];
  if (request.tool_choice === undefined) {
    request.tool_choice = {
      type: 'function',
      function: { name: MAP_SEARCH_TOOL_NAME },
    };
  }
}

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
  chatSurface: CloudChatSurface;
  organizationId?: string | null;
  managedUsage?: ManagedUsageRequestReservation;
  chatRequest: ChatCompletionRequest;
  conversationId: string | undefined;
  conversationIsTemporary?: boolean;
  assistantMessageId?: string | undefined;
  autoMemoryFacts?: string[];
  requestedModel: string;
  provider: string;
  estimatedCostCents: number;
  estimatedPromptTokens: number;
  maxTokens: number;
  usedFallback: boolean;
  fallbackReason: string | undefined;
  originalModel: string;
  fallbackModels?: string[];
  /**
   * The workspace model policy snapshot this request was admitted against,
   * read ONCE by the processor and carried on the request so every later hop
   * answers to the same row.
   *
   * `managed-failover.ts`'s OpenRouter route-retry is not drawn from
   * `fallbackModels`, so the policy filtering applied to that plan never
   * governed it; it needs the snapshot itself. Without this field there was
   * nowhere for `route.ts` to get one, and its `createFailoverPlan` calls
   * passed nothing, leaving that enforcement permanently ungoverned.
   *
   * `null` means UNGOVERNED, matching the evaluator's contract: personal
   * scope, no policy row, or a read that deliberately failed open.
   */
  modelPolicy?: ModelAccessPolicy | null;
  zeroDataRetentionOnly?: boolean;
  secretRedactionCount?: number;
  subscriptionTier?: string;
  /**
   * Set only when the free lane actually dispatched this request.
   *
   * Carries the candidate set and the one runtime snapshot taken for this
   * request, so managed failover can re-enter the stage synchronously with the
   * failed routes excluded instead of rotating onto a paid candidate.
   */
  freeLane?: FreeLanePlan;
  routeLane?: RouteLane;
  routePlanId?: string;
  retries?: number;
  resolvedTaskType: RoutingTaskType;
  /**
   * Whether this turn must produce a search, and how that was arranged. The
   * tool loop reads it to release the forced choice after the search step and
   * to decide whether a turn that answered from memory earns one retry.
   */
  searchRequirement?: WebSearchRequirement;
  searchEnforcement?: RequiredSearchEnforcement;
  /**
   * Whether this turn is a place question, and how the places tool was
   * arranged. The tool loop reads it to release the forced choice after the
   * places step so the model still writes the answer.
   */
  placesRequirement?: PlacesRequirement;
  placesEnforcement?: RequiredPlacesEnforcement;
  classifierConfidence: number;
  resolvedSlot: RoutingSlot | null;
  quotaFeature: QuotaFeature;
  quotaWarningHeader: string | null;
  isFlagshipRequest: boolean;
  researchMode?: boolean;
  researchResume?: {
    sources: Array<{ url: string; title?: string; snippet?: string }>;
    steps: ResearchStep[];
    /** The plan the user pressed Start on after the approval pause. */
    approvedSteps: ResearchStep[];
  };
  indicResult: ReturnType<typeof detectIndicScript>;
  freeTrial?: FreeTrialReservation;
  contextTrim?: ContextTrimResult | null;
  /**
   * The route already warm for this conversation's cache, if any. Set once
   * per turn from the affinity store and read back by the dispatch layer to
   * decide whether to pin an OpenRouter upstream provider, never to steer
   * which route is selected, which `resolveWebCloudModelRoute` already owns.
   */
  routeAffinity?: ServedRouteAffinity;
  llmRequest: {
    model: string;
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      multimodal_content?: unknown[];
      tool_calls?: unknown[];
      tool_call_id?: string;
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
 * Whether this model accepts a FORCED `tool_choice`. Some reasoning models reason on
 * every turn and reject `'required'` or a named function with HTTP 400
 * ("Thinking mode does not support this tool_choice"), which reaches the user
 * as an empty assistant turn. The catalog records the constraint per model, so
 * a new model inherits the right behavior without editing this route.
 */
function modelAcceptsForcedToolChoice(model: string | undefined): boolean {
  if (!model) return true;
  return getModelMetadataById(model)?.providerCompatibility?.forcedToolChoice !== false;
}

export function resolveInitialManagedCodeToolChoice(input: {
  requestedToolChoice: ChatCompletionRequest['tool_choice'];
  codeExecution: boolean | undefined;
  stream: boolean | undefined;
  provider: string;
  model?: string;
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
    modelAcceptsForcedToolChoice(input.model) &&
    providerRoutesToE2B(input.provider)
  ) {
    return 'required';
  }
  return undefined;
}

export function resolveRequestEffort(
  provider: string,
  model: string,
  effort: string | undefined,
  planTier: string | null | undefined,
): Effort | undefined {
  const normalized = normalizeEffort(effort);
  if (!normalized || !modelSupportsEffort(provider, model)) return undefined;
  if (
    provider === 'openai' &&
    !supportsOpenAIReasoningEffort({ provider: 'openai', id: model }, normalized)
  ) {
    return undefined;
  }
  return clampEffortToEntitlement(model, normalized, planTier);
}

export function anthropicUsesAdaptiveThinking(model: string): boolean {
  const metadata = getModelMetadataById(model);
  if (metadata?.provider !== 'anthropic' || !metadata.capabilities.thinking) return false;
  if (metadata.reasoning?.thinkingDefault === 'adaptive') return true;
  const control = metadata.reasoning?.control;
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

export function collectManagedPromptMaterials(request: ChatCompletionRequest): string[] {
  const materials = request.messages.map((message) => extractTextContent(message.content));
  if (request.tools?.length) materials.push(JSON.stringify(request.tools));
  return materials;
}

/**
 * Assembles the leading system message so the cacheable prefix (static
 * capability preamble + custom instructions) stays byte-identical across
 * turns of one conversation, with everything that varies per turn
 * (timestamp, matched skills, recalled memories) folded in after
 * `SYSTEM_PROMPT_CACHE_BOUNDARY`. `capabilityPreamble` already carries that
 * boundary ahead of its own dynamic time context; `dynamicSystemAddition`
 * (skill/memory content) is inserted right after it, and
 * `customInstructionsPreamble` (static, per-user config) joins the stable
 * side.
 */
export function composeManagedSystemPreamble(input: {
  capabilityPreamble: string | null;
  customInstructionsPreamble: string | null | undefined;
  dynamicSystemAddition: string;
}): string {
  const withDynamicAddition = prependSystemPromptAdditionAfterCacheBoundary({
    systemPrompt: input.capabilityPreamble ?? '',
    systemPromptAddition: input.dynamicSystemAddition,
  });
  const split = splitSystemPromptCacheBoundary(withDynamicAddition);
  const stableBlock = [
    split ? split.stablePrefix : withDynamicAddition,
    input.customInstructionsPreamble,
  ]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');
  const dynamicBlock = split ? split.dynamicSuffix : '';
  return dynamicBlock
    ? `${stableBlock}${SYSTEM_PROMPT_CACHE_BOUNDARY}${dynamicBlock}`
    : stableBlock;
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
  projectId?: string | null;
}): Promise<void> {
  if (params.isTemporary || params.chatRequest.memory_enabled === false) return;

  const [suppressedSources, scope] = await Promise.all([
    loadSuppressedMemorySources(params.db, { userId: params.userId }),
    loadProjectMemoryScope(params.db, {
      userId: params.userId,
      projectId: params.projectId ?? null,
    }),
  ]);
  const memories = await loadManagedMemoryContext(params.db, {
    userId: params.userId,
    suppressedSources,
    scope,
  });
  const prompt = formatManagedMemorySystemPrompt(memories);
  if (prompt) applyManagedMemoryContext(params.chatRequest, prompt);
}

export function prepareManagedAutoMemoryFacts(params: {
  message: string;
  isTemporary: boolean;
  surface: CloudChatSurface;
  policy: ManagedMemoryPolicy;
  /** Per-chat Memory override; false skips learning new facts for this turn. */
  memoryEnabled?: boolean;
}): string[] {
  if (
    !params.policy.enabled ||
    !params.policy.generateFromHistory ||
    params.isTemporary ||
    params.memoryEnabled === false ||
    params.surface === 'api'
  ) {
    return [];
  }
  return extractCandidateMemoryFacts(params.message).slice(0, 5);
}

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

const NO_DYNAMIC_SYSTEM_MESSAGE_REFS: ReadonlySet<object> = new Set();

/**
 * The first static (non-memory, non-skill) system message, so a directive
 * lands ahead of `SYSTEM_PROMPT_CACHE_BOUNDARY` rather than glued onto a
 * message that varies every turn. Falls back to `messages[0]` semantics
 * (index -1) when every leading system message is dynamic-tracked.
 */
function firstStaticSystemMessageIndex(
  messages: ChatCompletionRequest['messages'],
  dynamicSystemMessageRefs: ReadonlySet<object>,
): number {
  return messages.findIndex(
    (message) => message.role === 'system' && !dynamicSystemMessageRefs.has(message as object),
  );
}

function applyStaticSystemDirective(
  chatRequest: ChatCompletionRequest,
  dynamicSystemMessageRefs: ReadonlySet<object>,
  directive: string,
  join: (existing: string, directive: string) => string,
): void {
  const index = firstStaticSystemMessageIndex(chatRequest.messages, dynamicSystemMessageRefs);
  const target = index === -1 ? undefined : chatRequest.messages[index];
  if (target && typeof target.content === 'string') {
    target.content = join(target.content, directive);
    return;
  }
  chatRequest.messages.unshift({ role: 'system', content: directive });
}

export function applyJsonObjectMode(
  chatRequest: ChatCompletionRequest,
  dynamicSystemMessageRefs: ReadonlySet<object> = NO_DYNAMIC_SYSTEM_MESSAGE_REFS,
): void {
  applyStaticSystemDirective(
    chatRequest,
    dynamicSystemMessageRefs,
    JSON_OBJECT_DIRECTIVE,
    (existing, directive) => `${existing}\n\n${directive}`,
  );
}

export function researchModeAllowed(
  chatRequest: Pick<ChatCompletionRequest, 'research'>,
  caps: Partial<ModelCapabilities> | undefined,
  contextWindow: number | undefined = undefined,
): boolean {
  return chatRequest.research === true && modelSupportsResearch(caps, contextWindow);
}

export function applyResearchMode(
  chatRequest: ChatCompletionRequest,
  dynamicSystemMessageRefs: ReadonlySet<object> = NO_DYNAMIC_SYSTEM_MESSAGE_REFS,
): void {
  chatRequest.web_search = true;
  chatRequest.web_fetch = true;
  applyStaticSystemDirective(
    chatRequest,
    dynamicSystemMessageRefs,
    RESEARCH_SYSTEM_PROMPT,
    (existing, directive) => `${directive}\n\n${existing}`,
  );
}

/**
 * Append the provider-native web-search server tool to `tools` when the caller has
 * requested web search and the resolved model supports search. Pure and exported so
 * the injection is unit-testable across every provider. This handles ONLY the native
 * path (anthropic/google/openai). Providers without a native branch (xai/qwen/zhipu/
 * deepseek/mistral/…) are NOT gated out of web search, when the model is tools-capable
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
 *     against platform.claude.com, the current dynamic-filtering tool version;
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
const NATIVE_SEARCH_MAX_USES_DEFAULT = 3;
const NATIVE_SEARCH_MAX_USES_RESEARCH = 20;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

/**
 * How many grounded native-search responses one turn may spend before the
 * native search tool is withdrawn for the rest of it. One constant, one env
 * override, for every provider-native search shape (Anthropic's `max_uses`
 * included), so an operator override applies uniformly rather than per
 * provider.
 */
export function resolveNativeSearchMaxUses(researchMode: boolean): number {
  const fallback = researchMode ? NATIVE_SEARCH_MAX_USES_RESEARCH : NATIVE_SEARCH_MAX_USES_DEFAULT;
  return envInt('AGI_NATIVE_SEARCH_MAX_USES', fallback, 1, 50);
}

export function appendWebSearchTool(
  providerLower: string,
  tools: unknown[] | undefined,
  caps: { search?: boolean } | undefined,
  options: { researchMode?: boolean; googleGroundingPoolAvailable?: boolean } = {},
): unknown[] | undefined {
  if (!(caps?.search ?? true)) return tools;
  if (providerLower === 'anthropic') {
    return [
      ...(tools ?? []),
      {
        type: 'web_search_20260209',
        name: 'web_search',
        allowed_callers: ['direct'],
        max_uses: resolveNativeSearchMaxUses(options.researchMode ?? false),
      },
    ];
  }
  if (providerLower === 'google') {
    if (options.googleGroundingPoolAvailable === false && webSearchBackendConfigured()) {
      return [...(tools ?? []), webSearchToolDef()];
    }
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
 * WP4: should the generic platform-executed `web_search` function tool be offered
 * for this request? Pure and exported (same reason as `appendWebSearchTool`: unit
 * testable without invoking the rest of `processRequest`).
 *
 * True when: the provider has no working native search path on this route
 * (`webSearchNeedsGenericTool` reports that fallback requirement), the
 * resolved model is tools-capable (unknown models
 * default to allowed), the request is streaming (offer ⊆ run, only that path
 * enters the tool loop in route.ts, mirrors url_fetch/E2B below), and
 * a search backend is actually configured (`backendConfigured`.
 * `webSearchBackendConfigured()` in production, so the tool is never offered as a
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

/**
 * Every route id reachable from a selection, for a routeHealthSnapshots
 * fetch, never for admission, which stays `resolveAutoRoute`'s alone.
 *
 * An exact model selection scopes to that model's own routes
 * (`getRoutePricingForModel`). An alias (`auto`, `auto-economy`, ...) cannot
 * be resolved to one model without duplicating the policy's slot/profile/task
 * logic, so it gets the full set of routes any Auto slot could ever reach.
 * a safe superset a ranker only ever reads by exact route id.
 */
const AUTO_POLICY_ROUTE_IDS: readonly string[] = [
  ...new Set(
    Object.values(modelRegistry.policies.auto.slots).flatMap((slot) =>
      getRoutePricingForModel(slot.modelKey).map((route) => route.routeId),
    ),
  ),
];

function candidateRouteIdsForSelection(selection: string): readonly string[] {
  if (selection in modelRegistry.models) {
    return getRoutePricingForModel(selection).map((route) => route.routeId);
  }
  return AUTO_POLICY_ROUTE_IDS;
}

/**
 * Live route health for whichever routes a selection could resolve to, so
 * `rankRoutes` can deprioritize a route in cooldown instead of treating an
 * absent `routeHealthSnapshots` entry as the only signal it has.
 */
/**
 * The workspace model policy, read once per request, before routing.
 *
 * Fails OPEN on every uncertainty, personal scope, no policy row, or an
 * unreachable table: model governance is a deployment control over which
 * approved tool staff use, not a containment barrier, and turning a database
 * fault into a denial would stop every member's chat. The tenancy layer is what
 * stops cross-workspace access, and it fails closed.
 */
async function readWorkspaceModelPolicy(
  scoped: { db: Parameters<typeof readModelPolicy>[0]; organizationId: string | null },
  requestId: string,
): Promise<ModelAccessPolicy | null> {
  if (!scoped.organizationId) return null;
  try {
    return await readModelPolicy(scoped.db, scoped.organizationId);
  } catch (error) {
    logger.error(
      { error, requestId, organizationId: scoped.organizationId },
      '[model-policy] policy read failed; this request is ungoverned',
    );
    return null;
  }
}

export async function resolveRouteHealthRuntimeState(
  selection: string,
  nowMs: number,
): Promise<RoutingRuntimeState> {
  const routeHealthSnapshots = await getRouteHealthSnapshot(
    candidateRouteIdsForSelection(selection),
    nowMs,
  );
  return { ...emptyRuntimeState(nowMs), routeHealthSnapshots };
}

const MANAGED_WEB_CLOUD_TRUST_MODE = 'managed_cloud';
const AUTO_ROUTE_UNAVAILABLE_MESSAGE =
  'Auto could not find a model for this request on your plan. Choose a model from the picker or upgrade your plan.';
const EXPLICIT_ROUTE_UNAVAILABLE_MESSAGE =
  'The selected model is not available for this task in Managed Web chat.';

export function resolveWebCloudModelRoute(
  model: string,
  subscriptionTier: string | undefined,
  taskType: RoutingTaskType,
  usage?: {
    budgetRemainingCents?: number;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
    taskFamily?: TaskFamily | null;
  },
  /**
   * Reorder-only slot preference for THIS request. Omitted on every call but
   * the free lane's own, so nothing else can be moved by it.
   */
  preferSlots?: readonly string[],
  /**
   * Live route health, and the route (if any) already warm for this
   * conversation. Both reorder only: `resolveAutoRoute` still requires the
   * preferred route to already be admissible for the resolved model, so an
   * exact-model selection can never be steered onto a different model by a
   * stale preference.
   */
  routeHealth?: {
    runtimeState?: RoutingRuntimeState | null;
    preferredRouteId?: string | null;
  },
  availableProviderIds?: ReadonlySet<string>,
  zeroDataRetentionOnly?: boolean,
  zeroDataRetentionProviders?: ReadonlySet<string>,
  /**
   * The workspace policy snapshot, so the resolver refuses a candidate the
   * workspace may not run instead of the caller filtering the plan afterwards.
   */
  organizationPolicy?: ModelAccessPolicy | null,
) {
  return resolveAutoRoute({
    selection: model,
    taskType,
    subscriptionTier,
    trustMode: MANAGED_WEB_CLOUD_TRUST_MODE,
    runtimeProfileId: 'web/cloud-chat',
    ...(preferSlots !== undefined && preferSlots.length > 0 ? { preferSlots } : {}),
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
    ...(routeHealth?.runtimeState
      ? {
          runtimeState: routeHealth.runtimeState,
          observedRouteHealth: observedRouteHealthFromSnapshots(
            routeHealth.runtimeState.routeHealthSnapshots,
          ),
        }
      : {}),
    ...(routeHealth?.preferredRouteId ? { preferredRouteId: routeHealth.preferredRouteId } : {}),
    ...(availableProviderIds && availableProviderIds.size > 0 ? { availableProviderIds } : {}),
    ...(zeroDataRetentionOnly ? { zeroDataRetentionOnly } : {}),
    ...(zeroDataRetentionProviders && zeroDataRetentionProviders.size > 0
      ? { zeroDataRetentionProviders }
      : {}),
    ...(organizationPolicy ? { organizationPolicy } : {}),
  });
}

function checkModelTierAccess(model: string, subscriptionTier: string): boolean {
  const allowed = canAccessModel(model, subscriptionTier);
  if (!allowed && !isFreeBillingPlanTier(subscriptionTier.toLowerCase())) {
    logger.warn(
      { model: model.toLowerCase(), tier: subscriptionTier.toLowerCase() },
      'Model access denied - not in economy or tier requirements map',
    );
  }
  return allowed;
}

/**
 * Names both provider identities of a model for the policy evaluator.
 *
 * `resolveProviderFromModel` answers a DISPATCH question, which adapter will
 * carry this request, and for the aggregator-routed vendors (MiniMax, Qwen,
 * Zhipu; see lib/services/aggregator-routing.ts) it collapses the vendor away
 * and returns `"openrouter"` the moment `OPENROUTER_API_KEY` is set. Feeding
 * that alone to a policy written about VENDORS broke the gate in both
 * directions at once: `blockedProviders: ['minimax']` matched nothing and
 * MiniMax kept running, while `allowedProviders: ['minimax']` matched nothing
 * and MiniMax was refused. Normalization cannot repair that, the two strings
 * name different things, not the same thing spelled twice.
 *
 * So the ask carries both, sourced from the two places that actually know:
 * the VENDOR from the canonical catalog (`getModelMetadataById(...).provider`,
 * the same field a policy row is written against), the TRANSPORT from the
 * dispatch layer. The evaluator's documented rule decides what each one may do
 *, a block matches either, an allowlist is about the vendor.
 *
 * A model the catalog cannot resolve is asked about with a null vendor rather
 * than skipped: a model rule still decides, and an allowlisted-provider policy
 * denies the unknown id instead of waving it through.
 */
function resolveProviderIdentities(
  model: string,
  routeId?: string,
): {
  vendor: string | null;
  transport: string | null;
} {
  let transport: string | null;
  try {
    transport = resolveProviderFromModel(model, routeId, {
      trustMode: MANAGED_WEB_CLOUD_TRUST_MODE,
    });
  } catch {
    transport = null;
  }
  const vendor = getModelMetadataById(model)?.provider ?? null;
  return { vendor: vendor ?? transport, transport };
}

function modelAccessAskFor(model: string): ModelAccessAsk {
  const { vendor, transport } = resolveProviderIdentities(model);
  return { provider: vendor, modelId: model, transportProvider: transport };
}

/**
 * Asks the workspace model policy about a model this request might rotate onto.
 *
 * Same pure evaluator the primary gate uses, against a policy snapshot read
 * once per request, never a second policy read and never a second copy of the
 * precedence rules.
 */
function evaluateCandidateModelAccess(
  policy: ModelAccessPolicy | null,
  model: string,
): ModelAccessDecision {
  return evaluateModelAccess(policy, modelAccessAskFor(model));
}

function modelPolicyDenialResponse(decision: ModelAccessDecision): NextResponse {
  return NextResponse.json(
    {
      error: {
        message: decision.reason,
        type: 'invalid_request_error',
        code: decision.code,
      },
    },
    { status: 403 },
  );
}

function findCheaperFallbackModel(
  currentModel: string,
  currentProvider: string,
  estimatedPromptTokens: number,
  maxTokens: number,
  isPolicyAllowed: (model: string) => boolean,
): { model: string; provider: string } | null {
  const currentCost = LLMCostCalculator.estimateCost(
    currentProvider,
    currentModel,
    estimatedPromptTokens,
    maxTokens,
  );

  const canonicalCurrentModel = normalizeModelId(currentModel) ?? currentModel.toLowerCase();
  return selectCheapestRequestFallback({
    currentModelIds: new Set([canonicalCurrentModel, currentModel.toLowerCase()]),
    currentRequestCostCents: currentCost,
    // Filtered BEFORE ranking, so a forbidden cheapest candidate yields the
    // next allowed one rather than removing the downgrade altogether.
    candidates: getEconomyFallbackModels().filter((candidate) => isPolicyAllowed(candidate.model)),
    estimateRequestCostCents: (fallback) =>
      LLMCostCalculator.estimateCost(
        fallback.provider,
        fallback.model,
        estimatedPromptTokens,
        maxTokens,
      ),
  });
}

function quotaRecoveryFor(
  code: string,
  subscription: SubscriptionInfo | undefined,
): ManagedQuotaRecovery | null {
  return resolveManagedQuotaRecovery({
    code,
    planTier: subscription?.plan_tier,
    billedByStripe: Boolean(subscription?.stripe_subscription_id),
  });
}

export function handleCreditError(
  _deductResult: {
    code?: string;
    daily_remaining?: number;
    daily_limit?: number;
    daily_used?: number;
  },
  subscription?: SubscriptionInfo,
): NextResponse {
  const recovery = quotaRecoveryFor('monthly_limit_exceeded', subscription);
  return NextResponse.json(
    {
      error: {
        message:
          'Usage budget exhausted for this billing period. Upgrade your plan or add credits.',
        type: 'insufficient_quota',
        code: 'monthly_limit_exceeded',
        ...(recovery ? { recovery } : {}),
      },
    },
    { status: 402 },
  );
}

function managedUsageErrorResponse(
  error: ManagedUsageRequestError,
  subscription?: SubscriptionInfo,
): NextResponse {
  return NextResponse.json(
    createManagedUsageErrorBody(
      error,
      'invalid_request_error',
      quotaRecoveryFor(error.code, subscription),
    ),
    {
      status: error.status,
      headers: { 'X-AGI-Chat-Contract-Version': MANAGED_CHAT_CONTRACT_VERSION },
    },
  );
}

function freeTrialBudgetReachedResponse(subscription?: SubscriptionInfo): ProcessFailure {
  const recovery = quotaRecoveryFor('free_trial_token_budget_reached', subscription);
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
          ...(recovery ? { recovery } : {}),
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
      return { ok: false, response: managedUsageErrorResponse(error, subscription) };
    }
    throw error;
  }

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

  let body: unknown;
  try {
    const rawBody = await timePhase(CHAT_TURN_PHASE.bodyParse, () => request.arrayBuffer());
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

  // round trips, scoped-db handshake, ownership lookup, safety preference,
  const scopedDbPromise = getUserScopedDb(request, { apiKeyScope: 'inference:write' });
  scopedDbPromise.catch(() => {});

  const requestedModel = chatRequest.model;
  const freeTrialEnabled = isFreeTrialRequest({
    requestedModel,
    planTier: subscription.plan_tier,
  });

  let creditBalancePromise: ReturnType<typeof CreditService.getBalance> | null =
    freeTrialEnabled || isFreePlanTier(subscription.plan_tier)
      ? null
      : scopedDbPromise.then((scoped) => CreditService.getBalance(scoped.db, userId));
  creditBalancePromise?.catch(() => {});

  const chatSurface = resolveAuthenticatedSurface(request, auth);
  const customInstructionsPromise =
    chatSurface === 'api'
      ? null
      : scopedDbPromise
          .then((scoped) => buildCustomInstructionsPreamble(scoped.db, userId))
          .catch((error: unknown) => {
            logger.warn({ error, userId }, 'Custom instructions read failed; sending none');
            return null;
          });

  const skillInstallOverridesPromise: Promise<ReadonlyMap<string, boolean>> = scopedDbPromise
    .then((scoped) => getSkillInstallOverrides(scoped.db, userId))
    .catch((error: unknown) => {
      logger.warn({ error, userId }, 'Skill install overrides read failed; assuming none');
      return new Map<string, boolean>();
    });
  skillInstallOverridesPromise.catch(() => {});

  // safety legs so both keep seeing the caller's own words.
  const latestUserPrompt = extractTextContent(
    [...chatRequest.messages].reverse().find((message) => message.role === 'user')?.content ?? '',
  );

  const clientAuthoredPromptSegments = chatRequest.messages
    .filter((message) => message.role === 'user' || message.role === 'system')
    .map((message) => extractTextContent(message.content))
    .filter((text) => text.length > 0);

  const ownershipLeg: Promise<
    { ok: true; isTemporary: boolean; projectId: string | null } | ProcessFailure
  > = chatRequest.conversation_id
    ? (async () => {
        try {
          const scoped = await scopedDbPromise;
          if (scoped.userId !== userId) {
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

          const ownedRows = await scoped.db.query<{
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

          if (ownedRows[0].project_id) {
            try {
              const projectContext = await loadProjectContext(scoped.db, {
                projectId: ownedRows[0].project_id,
                userId,
                currentConversationId: ownedRows[0].id,
                currentUserQuery: latestUserPrompt,
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

          return {
            ok: true,
            isTemporary: ownedRows[0].is_temporary,
            projectId: ownedRows[0].project_id,
          };
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
      })()
    : Promise.resolve({ ok: true, isTemporary: false, projectId: null });

  const safetyLeg: Promise<{ ok: true } | ProcessFailure> = (async () => {
    const platform = moderateManagedPrompt({
      userId,
      segments: clientAuthoredPromptSegments,
    });
    if (!platform.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: platform.refusal,
              type: 'invalid_request_error',
              code: 'content_policy_violation',
            },
          },
          { status: 422 },
        ),
      };
    }

    try {
      const scoped = await scopedDbPromise;
      if (scoped.userId !== userId) {
        throw new ManagedContentSafetyPolicyError('Managed content safety owner mismatch');
      }
      const contentSafety = await enforceManagedContentSafetyPreference(scoped.db, {
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
      return { ok: true };
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
  })();

  const [ownership, safety] = await timePhase(CHAT_TURN_PHASE.ownershipAndSafety, () =>
    Promise.all([ownershipLeg, safetyLeg]),
  );
  if (!ownership.ok) return ownership;
  if (!safety.ok) return safety;

  const conversationIsTemporary = ownership.isTemporary;
  const conversationProjectId = ownership.projectId;

  const memoryPolicyLeg: Promise<ManagedMemoryPolicy> = conversationIsTemporary
    ? Promise.resolve(DISABLED_MANAGED_MEMORY_POLICY)
    : (async () => {
        const scoped = await scopedDbPromise;
        if (scoped.userId !== userId) {
          logger.error(
            { userId, scopedUserId: scoped.userId },
            'Managed memory owner mismatch; continuing without account memory',
          );
          return DISABLED_MANAGED_MEMORY_POLICY;
        }
        return loadManagedMemoryPolicy(scoped.db, {
          userId,
          organizationId: scoped.organizationId,
        });
      })().catch((error: unknown) => {
        logger.error(
          { error, userId, conversationId: chatRequest.conversation_id },
          'Managed memory load failed; continuing without account memory',
        );
        return DISABLED_MANAGED_MEMORY_POLICY;
      });

  const [hydrationFailure, managedMemoryPolicy] = await timePhase(
    CHAT_TURN_PHASE.attachmentsAndMemoryPolicy,
    () =>
      Promise.all([
        hydrateChatAttachments(chatRequest.messages, userId).then(
          () => null,
          (error: unknown) => ({ error }),
        ),
        memoryPolicyLeg,
      ]),
  );

  if (hydrationFailure) {
    const { error } = hydrationFailure;
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

  const dynamicSystemMessageRefs = new Set<object>();

  if (chatRequest.mcp_context) {
    try {
      const context = await loadSelectedMcpContext(userId, chatRequest.mcp_context);
      if (context) chatRequest.messages.unshift({ role: 'system', content: context });
    } catch (error) {
      if (error instanceof McpContextError) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: {
                message: error.message,
                type: 'invalid_request_error',
                code: 'mcp_context_unavailable',
                param: 'mcp_context',
              },
            },
            { status: 422 },
          ),
        };
      }
      logger.error({ error, userId }, 'Selected MCP context could not be loaded');
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: 'Selected connector context could not be loaded.',
              type: 'server_error',
              code: 'mcp_context_unavailable',
            },
          },
          { status: 503 },
        ),
      };
    }
  }

  if (managedMemoryPolicy.enabled) {
    try {
      const scoped = await scopedDbPromise;
      const preMemoryMessageCount = chatRequest.messages.length;
      // A memory confined to a project must not appear in a loose chat, and a
      // project set to exclude global memory must not see the account pool.
      // `conversationProjectId` is the ownership lookup's row, not a fresh
      // query, so the scoping answers to the same read as the 404 check above.
      await timePhase(CHAT_TURN_PHASE.memoryEnrichment, () =>
        enrichManagedMemoryContext({
          db: scoped.db,
          userId,
          chatRequest,
          isTemporary: false,
          projectId: conversationProjectId,
        }),
      );
      if (chatRequest.messages.length > preMemoryMessageCount) {
        dynamicSystemMessageRefs.add(chatRequest.messages[0] as object);
      }
    } catch (error) {
      logger.error(
        { error, userId, conversationId: chatRequest.conversation_id },
        'Managed memory load failed; continuing without account memory',
      );
    }
  }

  if (isFreePlanTier(subscription.plan_tier) && !freeTrialEnabled) {
    const recovery = quotaRecoveryFor('free_trial_model_only', subscription);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message:
              'Free managed cloud access currently supports Auto Economy only. Select Auto Economy, upgrade your plan, or use local/BYOK.',
            type: 'invalid_request_error',
            code: 'free_trial_model_only',
            ...(recovery ? { recovery } : {}),
          },
        },
        { status: 403 },
      ),
    };
  }

  if (freeTrialEnabled) {
    const trialCaps = getModelMetadataById(requestedModel)?.capabilities;
    const trialProviderLower =
      getModelMetadataById(requestedModel)?.provider?.toLowerCase() ?? null;
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
    surface: chatSurface,
    policy: managedMemoryPolicy,
    memoryEnabled: chatRequest.memory_enabled,
  });

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
  const routeSelection =
    resolvedTaskType === classifierResult.type
      ? demoteLowConfidencePremiumSelection(
          chatRequest.model,
          resolvedTaskType,
          classifierResult.confidence,
        )
      : chatRequest.model;
  if (routeSelection !== chatRequest.model) {
    logger.info(
      {
        userId,
        requestId,
        requestedModel,
        routeSelection,
        taskType: resolvedTaskType,
        taskConfidence: classifierResult.confidence,
      },
      'Auto selection demoted below the premium profile on a weak classification',
    );
  }

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

  let routeBudgetRemainingCents: number | undefined;
  if (!freeTrialEnabled) {
    try {
      const budgetBalance = await (creditBalancePromise ??
        CreditService.getBalance((await scopedDbPromise).db, userId));
      if ((budgetBalance?.credits_allocated_cents ?? 0) > 0) {
        routeBudgetRemainingCents = budgetBalance?.credits_remaining_cents;
      }
    } catch (error) {
      creditBalancePromise = null;
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

  const routeUsage = {
    ...(routeBudgetRemainingCents !== undefined
      ? { budgetRemainingCents: routeBudgetRemainingCents }
      : {}),
    estimatedInputTokens: routeEstimatedInputTokens,
    taskFamily: routeTaskFamily,
  };

  const routeResolutionNowMs = Date.now();
  // The workspace policy is read BEFORE routing so the resolver can refuse a
  // candidate the workspace may not run. Reading it after, as this path used to,
  // meant the router could pick a blocked model and every later hop had to be
  // filtered separately. One read serves the resolver, the primary gate and
  // every downgrade below.
  const [baseRouteHealthState, routeAffinity, zeroDataRetentionPolicy, workspaceModelPolicy] =
    await timePhase(CHAT_TURN_PHASE.routeSelection, () =>
      Promise.all([
        resolveRouteHealthRuntimeState(routeSelection, routeResolutionNowMs),
        chatRequest.conversation_id
          ? getServedRouteAffinity(chatRequest.conversation_id)
          : Promise.resolve(null),
        scopedDbPromise.then((scoped) =>
          resolveZeroDataRetentionPolicy(scoped.db, userId, request),
        ),
        scopedDbPromise.then((scoped) => readWorkspaceModelPolicy(scoped, requestId)),
      ]),
    );
  const availableProviderIds = listAvailableManagedProviderIds();
  const { required: zeroDataRetentionOnly } = zeroDataRetentionPolicy;
  const zeroDataRetentionProviders = resolveZeroDataRetentionProviderOverrides();

  const baseRouteDecision = resolveWebCloudModelRoute(
    routeSelection,
    subscription.plan_tier,
    resolvedTaskType,
    routeUsage,
    undefined,
    {
      runtimeState: baseRouteHealthState,
      ...(routeAffinity ? { preferredRouteId: routeAffinity.routeId } : {}),
    },
    availableProviderIds,
    zeroDataRetentionOnly,
    zeroDataRetentionProviders,
    workspaceModelPolicy,
  );

  // The free lane is a stage OVER this resolver's output, so it re-runs the same
  // admission for the economy alias and ranks what that admits. Paid tiers never
  // enter it: `tierAllowedSlots` is what keeps free capacity off paid traffic and
  // paid traffic off free pools, and it is applied per tier inside the resolver.
  const freeLane = activateFreeLane({
    configuredMode: resolveFreeLaneMode(),
    isFreePlan: isFreePlanTier(subscription.plan_tier),
  });
  const freeLaneMode = freeLane.mode;
  // The slot preference rides this branch and no other, so it reaches the
  // resolver only for an exact-`free` plan with the lane switched on. The base
  // decision above never receives it, which is what keeps every other tier.
  // including the ones `normalizeTier` folds into `free`, byte-identical.
  const freeLaneRouteDecision = freeLaneObserves(freeLaneMode)
    ? resolveWebCloudModelRoute(
        FREE_LANE_SELECTION,
        subscription.plan_tier,
        resolvedTaskType,
        routeUsage,
        freeLane.preferSlots,
        {
          runtimeState: await resolveRouteHealthRuntimeState(
            FREE_LANE_SELECTION,
            routeResolutionNowMs,
          ),
        },
        availableProviderIds,
        zeroDataRetentionOnly,
        zeroDataRetentionProviders,
        workspaceModelPolicy,
      )
    : null;
  const freeLaneNowMs = Date.now();
  const freeLaneOutcome = await timePhase(CHAT_TURN_PHASE.routeSelection, () =>
    resolveFreeLaneOutcome({
      mode: freeLaneMode,
      requestId,
      nowMs: freeLaneNowMs,
      freeRouteDecision:
        freeLaneRouteDecision?.status === 'selected' ? freeLaneRouteDecision : null,
      dispatchedRouteId: baseRouteDecision.status === 'selected' ? baseRouteDecision.routeId : null,
    }),
  );

  if (freeLaneOutcome.kind === 'stranded') {
    return {
      ok: false,
      response: buildFreeCapacityUnavailableResponse(freeLaneOutcome.decision, freeLaneNowMs),
    };
  }

  const freeLanePlan = freeLaneOutcome.kind === 'dispatch' ? freeLaneOutcome.plan : null;
  const routeDecision: AutoRouteDecision =
    freeLaneOutcome.kind === 'dispatch' ? freeLaneOutcome.routeDecision : baseRouteDecision;

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
            message: isAutoModeModelId(requestedModel)
              ? AUTO_ROUTE_UNAVAILABLE_MESSAGE
              : EXPLICIT_ROUTE_UNAVAILABLE_MESSAGE,
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

  // The workspace administrator's model policy, checked AFTER auto-routing has
  // resolved. Checking the requested model instead would let a blocked model be
  // reached by asking for `auto` and having the router pick it, a bypass that
  // no amount of picker filtering closes.
  // The scoped handle resolved the active workspace back at line ~1300,
  // including the x-agi-organization-id override. Re-resolving here would add a
  // second round trip to the hot path for an answer already in hand.
  // Both provider identities, spelled out at the call site: the VENDOR the
  // catalog says owns this model and, separately, the TRANSPORT the dispatch
  // layer resolved. See `resolveProviderIdentities` for why one string was not
  // enough, and the evaluator for what each identity is allowed to decide.
  //
  // Evaluated against the snapshot the RESOLVER already answered to, not a
  // second read: the router refuses a governed candidate during admission, so
  // this gate is the belt to that braces, and it must not be able to disagree
  // with the plan by reading a row that changed in between. An explicit model
  // selection the resolver admitted for other reasons still stops here.
  const primaryIdentities = resolveProviderIdentities(chatRequest.model, routeDecision.routeId);
  const modelAccess = evaluateModelAccess(workspaceModelPolicy, {
    provider: primaryIdentities.vendor,
    transportProvider: primaryIdentities.transport,
    modelId: chatRequest.model,
  });
  if (!modelAccess.allowed) {
    logger.info(
      {
        requestId,
        provider: primaryIdentities.vendor,
        model: chatRequest.model,
        code: modelAccess.code,
      },
      '[model-policy] model refused by workspace policy',
    );
    return { ok: false, response: modelPolicyDenialResponse(modelAccess) };
  }

  const scopedForPolicy = await scopedDbPromise;
  const fallbackAllowedByPolicy = (candidateModel: string): boolean => {
    const decision = evaluateCandidateModelAccess(workspaceModelPolicy, candidateModel);
    if (!decision.allowed) {
      logger.warn(
        {
          requestId,
          organizationId: scopedForPolicy.organizationId,
          model: candidateModel,
          code: decision.code,
        },
        'Fallback candidate dropped by workspace model policy',
      );
    }
    return decision.allowed;
  };

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

  if (wantsJsonObject(chatRequest.response_format)) {
    applyJsonObjectMode(chatRequest, dynamicSystemMessageRefs);
  }

  const researchMode = researchModeAllowed(
    chatRequest,
    resolvedModelCaps,
    getModelMetadataById(chatRequest.model)?.contextWindow,
  );
  if (researchMode) {
    applyResearchMode(chatRequest, dynamicSystemMessageRefs);
  }
  // The user asked for Deep Research and the routed model cannot do it, so the
  // research loop will not run. Previously this was silent: the toggle stayed
  // lit, `runResearchLoop` never executed, and the user received an ordinary
  // answer with no header, no SSE status frame and nothing in the text to say
  // so. Mirrors `codeExecutionUnavailable`, which already discloses exactly this
  // shape of degradation.
  const researchUnavailable = chatRequest.research === true && !researchMode;

  if (
    !freeTrialEnabled &&
    !isAutoModeModelId(requestedModel) &&
    !checkModelTierAccess(chatRequest.model, subscription.plan_tier)
  ) {
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

  const preSkillMessageCount = chatRequest.messages.length;
  const loadSkillInstallOverrides = (): Promise<ReadonlyMap<string, boolean>> =>
    skillInstallOverridesPromise;
  if (chatRequest.skill_name) {
    const requestedSkillName = chatRequest.skill_name;
    let managedSkillCatalog: Skill[];
    try {
      managedSkillCatalog = await timePhase(CHAT_TURN_PHASE.skillCatalog, async () =>
        getManagedSkillCatalogForPlugins(
          await listEnabledPluginIds((await scopedDbPromise).db, userId),
        ),
      );
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
    managedSkillCatalog = filterSkillsByInstallOverrides(
      managedSkillCatalog,
      await loadSkillInstallOverrides(),
    );
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
    const skillCatalogForSelection = await timePhase(CHAT_TURN_PHASE.skillCatalog, async () =>
      resolveManagedSkillCatalogWithUserFallback(requestedSkillName, managedSkillCatalog, {
        db: (await scopedDbPromise).db,
        userId,
      }),
    );
    const selection = applyManagedSkillSelection(chatRequest, skillCatalogForSelection);
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
  } else {
    const offeredSkills = await timePhase(CHAT_TURN_PHASE.skillCatalog, () =>
      applyImplicitManagedSkillOffer(chatRequest, {
        prompt: lastUserText,
        surface: chatSurface,
        toolsCapable: resolvedModelCaps?.tools !== false,
        loadCatalog: async () =>
          filterSkillsByInstallOverrides(
            await getManagedSkillCatalog(),
            await loadSkillInstallOverrides(),
          ),
      }),
    );
    if (offeredSkills.length > 0) {
      logger.info(
        { requestId, userId, offeredSkills },
        '[skills] offered relevance-matched skills without an explicit selection',
      );
    }
  }
  if (chatRequest.messages.length > preSkillMessageCount) {
    dynamicSystemMessageRefs.add(chatRequest.messages[0] as object);
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

  const placesRequirement = resolvePlacesRequirement({
    userMessage: lastUserText,
    toolsCapable: resolvedModelCaps?.tools ?? true,
    stream: chatRequest.stream,
    backendConfigured: placesBackendConfigured(),
  });

  applyMapSearchCardCapability(chatRequest, {
    surface: chatSurface,
    toolsCapable: resolvedModelCaps?.tools ?? true,
    userMessage: lastUserText,
    placesSearchOffered: placesRequirement.offered,
  });

  const lastUserContent = lastUserMsg?.content;
  applyClarifyCardCapability(chatRequest, {
    surface: chatSurface,
    toolsCapable: resolvedModelCaps?.tools ?? true,
    userMessage: lastUserText,
    hasAttachment:
      Array.isArray(lastUserContent) && lastUserContent.some((part) => part.type !== 'text'),
  });

  const originalModel = chatRequest.model;
  let usedFallback = false;
  let fallbackReason: string | undefined;

  let provider = resolveProviderFromModel(chatRequest.model, routeDecision.routeId, {
    trustMode: MANAGED_WEB_CLOUD_TRUST_MODE,
  });

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

  let quotaWarningHeader: string | null = null;
  let computerUseSoftCapWarning: string | null = null;

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

  const rawEstimatedPromptTokens = collectManagedPromptMaterials(chatRequest).reduce(
    (sum, material) => {
      const baseTokens = Math.ceil(material.length / 3.5);
      const overheadTokens = 4;
      return sum + baseTokens + overheadTokens;
    },
    0,
  );
  const MAX_ESTIMATED_PROMPT_TOKENS = 1_000_000;
  const estimatedPromptTokens = Math.min(rawEstimatedPromptTokens, MAX_ESTIMATED_PROMPT_TOKENS);

  const providerLower = provider.toLowerCase();

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
    subscription.plan_tier,
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

  let maxTokens =
    chatRequest.max_tokens ||
    chatRequest.max_completion_tokens ||
    resolveMaxOutputTokens(chatRequest.model);
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
    let existingBalance = await timePhase(
      CHAT_TURN_PHASE.creditCheck,
      async () =>
        creditBalancePromise ?? CreditService.getBalance((await scopedDbPromise).db, userId),
    );

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
          { db: (await scopedDbPromise).db, stripePriceId: subscription.stripe_price_id },
        );

        if (accountId) {
          logger.info({ userId: userId, accountId }, 'Credits allocated successfully');
          existingBalance = await CreditService.getBalance((await scopedDbPromise).db, userId);
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

    const hasCredits = await timePhase(CHAT_TURN_PHASE.creditCheck, async () =>
      CreditService.checkAvailable((await scopedDbPromise).db, userId, estimatedCostCents),
    );

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
        fallbackAllowedByPolicy,
      );

      if (!fallbackModel && workspaceModelPolicy) {
        // Name the control that actually closed the door. A cheaper model that
        // exists and is affordable, and was removed only by the workspace
        // policy, reported as a credit limit sends the member off to buy
        // credits that cannot help them.
        const forbidden = findCheaperFallbackModel(
          chatRequest.model,
          provider,
          estimatedPromptTokens,
          maxTokens,
          () => true,
        );
        const decision = forbidden
          ? evaluateCandidateModelAccess(workspaceModelPolicy, forbidden.model)
          : null;
        if (decision && !decision.allowed) {
          return { ok: false, response: modelPolicyDenialResponse(decision) };
        }
      }

      if (fallbackModel) {
        const fallbackRouteId = `${fallbackModel.provider}/${fallbackModel.model}`;
        const fallbackProvider = resolveProviderFromModel(fallbackModel.model, fallbackRouteId, {
          trustMode: MANAGED_WEB_CLOUD_TRUST_MODE,
        });
        const fallbackCostCents = LLMCostCalculator.estimateCost(
          fallbackProvider,
          fallbackModel.model,
          estimatedPromptTokens,
          maxTokens,
        );

        const hasFallbackCredits = await CreditService.checkAvailable(
          (await scopedDbPromise).db,
          userId,
          fallbackCostCents,
        );

        if (hasFallbackCredits) {
          usedFallback = true;
          fallbackReason = 'insufficient_credits';
          chatRequest.model = fallbackModel.model;
          provider = fallbackProvider;
          estimatedCostCents = fallbackCostCents;
        } else {
          return {
            ok: false,
            response: handleCreditError({ code: 'MONTHLY_CREDIT_LIMIT_REACHED' }, subscription),
          };
        }
      } else {
        return {
          ok: false,
          response: handleCreditError({ code: 'MONTHLY_CREDIT_LIMIT_REACHED' }, subscription),
        };
      }
    }

    try {
      const scoped = await scopedDbPromise;
      if (scoped.userId !== userId) {
        throw new ManagedUsageRequestError(
          'Managed usage tenant mismatch.',
          403,
          'tenant_mismatch',
        );
      }
      if (quotaFeature === 'computer_use') {
        const decision = await assertTierUnitAllowance({
          db: scoped.db,
          userId,
          planTier: subscription.plan_tier,
          unit: 'computer_use_requests',
          requestedUnits: 1,
        });
        if (decision.softLimitReached && decision.softLimit !== null) {
          computerUseSoftCapWarning = buildComputerUseSoftCapWarningHeader({
            usedUnits: decision.consumed + decision.requested,
            softLimitUnits: decision.softLimit,
          });
        }
      }
      managedUsage = await timePhase(CHAT_TURN_PHASE.usageReservation, () =>
        reserveManagedUsageRequest({
          db: scoped.db,
          userId,
          organizationId: scoped.organizationId,
          idempotencyKey: requestId,
          requestHash: managedRequestHash,
          provider,
          model: chatRequest.model,
          estimatedCostCents,
          leaseSeconds: resolveManagedUsageLeaseSeconds(chatRequest),
          planTier: subscription.plan_tier,
          isFlagship: isFlagshipRequest,
          quotaFeature,
        }),
      );
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
      return { ok: false, response: managedUsageErrorResponse(managedError, subscription) };
    }

    quotaWarningHeader =
      buildQuotaWarningHeader({
        planTier: subscription.plan_tier,
        creditsUsedCents: existingBalance?.credits_used_cents ?? 0,
        creditsAllocatedCents: existingBalance?.credits_allocated_cents ?? 0,
        estimatedCostCents,
      }) ?? computerUseSoftCapWarning;
  }

  const dynamicSystemSourceMessages = chatRequest.messages.filter((msg) =>
    dynamicSystemMessageRefs.has(msg),
  );
  const staticSourceMessages = chatRequest.messages.filter(
    (msg) => !dynamicSystemMessageRefs.has(msg),
  );
  const internalMessages = staticSourceMessages.map((msg) => ({
    role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
    content: extractTextContent(msg.content),
    multimodal_content: Array.isArray(msg.content) ? (msg.content as unknown[]) : undefined,
    tool_calls: msg.tool_calls as unknown[] | undefined,
    tool_call_id: msg.tool_call_id,
  }));
  const dynamicSkillMemoryText = dynamicSystemSourceMessages
    .map((msg) => extractTextContent(msg.content))
    .filter((text) => text.length > 0)
    .join('\n\n');

  let resolvedTools: unknown[] | undefined = chatRequest.tools;
  if (chatRequest.web_search) {
    const googleGroundingPoolAvailable =
      providerLower === 'google' ? (await peekGroundingPool(providerLower)).withinPool : true;
    resolvedTools = appendWebSearchTool(providerLower, resolvedTools, resolvedModelCaps, {
      researchMode,
      googleGroundingPoolAvailable,
    });

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

  if (placesRequirement.offered) {
    resolvedTools = [...(resolvedTools ?? []), placesSearchToolDef()];
  }
  const placesEnforcement = resolveRequiredPlacesEnforcement({
    required: placesRequirement.required,
    requestedToolChoice: chatRequest.tool_choice,
    model: chatRequest.model,
    tools: resolvedTools,
  });
  if (placesEnforcement.mode === 'nudge' || placesRequirement.unavailable) {
    internalMessages.unshift({
      role: 'system',
      content: placesRequirement.unavailable
        ? PLACES_UNAVAILABLE_SYSTEM_NOTICE
        : REQUIRED_PLACES_SYSTEM_NUDGE,
      multimodal_content: undefined,
      tool_calls: undefined,
      tool_call_id: undefined,
    });
  }

  const searchRequirement = resolveWebSearchRequirement({
    webSearchEnabled: chatRequest.web_search,
    agiWorkRun: chatRequest.work_mode === 'agiwork',
    researchTask: resolvedTaskType === 'research',
    userMessage: lastUserText,
  });
  const searchEnforcement = resolveRequiredSearchEnforcement({
    required: searchRequirement.required,
    requestedToolChoice: chatRequest.tool_choice,
    stream: chatRequest.stream,
    model: chatRequest.model,
    tools: resolvedTools,
  });
  if (searchEnforcement.mode === 'nudge') {
    internalMessages.unshift({
      role: 'system',
      content: REQUIRED_SEARCH_SYSTEM_NUDGE,
      multimodal_content: undefined,
      tool_calls: undefined,
      tool_call_id: undefined,
    });
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

  // Asking the model to disclose the downgrade is not the same as disclosing
  // it: the preamble below tells the model to say Deep Research did not run,
  // and the observed turn instead produced a confident answer with its own
  // bibliography. The header does not depend on the model complying.
  if (researchUnavailable && !fallbackReason) {
    fallbackReason = 'research_unsupported_model';
  }

  let codeExecutionUnavailable = false;
  if (chatRequest.code_execution) {
    const turnCodeExecution = resolveTurnCodeExecutionTools({
      provider: providerLower,
      stream: chatRequest.stream,
      e2bEnabled: e2bProvisioningReady(),
      toolsCapable: resolvedModelCaps?.tools ?? true,
      codeExecutionCapable: resolvedModelCaps?.codeExecution === true,
    });
    if (turnCodeExecution.tools.length > 0) {
      resolvedTools = [...(resolvedTools ?? []), ...turnCodeExecution.tools];
    }
    codeExecutionUnavailable = turnCodeExecution.unavailable;
  }

  if (
    !managedMemoryPolicy.allowToolAssistedGeneration &&
    isManagedMemoryToolAssistedTurn(chatRequest, resolvedTools)
  ) {
    autoMemoryFacts = [];
  }

  if (chatSurface !== 'api') {
    const capabilityPreamble = buildCapabilityPreamble({
      tools: resolvedTools,
      researchUnavailable,
      timeZone: chatRequest.client_timezone,
      codeExecutionUnavailable,
    });

    const customInstructionsPreamble = await timePhase(
      CHAT_TURN_PHASE.customInstructions,
      () => customInstructionsPromise ?? Promise.resolve(null),
    );
    const preamble = composeManagedSystemPreamble({
      capabilityPreamble,
      customInstructionsPreamble,
      dynamicSystemAddition: dynamicSkillMemoryText,
    });
    const preambleSplit = preamble ? splitSystemPromptCacheBoundary(preamble) : undefined;
    const stablePreambleBlock = preambleSplit ? preambleSplit.stablePrefix : preamble;
    const dynamicPreambleBlock = preambleSplit ? preambleSplit.dynamicSuffix : '';

    if (stablePreambleBlock) {
      internalMessages.unshift({
        role: 'system',
        content: stablePreambleBlock,
        multimodal_content: undefined,
        tool_calls: undefined,
        tool_call_id: undefined,
      });
    }
    if (dynamicPreambleBlock) {
      // Inserted after every other leading system message (the client's own
      // system text, MCP context, JSON/research mode directives) so those
      // stay ahead of the boundary too: none of them vary with the timestamp
      // or matched skills/memories, so none belong in the uncacheable tail.
      const firstNonSystemIndex = internalMessages.findIndex((msg) => msg.role !== 'system');
      const dynamicInsertIndex =
        firstNonSystemIndex === -1 ? internalMessages.length : firstNonSystemIndex;
      internalMessages.splice(dynamicInsertIndex, 0, {
        role: 'system',
        content: `${SYSTEM_PROMPT_CACHE_BOUNDARY}${dynamicPreambleBlock}`,
        multimodal_content: undefined,
        tool_calls: undefined,
        tool_call_id: undefined,
      });
    }
  } else if (dynamicSkillMemoryText) {
    internalMessages.unshift({
      role: 'system',
      content: dynamicSkillMemoryText,
      multimodal_content: undefined,
      tool_calls: undefined,
      tool_call_id: undefined,
    });
  }

  const managedCodeToolChoice = resolveInitialManagedCodeToolChoice({
    requestedToolChoice: chatRequest.tool_choice,
    codeExecution: chatRequest.code_execution,
    stream: chatRequest.stream,
    provider: providerLower,
    model: chatRequest.model,
    e2bEnabled: e2bProvisioningReady(),
    toolsCapable: resolvedModelCaps?.tools ?? true,
  });
  const llmRequest = {
    model: chatRequest.model,
    messages: internalMessages,
    temperature: chatRequest.temperature,
    max_tokens: maxTokens,
    stream: chatRequest.stream,
    tools: resolvedTools as unknown[] | undefined,
    tool_choice:
      managedCodeToolChoice ??
      placesEnforcement.toolChoice ??
      searchEnforcement.toolChoice ??
      chatRequest.tool_choice,
    thinking_mode: chatRequest.thinking_mode,
    thinking: thinkingConfig,
    effort: effectiveEffort,
    usePromptCache: chatRequest.use_prompt_cache,
  };

  const scopedForCompaction = await scopedDbPromise;
  const contextTrim = await timePhase(CHAT_TURN_PHASE.contextCompaction, () =>
    compactContextWindow({
      messages: internalMessages,
      model: chatRequest.model,
      maxOutputTokens: maxTokens,
      db: scopedForCompaction.db,
      userId,
      organizationId: scopedForCompaction.organizationId,
      conversationId: chatRequest.conversation_id ?? null,
      isTemporary: conversationIsTemporary,
      planTier: subscription.plan_tier,
      resolveEconomyRoute: () => resolveWebCloudModelRoute('auto', 'free', 'simple_chat'),
    }),
  );

  if (freeTrialEnabled) {
    const trialReservationResult = await beginFreeTrialRequest({ userId, requestId });
    if (!trialReservationResult.ok) return freeTrialBudgetReachedResponse(subscription);

    freeTrial = trialReservationResult.reservation;
    const fitted = applyFreeTrialProviderBudget({
      reservation: freeTrial,
      provider,
      request: llmRequest,
    });
    if (!fitted.ok) {
      await settleFreeTrialRequest({ reservation: freeTrial, outcome: 'failed' });
      return freeTrialBudgetReachedResponse(subscription);
    }
    maxTokens = llmRequest.max_tokens;
  }

  const organizationId = scopedForCompaction.organizationId;

  return {
    ok: true,
    requestId,
    chatSurface,
    organizationId,
    zeroDataRetentionOnly,
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
    // Policy-filtered by the RESOLVER, not here: `organizationPolicy` is an
    // admission input, so a candidate the workspace may not run never enters
    // the plan and no rotation can land on one. An empty list is a
    // rotation-free request served by the primary model.
    // A free-lane dispatch keeps its plan: `routeDecision.fallbacks` is the
    // stage's ranked tail, every member already verified zero-cost, so rotation
    // cannot leave the lane. The trial path stays rotation-free as before.
    fallbackModels:
      freeTrialEnabled && !freeLanePlan
        ? []
        : routeDecision.fallbacks.map((fallback) => fallback.modelKey),
    ...(freeLanePlan ? { freeLane: freeLanePlan, routeLane: ROUTE_LANES.free } : {}),
    // Carried, not re-read: the OpenRouter route-retry inside managed failover
    // is outside the plan above and must answer to this same snapshot.
    modelPolicy: workspaceModelPolicy,
    subscriptionTier: subscription.plan_tier,
    routePlanId: buildInterimRoutePlanId(routeDecision),
    resolvedTaskType,
    searchRequirement,
    searchEnforcement,
    placesRequirement,
    placesEnforcement,
    classifierConfidence: classifierResult.confidence,
    resolvedSlot,
    quotaFeature,
    quotaWarningHeader,
    isFlagshipRequest,
    researchMode,
    ...(researchMode && chatRequest.research_resume
      ? {
          researchResume: {
            sources: chatRequest.research_resume.sources ?? [],
            steps: (chatRequest.research_resume.steps ?? []) as ResearchStep[],
            approvedSteps: (chatRequest.research_resume.approved_steps ?? []) as ResearchStep[],
          },
        }
      : {}),
    indicResult,
    freeTrial,
    contextTrim,
    ...(routeAffinity ? { routeAffinity } : {}),
    llmRequest,
  };
}
