
export const CHAT_COMPLETIONS_FUNCTION_LIMIT_MS = 300_000;

export const FUNCTION_TEARDOWN_RESERVE_MS = 60_000;

export const CHAT_TOOL_LOOP_BUDGET_MS =
  CHAT_COMPLETIONS_FUNCTION_LIMIT_MS - FUNCTION_TEARDOWN_RESERVE_MS;

export const TOOL_CALL_DEADLINE_MS = 120_000;

export const PROVIDER_STREAM_DEADLINE_MS = CHAT_TOOL_LOOP_BUDGET_MS;

export const CLOUD_CODE_TURN_BUDGET_MS = 10 * 60_000;

export const CLOUD_CODE_COMMAND_DEADLINE_MS = 60_000;

export const MIN_CHILD_DEADLINE_MS = 1_000;

/**
 * Clamp a child deadline to what is left of its parent's budget.
 *
 * @param preferredMs   The child's own cap when the parent has room to spare.
 * @param parentBudgetMs Total wall-clock the parent layer may use, or
 *                       `undefined` when the parent is unbounded (then the
 *                       child's own cap is the only bound).
 * @param parentElapsedMs How much of the parent's budget is already spent.
 * @returns The effective deadline: the parent's remaining budget when that is
 *          the smaller number, EXCEPT that the result is never below
 *          `MIN_CHILD_DEADLINE_MS`. A child admitted with the parent already
 *          spent therefore overruns it by up to 1 s — the floor wins on
 *          purpose (see `MIN_CHILD_DEADLINE_MS`), and 1 s is inside the
 *          teardown reserve rather than inside the parent's budget.
 */
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
] as const;
