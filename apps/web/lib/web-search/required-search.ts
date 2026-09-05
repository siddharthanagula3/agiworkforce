import { detectExplicitWebSearchIntent } from '@agiworkforce/search';

import {
  forcedFunctionToolChoice,
  isForcedToolChoiceFor,
  modelAcceptsForcedToolChoice,
} from '@/lib/required-tool-call';

import { WEB_SEARCH_TOOL } from './web-search-tool';

export type RequiredSearchSource = 'toggle' | 'work_mode' | 'explicit_intent' | 'research_task';

export type WebSearchRequirement = {
  required: boolean;
  source: RequiredSearchSource | null;
};

const NOT_REQUIRED: WebSearchRequirement = { required: false, source: null };

/**
 * Is a search mandatory for this turn, and which signal made it so?
 *
 * Search stops being a suggestion the moment the user asked for one. A turn
 * that reaches the model with the tool merely offered is a turn the model is
 * free to answer from memory, which is what produced answers with no sources
 * on turns whose whole point was current information.
 */
export function resolveWebSearchRequirement(input: {
  webSearchEnabled: boolean | undefined;
  agiWorkRun: boolean;
  researchTask: boolean;
  userMessage: string;
}): WebSearchRequirement {
  if (input.webSearchEnabled === false) return NOT_REQUIRED;
  if (input.agiWorkRun) return { required: true, source: 'work_mode' };
  if (input.webSearchEnabled === true) return { required: true, source: 'toggle' };
  if (detectExplicitWebSearchIntent(input.userMessage) !== null) {
    return { required: true, source: 'explicit_intent' };
  }
  if (input.researchTask) return { required: true, source: 'research_task' };
  return NOT_REQUIRED;
}

export type AttachedSearchToolKind =
  | 'generic-function'
  | 'openai-hosted'
  | 'anthropic-server'
  | 'google-builtin';

const ANTHROPIC_SERVER_SEARCH_TYPE_PREFIX = `${WEB_SEARCH_TOOL}_`;
const GOOGLE_BUILTIN_SEARCH_KEY = 'google_search';

/**
 * Which shape of search tool this request actually carries. The four are not
 * interchangeable: only two of them accept a tool choice, so the caller cannot
 * treat "a search tool is attached" as "a search can be required".
 */
export function classifyAttachedSearchTool(
  tools: readonly unknown[] | undefined,
): AttachedSearchToolKind | null {
  for (const tool of tools ?? []) {
    if (!tool || typeof tool !== 'object') continue;
    const record = tool as Record<string, unknown>;

    const fn = record['function'];
    if (record['type'] === 'function' && fn && typeof fn === 'object') {
      if ((fn as Record<string, unknown>)['name'] === WEB_SEARCH_TOOL) return 'generic-function';
      continue;
    }

    const type = record['type'];
    if (typeof type === 'string' && type.startsWith(ANTHROPIC_SERVER_SEARCH_TYPE_PREFIX)) {
      return 'anthropic-server';
    }
    if (type === WEB_SEARCH_TOOL) return 'openai-hosted';
    if (
      record[GOOGLE_BUILTIN_SEARCH_KEY] &&
      typeof record[GOOGLE_BUILTIN_SEARCH_KEY] === 'object'
    ) {
      return 'google-builtin';
    }
  }
  return null;
}

/**
 * Anthropic and Google both document search triggering as the model's own
 * decision, steerable by the system prompt and capped by `max_uses`, with no
 * tool-choice equivalent for the server-side tool. Sending one anyway either
 * errors or is ignored, so those two shapes take the prompt path instead.
 */
const TOOL_CHOICE_CAPABLE_SEARCH_TOOLS: ReadonlySet<AttachedSearchToolKind> =
  new Set<AttachedSearchToolKind>(['generic-function', 'openai-hosted']);

export const REQUIRED_SEARCH_SYSTEM_NUDGE =
  'This turn requires live web results. Call the web search tool before you answer, ' +
  'base the answer on what it returns, and cite the pages you used. Do not answer from ' +
  'memory alone, and do not tell the user to search for themselves. If a search returns ' +
  'nothing usable, say so plainly instead of substituting your own recollection.';

/**
 * Sent as the user turn of a retry, not as a system line: the nudge already
 * failed as an instruction, and a provider that ignored the system prompt
 * still answers the last thing the user said.
 */
export const REQUIRED_SEARCH_RETRY_DIRECTIVE =
  'That answer used no live sources. Run the web search tool now, then answer only ' +
  'from what it returns and cite the pages you used.';

export type RequiredSearchEnforcementMode = 'tool-choice' | 'nudge' | 'none';

export type RequiredSearchEnforcement = {
  mode: RequiredSearchEnforcementMode;
  toolChoice?: { type: 'function'; function: { name: string } };
  attachedTool: AttachedSearchToolKind | null;
};

const NO_ENFORCEMENT: RequiredSearchEnforcement = { mode: 'none', attachedTool: null };

/**
 * How to make the first model step search: a tool choice where the provider
 * honours one, a system line where it does not.
 *
 * A caller-supplied `tool_choice` always wins. Forcing a tool the caller did
 * not ask for would silently override an API client's own contract.
 */
export function resolveRequiredSearchEnforcement(input: {
  required: boolean;
  requestedToolChoice: unknown;
  stream: boolean | undefined;
  model: string | undefined;
  tools: readonly unknown[] | undefined;
}): RequiredSearchEnforcement {
  if (!input.required) return NO_ENFORCEMENT;
  if (input.requestedToolChoice !== undefined) return NO_ENFORCEMENT;
  if (input.stream !== true) return NO_ENFORCEMENT;

  const attachedTool = classifyAttachedSearchTool(input.tools);
  if (attachedTool === null) return NO_ENFORCEMENT;

  if (
    TOOL_CHOICE_CAPABLE_SEARCH_TOOLS.has(attachedTool) &&
    modelAcceptsForcedToolChoice(input.model)
  ) {
    return {
      mode: 'tool-choice',
      toolChoice: forcedFunctionToolChoice(WEB_SEARCH_TOOL),
      attachedTool,
    };
  }

  return { mode: 'nudge', attachedTool };
}

/**
 * Is this the tool choice the required-search decision installed? Only that
 * one is released to `auto` after the search step; a choice the caller sent
 * stands for the whole turn.
 */
export function isRequiredSearchToolChoice(choice: unknown): boolean {
  return isForcedToolChoiceFor(choice, WEB_SEARCH_TOOL);
}
