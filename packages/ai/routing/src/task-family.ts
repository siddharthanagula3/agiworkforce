/**
 * Deterministic task-family fast path.
 *
 * Design source of truth:
 * `docs/design/execution-plan-contract-and-cpst-2026-08-05.md` §6 ("8–12 task
 * families, drawn from and NARROWING the canonical 11-value `RoutingTaskType`
 * taxonomy") and §5 Stage 1/Stage 2.
 *
 * WHAT THIS IS
 * ------------
 * A pure, synchronous function from the STRUCTURAL signals a request already
 * carries — the work-mode toggle, the explicit tool toggles, attachment kinds,
 * the token/character length estimate, and the surface (runtime profile id) —
 * onto one of twelve task families. It performs no LLM call, no network I/O,
 * no database read, and it never reads message prose.
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is NOT a replacement for `classifyTaskLocally`. The canonical
 * `RoutingTaskType` keeps being produced exactly as it is today, and it is
 * still the ONLY thing that drives admission (`evaluateEligibility`,
 * `requiredCapabilities`, `requiredHarnessFeatures`, `preferredSlots`,
 * `tierAllowedSlots`). The family is a strictly narrower LABEL layered on top:
 * it selects a per-family quality floor and a session stickiness key, and it
 * can only reorder an already-admitted candidate set. See
 * `task-family-routing.ts` for the guarantee and the property that proves it.
 *
 * WHY STRUCTURAL SIGNALS ONLY
 * ---------------------------
 * Prose heuristics already exist in `classify.ts` and already feed the task
 * type. Duplicating them here would produce a second, silently diverging prose
 * classifier. The families below are therefore decided ONLY from signals whose
 * values are set by the caller, not inferred from text:
 *
 * | signal                    | request field (web managed-cloud path)                              |
 * | ------------------------- | ------------------------------------------------------------------- |
 * | work mode                 | `work_mode` (`CLOUD_WORK_MODES` = `chat` \| `agiwork`)               |
 * | explicit tool toggles     | `research`, `web_search`, `web_fetch`, `code_execution`,             |
 * |                           | `office_creation`                                                    |
 * | caller-declared tools     | `tools[]`, `tool_choice`                                             |
 * | attachments               | message content parts (`image_url`; `type: 'screenshot'`)            |
 * | length                    | `estimateTokens` over history + outgoing turn; outgoing turn chars   |
 * | surface                   | the canonical `runtimeProfileId` (e.g. `web/cloud-chat`)             |
 *
 * DELIBERATE GAPS — recorded, not papered over:
 *  - **Project type is not a signal.** Nothing in the managed-cloud routing
 *    path carries a project type today, so no family keys off one.
 *  - **`surface` is carried but not yet decisive.** It is recorded on the
 *    signals record for shadow-mode analysis; no family branches on it,
 *    because only one runtime profile (`web/cloud-chat`) reaches this stage.
 *  - **Content-only families are absent.** Translation, extraction, and
 *    safety-sensitivity cannot be decided from the structural signal set. They
 *    are NOT in the taxonomy rather than being faked with a regex, which would
 *    be a second prose classifier by another name.
 *  - Attachment kinds other than image/video are declared on the signal type
 *    (`file.asset_id` parts exist on the request schema) but no family keys off
 *    them, because the managed-cloud routing path only builds image
 *    attachments today.
 *
 * @module routing/task-family
 * @packageDocumentation
 */

import type { CloudWorkMode, RoutingTaskType } from '@agiworkforce/types';

import type { RoutingAttachment } from './types';

// ============================================================================
// Taxonomy
// ============================================================================

/**
 * The twelve task families, ordered as they are evaluated (first match wins).
 *
 * Each family narrows one or more canonical `RoutingTaskType` values; the
 * mapping itself is curated policy and lives in `routing-policies.json` under
 * `auto.taskFamilies.<family>.appliesToTaskTypes`, NOT here — the classifier
 * decides "which family", the policy decides "which tasks that family may
 * refine".
 */
export const TASK_FAMILIES = [
  'deep_research',
  'agentic_work',
  'document_authoring',
  'code_execution',
  'web_grounded_answer',
  'screen_automation',
  'vision',
  'long_context',
  'caller_tool_loop',
  'extended_thinking',
  'simple_chat',
  'general_chat',
] as const;

/** One of the twelve deterministic task families. */
export type TaskFamily = (typeof TASK_FAMILIES)[number];

/** Runtime membership test — narrows an untrusted string onto the taxonomy. */
export function isTaskFamily(value: unknown): value is TaskFamily {
  return typeof value === 'string' && (TASK_FAMILIES as readonly string[]).includes(value);
}

/**
 * Explainability vocabulary for the classifier (Decision #10 — every routing
 * decision carries a reason code, and nothing is substituted silently).
 *
 * The `ambiguous_*` codes are terminal: they mean the fast path declined, and
 * the caller must run the existing Auto policy unchanged.
 */
