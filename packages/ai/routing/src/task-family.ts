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
