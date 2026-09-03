export const CHAT_COMPLETIONS_FUNCTION_LIMIT_MS = 300_000;

export const FUNCTION_TEARDOWN_RESERVE_MS = 60_000;

export const CHAT_TOOL_LOOP_BUDGET_MS =
  CHAT_COMPLETIONS_FUNCTION_LIMIT_MS - FUNCTION_TEARDOWN_RESERVE_MS;

export const TOOL_CALL_DEADLINE_MS = 120_000;

export const PROVIDER_STREAM_DEADLINE_MS = CHAT_TOOL_LOOP_BUDGET_MS;

export const CLOUD_CODE_TURN_BUDGET_MS = 10 * 60_000;

export const CLOUD_CODE_COMMAND_DEADLINE_MS = 60_000;

export const CLOUD_CODE_HARNESS_COMMAND_FUNCTION_LIMIT_MS = 10 * 60_000;

export const CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS =
  CLOUD_CODE_HARNESS_COMMAND_FUNCTION_LIMIT_MS - FUNCTION_TEARDOWN_RESERVE_MS;

export function resolveCloudCodeCommandDeadlineMs(
  command: string,
  harnessCommandIds: ReadonlySet<string>,
): number {
  const firstToken = command.trim().split(/\s+/, 1)[0];
  return firstToken && harnessCommandIds.has(firstToken)
    ? CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS
    : CLOUD_CODE_COMMAND_DEADLINE_MS;
}

export const IMAGE_GENERATION_FUNCTION_LIMIT_MS = 60_000;

export const IMAGE_GENERATION_PROVIDER_DEADLINE_MS = 55_000;

export const MIN_CHILD_DEADLINE_MS = 1_000;

export function nestedDeadlineMs(
  preferredMs: number,
  parentBudgetMs: number | undefined,
  parentElapsedMs: number,
): number {
  if (parentBudgetMs === undefined) return preferredMs;
  const remaining = parentBudgetMs - Math.max(0, parentElapsedMs);
  return Math.max(MIN_CHILD_DEADLINE_MS, Math.min(preferredMs, remaining));
}

export const DEADLINE_HIERARCHY = [
  {
    parent: 'chat completions function limit',
    parentMs: CHAT_COMPLETIONS_FUNCTION_LIMIT_MS,
    child: 'chat tool loop budget',
    childMs: CHAT_TOOL_LOOP_BUDGET_MS,
  },
  {
    parent: 'chat tool loop budget',
    parentMs: CHAT_TOOL_LOOP_BUDGET_MS,
    child: 'chat tool call',
    childMs: TOOL_CALL_DEADLINE_MS,
  },
  {
    parent: 'cloud code turn budget',
    parentMs: CLOUD_CODE_TURN_BUDGET_MS,
    child: 'cloud code sandbox command',
    childMs: CLOUD_CODE_COMMAND_DEADLINE_MS,
  },
  {
    parent: 'cloud code harness command function limit',
    parentMs: CLOUD_CODE_HARNESS_COMMAND_FUNCTION_LIMIT_MS,
    child: 'cloud code harness command deadline',
    childMs: CLOUD_CODE_HARNESS_COMMAND_DEADLINE_MS,
  },
  {
    parent: 'image generation function limit',
    parentMs: IMAGE_GENERATION_FUNCTION_LIMIT_MS,
    child: 'image generation provider call',
    childMs: IMAGE_GENERATION_PROVIDER_DEADLINE_MS,
  },
] as const;
