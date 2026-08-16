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

export type TaskFamily = (typeof TASK_FAMILIES)[number];

export function isTaskFamily(value: unknown): value is TaskFamily {
  return typeof value === 'string' && (TASK_FAMILIES as readonly string[]).includes(value);
}

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

export interface TaskFamilyClassification {
  family: TaskFamily | null;
  reasonCode: TaskFamilyReasonCode;
}

export interface TaskFamilySignals {
  workMode?: CloudWorkMode | null;
  researchMode?: boolean;
  webSearch?: boolean;
  webFetch?: boolean;
  codeExecution?: boolean;
  officeCreation?: boolean;
  declaredToolCount?: number;
  toolChoiceForced?: boolean;
  attachments?: readonly RoutingAttachment[];
  estimatedInputTokens?: number;
  messageCharCount?: number;
  priorTurnCount?: number;
  thinkingMode?: boolean;
  runtimeProfileId?: string;
}

export const LONG_CONTEXT_TOKEN_THRESHOLD = 50_000;

export const SIMPLE_CHAT_MAX_CHARS = 80;

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

  const attachments = signals.attachments;
  if (attachments && attachments.length > 0) {
    const hasScreenshot = attachments.some((attachment) => attachment.type === 'screenshot');
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

  if ((signals.estimatedInputTokens ?? 0) > LONG_CONTEXT_TOKEN_THRESHOLD) {
    return { family: 'long_context', reasonCode: 'family_context_over_threshold' };
  }

  if (callerToolsPresent(signals)) {
    return { family: 'caller_tool_loop', reasonCode: 'family_caller_tools' };
  }

  if (signals.thinkingMode === true) {
    return { family: 'extended_thinking', reasonCode: 'family_thinking_mode' };
  }

  if (signals.messageCharCount === undefined) {
    return { family: null, reasonCode: 'ambiguous_unknown_length' };
  }
  if (signals.messageCharCount < SIMPLE_CHAT_MAX_CHARS) {
    return { family: 'simple_chat', reasonCode: 'family_short_plain_turn' };
  }
  return { family: 'general_chat', reasonCode: 'family_plain_turn' };
}

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