export type TaskFamilyReasonCode =
  | 'family_research_mode'
  | 'family_work_mode_agiwork'
  | 'family_office_creation'
  | 'family_code_execution'
  | 'family_web_tool'
  | 'family_screenshot_with_tools'
  | 'family_visual_attachment'
  | 'family_context_over_threshold'
  | 'family_caller_tools'
  | 'family_thinking_mode'
  | 'family_short_plain_turn'
  | 'family_plain_turn'
  | 'ambiguous_no_signals'
  | 'ambiguous_unknown_length';

/** Result of the deterministic fast path. `family: null` means fall through. */
export interface TaskFamilyClassification {
  /** The resolved family, or `null` when the fast path declined to decide. */
  family: TaskFamily | null;
  /** Why. Always present, including for the ambiguous outcomes. */
  reasonCode: TaskFamilyReasonCode;
}

// ============================================================================
// Signals
// ============================================================================

/**
 * The structural signals the fast path is allowed to read.
 *
 * Every field is optional because every field is genuinely optional on the
 * wire. An absent field means UNKNOWN — it never means `false`. That
 * distinction is why the residual branches require an explicit
 * `messageCharCount` and otherwise return `ambiguous_unknown_length` instead
 * of guessing `simple_chat`.
 */
export interface TaskFamilySignals {
  /** `work_mode` — product execution mode, not a provider hint. */
  workMode?: CloudWorkMode | null;
  /** `research` — the Deep Research toggle. */
  researchMode?: boolean;
  /** `web_search` — server-owned web search tool toggle. */
  webSearch?: boolean;
  /** `web_fetch` — server-owned fetch tool toggle. */
  webFetch?: boolean;
  /** `code_execution` — sandboxed run-code toggle. */
  codeExecution?: boolean;
  /** `office_creation` — server-owned document generation toggle. */
  officeCreation?: boolean;
  /** `tools.length` — count of caller-declared tool definitions. */
  declaredToolCount?: number;
  /** True when `tool_choice` is present and is not `'none'`. */
  toolChoiceForced?: boolean;
  /** Attachment shapes, read exactly as `classifyTaskLocally` reads them. */
  attachments?: readonly RoutingAttachment[];
  /** `estimateTokens` summed over prior history plus the outgoing turn. */
  estimatedInputTokens?: number;
  /** Character length of the outgoing user turn. */
  messageCharCount?: number;
  /** Prior turns already in the conversation. */
  priorTurnCount?: number;
  /** `thinking_mode` — caller-requested extended thinking. */
  thinkingMode?: boolean;
  /**
   * Canonical runtime profile id (the surface), e.g. `web/cloud-chat`.
   * Recorded for shadow-mode analysis; no family branches on it today because
   * only one runtime profile reaches this stage.
   */
  runtimeProfileId?: string;
}

// ============================================================================
// Thresholds
// ============================================================================

/**
 * Cumulative-token threshold for `long_context`. Deliberately the SAME number
 * and the SAME strict comparison as `classifyTaskLocally` (`classify.ts`, step
 * 4) and `auto.tasks.long_context.minimumContextTokens` in
 * `routing-policies.json`, so the family can never disagree with the task type
 * about what "long" means.
 */
export const LONG_CONTEXT_TOKEN_THRESHOLD = 50_000;

/**
 * Character length below which a tool-free, attachment-free turn is treated as
 * `simple_chat`. Same number as `classifyTaskLocally`'s simple-chat guard
 * (`message.length < 80`); the word-count half of that guard is deliberately
 * NOT copied here because it reads the message body.
 */
export const SIMPLE_CHAT_MAX_CHARS = 80;

// ============================================================================
// Classifier
// ============================================================================

function hasAnySignal(signals: TaskFamilySignals): boolean {
  return (
    signals.workMode !== undefined ||
    signals.researchMode !== undefined ||
    signals.webSearch !== undefined ||
    signals.webFetch !== undefined ||
    signals.codeExecution !== undefined ||
    signals.officeCreation !== undefined ||
    signals.declaredToolCount !== undefined ||
    signals.toolChoiceForced !== undefined ||
    signals.attachments !== undefined ||
    signals.estimatedInputTokens !== undefined ||
    signals.messageCharCount !== undefined ||
    signals.priorTurnCount !== undefined ||
    signals.thinkingMode !== undefined ||
    signals.runtimeProfileId !== undefined
  );
}

function callerToolsPresent(signals: TaskFamilySignals): boolean {
  return (signals.declaredToolCount ?? 0) > 0 || signals.toolChoiceForced === true;
}

