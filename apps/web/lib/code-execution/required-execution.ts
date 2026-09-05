import { getPlanMaxSandboxes } from '@agiworkforce/types';

import { EXECUTE_CODE_TOOL } from '@/lib/e2b/execution-tools';
import {
  forcedFunctionToolChoice,
  isForcedToolChoiceFor,
  modelAcceptsForcedToolChoice,
  type ForcedFunctionToolChoice,
} from '@/lib/required-tool-call';

import { detectExplicitCodeExecutionIntent } from './explicit-execution-intent';

export type RequiredExecutionSource = 'toggle' | 'explicit_intent';

export type CodeExecutionRequirement = {
  required: boolean;
  source: RequiredExecutionSource | null;
};

const NOT_REQUIRED: CodeExecutionRequirement = { required: false, source: null };

/**
 * Is running code mandatory for this turn, and which signal made it so?
 *
 * Execution stops being a suggestion the moment the user asked for it. The
 * failure this closes is not a refusal, it is a turn that printed a code block
 * and a result it never obtained.
 */
export function resolveCodeExecutionRequirement(input: {
  codeExecutionEnabled: boolean | undefined;
  userMessage: string;
}): CodeExecutionRequirement {
  if (input.codeExecutionEnabled === false) return NOT_REQUIRED;
  if (input.codeExecutionEnabled === true) return { required: true, source: 'toggle' };
  if (detectExplicitCodeExecutionIntent(input.userMessage) !== null) {
    return { required: true, source: 'explicit_intent' };
  }
  return NOT_REQUIRED;
}

export type AttachedExecutionToolKind =
  | 'generic-function'
  | 'openai-hosted'
  | 'anthropic-server'
  | 'google-builtin';

const OPENAI_HOSTED_EXECUTION_TYPE = 'code_interpreter';
const ANTHROPIC_SERVER_EXECUTION_TYPE_PREFIX = 'code_execution_';
const GOOGLE_BUILTIN_EXECUTION_KEY = 'code_execution';

function classifyExecutionTool(tool: unknown): AttachedExecutionToolKind | null {
  if (!tool || typeof tool !== 'object') return null;
  const record = tool as Record<string, unknown>;

  const fn = record['function'];
  if (record['type'] === 'function' && fn && typeof fn === 'object') {
    return (fn as Record<string, unknown>)['name'] === EXECUTE_CODE_TOOL
      ? 'generic-function'
      : null;
  }

  const type = record['type'];
  if (typeof type === 'string') {
    if (type === OPENAI_HOSTED_EXECUTION_TYPE) return 'openai-hosted';
    if (type.startsWith(ANTHROPIC_SERVER_EXECUTION_TYPE_PREFIX)) return 'anthropic-server';
  }
  const googleTool = record[GOOGLE_BUILTIN_EXECUTION_KEY];
  if (googleTool && typeof googleTool === 'object') return 'google-builtin';
  return null;
}

/**
 * Which shape of execution tool this request actually carries. The four are not
 * interchangeable: only our own function tool can be named in a tool choice, so
 * the caller cannot treat "an execution tool is attached" as "execution can be
 * required".
 */
export function classifyAttachedExecutionTool(
  tools: readonly unknown[] | undefined,
): AttachedExecutionToolKind | null {
  for (const tool of tools ?? []) {
    const kind = classifyExecutionTool(tool);
    if (kind) return kind;
  }
  return null;
}

export function planAdmitsCodeExecution(planTier: string | null | undefined): boolean {
  return getPlanMaxSandboxes(planTier) > 0;
}

export const REQUIRED_EXECUTION_SYSTEM_NUDGE =
  'This turn requires code that actually runs. Call the execution tool before you answer, ' +
  'show the code you ran, and report only the output it returned. Do not write output you ' +
  'did not get back from a run, and if a run fails, say so plainly instead of presenting ' +
  'the result you expected.';

/**
 * Names the plan, never the tool. The user cannot act on a tool name, and the
 * sandbox-acquire failure this replaces read as an outage ("no sandbox was
 * available right now") on plans that never included one.
 */
export const EXECUTION_PLAN_GATED_SYSTEM_NOTICE =
  'Running code is not included in this plan, so nothing can be executed on this turn. ' +
  'Write the code if it helps, present it as code you have not run, and tell the user ' +
  'plainly that the answer carries no computed output. Never report output, results or ' +
  'timings as though the code had run.';

export type RequiredExecutionEnforcementMode = 'tool-choice' | 'nudge' | 'plan-gated' | 'none';

export type RequiredExecutionEnforcement = {
  mode: RequiredExecutionEnforcementMode;
  toolChoice?: ForcedFunctionToolChoice;
  attachedTool: AttachedExecutionToolKind | null;
};

const NO_ENFORCEMENT: RequiredExecutionEnforcement = { mode: 'none', attachedTool: null };

/**
 * Only our own function tool is named in a tool choice. The three provider-side
 * shapes are the model's own decision, steerable by the system prompt: OpenAI's
 * hosted interpreter is not a function and cannot be selected by function name,
 * and Anthropic and Google document no tool-choice equivalent for a server-side
 * tool at all.
 */
const TOOL_CHOICE_CAPABLE_EXECUTION_TOOLS: ReadonlySet<AttachedExecutionToolKind> =
  new Set<AttachedExecutionToolKind>(['generic-function']);

/**
 * How to make the first model step run code: a tool choice where the provider
 * honours one, a system line where it does not, and a plan line where the
 * account was never going to get a sandbox.
 *
 * A caller-supplied `tool_choice` always wins. Forcing a tool the caller did
 * not ask for would silently override an API client's own contract.
 */
export function resolveRequiredExecutionEnforcement(input: {
  required: boolean;
  requestedToolChoice: unknown;
  stream: boolean | undefined;
  model: string | undefined;
  tools: readonly unknown[] | undefined;
  planTier: string | null | undefined;
}): RequiredExecutionEnforcement {
  if (!input.required) return NO_ENFORCEMENT;
  if (!planAdmitsCodeExecution(input.planTier)) {
    return { mode: 'plan-gated', attachedTool: null };
  }
  if (input.requestedToolChoice !== undefined) return NO_ENFORCEMENT;
  if (input.stream !== true) return NO_ENFORCEMENT;

  const attachedTool = classifyAttachedExecutionTool(input.tools);
  if (attachedTool === null) return NO_ENFORCEMENT;

  if (
    TOOL_CHOICE_CAPABLE_EXECUTION_TOOLS.has(attachedTool) &&
    modelAcceptsForcedToolChoice(input.model)
  ) {
    return {
      mode: 'tool-choice',
      toolChoice: forcedFunctionToolChoice(EXECUTE_CODE_TOOL),
      attachedTool,
    };
  }

  return { mode: 'nudge', attachedTool };
}

/**
 * Is this the tool choice the required-execution decision installed? Only that
 * one is released to `auto` after the execution step; a choice the caller sent
 * stands for the whole turn.
 */
export function isRequiredExecutionToolChoice(choice: unknown): boolean {
  return isForcedToolChoiceFor(choice, EXECUTE_CODE_TOOL);
}
