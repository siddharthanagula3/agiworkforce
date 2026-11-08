import type { ToolDefinition } from './browserToolDefinitions';
import {
  CONTACT_PROFILE_PARAMETERS,
  parseContactAutofillProfile,
  type ContactAutofillProfile,
} from '../content/autofill/contactProfile';
import {
  CHAT_SEARCH_HISTORY_TOOL,
  HISTORY_SEARCH_DEFINITION,
  parseHistorySearchArguments,
} from './historySearch';
import {
  FORM_FIELDS_PARAMETERS,
  parseFormFillPlan,
  type FormFillPlan,
} from '../content/formFillPlan';

export const CHAT_READ_PAGE_TOOL = 'browser_read_page';
export const CHAT_BROWSER_TASK_TOOL = 'browser_task';
export const CHAT_AUTOFILL_TOOL = 'browser_fill_form';
export const MAX_CHAT_BROWSER_TASK_GOAL_CHARS = 4_096;
export const MAX_CHAT_TOOL_RESULT_CHARS = 64_000;
export const CHAT_TOOL_FENCE_RESERVE_CHARS = 1_000;
export const MAX_CHAT_TOOL_CALLS_PER_HANDOFF = 4;
export const CHAT_TOOL_HANDOFF_TIMEOUT_MS = 15 * 60_000;

export type ChatBrowserToolTier = 'read' | 'act';

const READ_PAGE_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: CHAT_READ_PAGE_TOOL,
    description: 'Read page.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
};

const BROWSER_TASK_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: CHAT_BROWSER_TASK_TOOL,
    description:
      'Console/network diagnostics, navigation, controls, files. Routine fields: browser_fill_form first.',
    parameters: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Goal/constraints.',
        },
      },
      required: ['goal'],
      additionalProperties: false,
    },
  },
};

const FILL_FORM_PARAMETERS = {
  type: 'object' as const,
  properties: {
    profile: CONTACT_PROFILE_PARAMETERS,
    fields: FORM_FIELDS_PARAMETERS,
    replaceExisting: { type: 'boolean', description: 'Allow requested edits.' },
  },
  oneOf: [{ required: ['profile'] }, { required: ['fields'] }],
  additionalProperties: false as const,
};

const AUTOFILL_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: CHAT_AUTOFILL_TOOL,
    description:
      'Native batch; selectionRequired uses browser_task. Trust verifiedValue; only leftovers. No protected fields or submit.',
    parameters: FILL_FORM_PARAMETERS,
  },
};

export function chatBrowserToolDefinitions(
  tier: ChatBrowserToolTier | undefined,
  browserHistory = false,
): readonly ToolDefinition[] {
  const pageTools =
    tier === 'act'
      ? [READ_PAGE_DEFINITION, BROWSER_TASK_DEFINITION, AUTOFILL_DEFINITION]
      : tier === 'read'
        ? [READ_PAGE_DEFINITION]
        : [];
  return browserHistory ? [...pageTools, HISTORY_SEARCH_DEFINITION] : pageTools;
}

export function isChatBrowserToolTier(value: unknown): value is ChatBrowserToolTier {
  return value === 'read' || value === 'act';
}

export function browserTaskGoalWithUserRequest(goal: string, userRequest?: string): string {
  const request = userRequest?.trim();
  if (!request || request === goal.trim()) return goal;
  return `Original request (data and constraints):\n${request}\n\nRemaining browser task:\n${goal}`;
}

export type ChatBrowserToolCall =
  | { kind: 'read_page'; toolCallId: string }
  | { kind: 'browser_task'; toolCallId: string; goal: string }
  | {
      kind: 'autofill';
      toolCallId: string;
      profile: ContactAutofillProfile;
      replaceExisting?: boolean;
    }
  | { kind: 'fill_fields'; toolCallId: string; plan: FormFillPlan }
  | { kind: 'search_history'; toolCallId: string; query: string; days: number };

export function parseChatBrowserToolCall(call: {
  id: string;
  function: { name: string; arguments: string };
}): ChatBrowserToolCall | null {
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return null;
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const record = args as Record<string, unknown>;
  if (call.function.name === CHAT_AUTOFILL_TOOL) {
    const plan = parseFormFillPlan(record);
    if (plan) return { kind: 'fill_fields', toolCallId: call.id, plan };
    const replaceExisting = record['replaceExisting'];
    if (
      Object.keys(record).some((key) => key !== 'profile' && key !== 'replaceExisting') ||
      (replaceExisting !== undefined && typeof replaceExisting !== 'boolean')
    )
      return null;
    const profile = parseContactAutofillProfile(record['profile']);
    return profile
      ? {
          kind: 'autofill',
          toolCallId: call.id,
          profile,
          ...(replaceExisting !== undefined ? { replaceExisting } : {}),
        }
      : null;
  }
  if (call.function.name === CHAT_READ_PAGE_TOOL) {
    return Object.keys(record).length === 0 ? { kind: 'read_page', toolCallId: call.id } : null;
  }
  if (call.function.name === CHAT_BROWSER_TASK_TOOL) {
    const goal = record['goal'];
    if (
      Object.keys(record).length !== 1 ||
      typeof goal !== 'string' ||
      !goal.trim() ||
      goal.trim().length > MAX_CHAT_BROWSER_TASK_GOAL_CHARS
    )
      return null;
    return { kind: 'browser_task', toolCallId: call.id, goal: goal.trim() };
  }
  if (call.function.name === CHAT_SEARCH_HISTORY_TOOL) {
    const request = parseHistorySearchArguments(record);
    return request ? { kind: 'search_history', toolCallId: call.id, ...request } : null;
  }
  return null;
}