/**
 * Classify a request into exactly one task family from structural signals.
 *
 * Priority order mirrors the two precedence rules that already exist in the
 * managed-cloud path so a family can never contradict them:
 *
 *  1. `resolveToolAwareTaskType` (request-processor) — `research` wins, then
 *     `work_mode === 'agiwork'` / `office_creation`, then `code_execution`.
 *  2. `classifyTaskLocally` — attachments outrank the token-budget guard,
 *     which outranks everything prose-derived.
 *
 * `web_search` / `web_fetch` sit between the two because nothing in the repo
 * currently orders them: they are explicit tool toggles like the three above,
 * but unlike those three they do NOT change the canonical task type today.
 *
 * @returns the family plus a reason code, or `{ family: null }` when the
 * structural signals are not decisive — in which case the caller MUST run the
 * existing Auto policy unchanged.
 */
export function classifyTaskFamily(signals: TaskFamilySignals): TaskFamilyClassification {
  if (!hasAnySignal(signals)) {
    return { family: null, reasonCode: 'ambiguous_no_signals' };
  }

  // ─── Explicit tool/mode toggles (mirrors resolveToolAwareTaskType) ───────
  if (signals.researchMode === true) {
    return { family: 'deep_research', reasonCode: 'family_research_mode' };
  }
  if (signals.workMode === 'agiwork') {
    return { family: 'agentic_work', reasonCode: 'family_work_mode_agiwork' };
  }
  if (signals.officeCreation === true) {
    return { family: 'document_authoring', reasonCode: 'family_office_creation' };
  }
  if (signals.codeExecution === true) {
    return { family: 'code_execution', reasonCode: 'family_code_execution' };
  }
  if (signals.webSearch === true || signals.webFetch === true) {
    return { family: 'web_grounded_answer', reasonCode: 'family_web_tool' };
  }

  // ─── Attachments (mirrors classifyTaskLocally steps 2–3) ────────────────
  const attachments = signals.attachments;
  if (attachments && attachments.length > 0) {
    const hasScreenshot = attachments.some((attachment) => attachment.type === 'screenshot');
    // A screenshot ALONE is not automation — `classifyTaskLocally` also
    // requires an automation verb before it says `computer-use`. The
    // structural stand-in for "there is a loop that can act" is a
    // caller-declared tool surface; without one this falls through to vision,
    // exactly as a bare screenshot does today.
    if (hasScreenshot && callerToolsPresent(signals)) {
      return { family: 'screen_automation', reasonCode: 'family_screenshot_with_tools' };
    }
    const hasVisual = attachments.some(
      (attachment) =>
        attachment.mime.startsWith('image/') ||
        attachment.mime.startsWith('video/') ||
        attachment.type === 'screenshot',
    );
    if (hasVisual) {
      return { family: 'vision', reasonCode: 'family_visual_attachment' };
    }
  }

  // ─── Token budget (mirrors classifyTaskLocally step 4, same operator) ────
  if ((signals.estimatedInputTokens ?? 0) > LONG_CONTEXT_TOKEN_THRESHOLD) {
    return { family: 'long_context', reasonCode: 'family_context_over_threshold' };
  }

  // ─── Caller-supplied tool surface ───────────────────────────────────────
  if (callerToolsPresent(signals)) {
    return { family: 'caller_tool_loop', reasonCode: 'family_caller_tools' };
  }

  if (signals.thinkingMode === true) {
    return { family: 'extended_thinking', reasonCode: 'family_thinking_mode' };
  }

  // ─── Residual: length is the only remaining structural discriminator ────
  // An absent length is UNKNOWN, not "short". Guessing here would silently
  // route long plain turns to the economy band.
  if (signals.messageCharCount === undefined) {
    return { family: null, reasonCode: 'ambiguous_unknown_length' };
  }
  if (signals.messageCharCount < SIMPLE_CHAT_MAX_CHARS) {
    return { family: 'simple_chat', reasonCode: 'family_short_plain_turn' };
  }
  return { family: 'general_chat', reasonCode: 'family_plain_turn' };
}

/**
 * Canonical task types each family is DESIGNED to narrow, for documentation
 * and test assertions only.
 *
 * The authoritative mapping is curated policy
 * (`auto.taskFamilies.<family>.appliesToTaskTypes`). This constant exists so a
 * test can prove the curated policy still agrees with the classifier's intent
 * rather than drifting from it unnoticed; it is never read at routing time.
 */
export const TASK_FAMILY_INTENDED_TASK_TYPES: Readonly<
  Record<TaskFamily, readonly RoutingTaskType[]>
> = {
  deep_research: ['research'],
  agentic_work: ['agentic'],
  document_authoring: ['agentic'],
  code_execution: ['coding'],
  web_grounded_answer: ['research', 'general', 'simple_chat'],
  screen_automation: ['computer-use'],
  vision: ['multimodal'],
  long_context: ['long_context'],
  caller_tool_loop: ['general', 'simple_chat', 'coding', 'agentic'],
  extended_thinking: ['reasoning', 'general', 'coding'],
  simple_chat: ['simple_chat'],
  general_chat: ['general', 'creative_writing'],
} as const;
