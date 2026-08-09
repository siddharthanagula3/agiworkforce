/**
 * Deadline policy for the long-running managed surfaces.
 *
 * HARD-008. Independent 120-second deadlines had been copied across the chat
 * tool loop, the Cloud Code agent, and the desktop chat loop. Naming them in
 * one place is only half the finding; the half that actually bites is that a
 * child deadline was never RELATED to the parent that contains it. Both loops
 * check their wall-clock budget only at the top of a step, then start a tool
 * call with its own fixed 120 s cap — so a call admitted with two seconds of
 * budget left runs for another 120 s and the turn overruns its parent by up to
 * the child's full timeout. On the chat route that overrun crosses
 * `export const maxDuration = 300`, and a platform SIGKILL skips the generator
 * `finally` that disposes the E2B sandbox (which keeps billing) and settles
 * managed usage — exactly the teardown the budget existed to protect.
 *
 * So this module holds two things and both are load-bearing:
 *
 *  1. The named values, each derived from its parent rather than picked
 *     independently (`*_BUDGET_MS = parent - FUNCTION_TEARDOWN_RESERVE_MS`).
 *  2. `nestedDeadlineMs`, the enforcement. Call it at the moment a child
 *     deadline starts, with the parent's budget and elapsed time, and the child
 *     cannot outlive the parent by more than `MIN_CHILD_DEADLINE_MS` — the
 *     floor below is a deliberate exception to the containment rule, not a
 *     rounding error, and is documented on the constant itself.
 *
 * `DEADLINE_HIERARCHY` states the parent/child edges as data so the invariant
 * is testable rather than a comment. It carries only the edges where the child
 * has its own smaller preferred cap; the provider stream (see
 * `PROVIDER_STREAM_DEADLINE_MS`) is a child whose preferred cap IS its parent's
 * budget, so it has no row to assert — the clamp is its whole enforcement.
 *
 * NOT MIGRATED, and named here so it is a tracked gap rather than a silence:
 * `lib/workflows/cloud-agent-workflow.ts:168` is a third production caller of
 * `runToolLoop` and passes `maxDurationMs: 210_000` — an independently picked
 * literal, exactly the shape this module exists to remove. Its children ARE
 * clamped (the loop feeds whatever `maxDurationMs` resolves to into
 * `nestedDeadlineMs`), so this is a naming/derivation gap, not a containment
 * hole. Closing it needs the durable-workflow step ceiling that number is
 * standing in for, which this repo does not state anywhere; inventing a parent
 * to derive it from would be the same defect one level up.
 */

/**
 * `export const maxDuration` on `app/api/llm/v1/chat/completions/route.ts`.
 * Mirrored here because a plain module cannot read a route segment config, and
 * pinned by `deadline-policy.test.ts` against the route source so the two
 * cannot drift apart silently.
 */
export const CHAT_COMPLETIONS_FUNCTION_LIMIT_MS = 300_000;

/**
 * Wall-clock left unspent at the end of a function invocation for teardown:
 * harvesting generated files, pausing/disposing the sandbox, settling managed
 * usage, and flushing the terminal SSE frames. Everything below is the parent
 * limit minus this.
 */
export const FUNCTION_TEARDOWN_RESERVE_MS = 60_000;

/** Budget for one chat tool-loop invocation, derived from the route's limit. */
export const CHAT_TOOL_LOOP_BUDGET_MS =
  CHAT_COMPLETIONS_FUNCTION_LIMIT_MS - FUNCTION_TEARDOWN_RESERVE_MS;

/**
 * Preferred cap on one chat tool call. A hung tool (wedged MCP/connector call,
 * stuck sandbox exec) must not block the turn — but this is a PREFERENCE, not
 * the effective deadline: callers pass it through `nestedDeadlineMs` so the
 * remaining loop budget wins whenever it is smaller.
 */
export const TOOL_CALL_DEADLINE_MS = 120_000;

/**
 * Cap on ONE provider stream inside the chat tool loop (connect, drain, close).
 *
 * The step's other child — a tool call — had a 120 s cap that the clamp shrinks.
 * The provider call sitting right beside it had NO wall-clock bound at all: the
 * only signal threaded into the adapter is the optional client `AbortSignal`,
 * and internal callers (durable workflow continuations) pass none, so a wedged
 * upstream admitted at t=239 s ran until the platform killed the function —
 * the same skipped-teardown outcome the tool clamp exists to prevent.
 *
 * Deliberately NOT a second independent number: a reasoning model can
 * legitimately stream for minutes, and inventing another literal here is the
 * exact defect this module was written to remove. The preferred cap IS the
 * parent's whole budget, so `nestedDeadlineMs` reduces to "whatever the loop
 * has left". The guarantee is "never longer than the parent", not "never
 * longer than two minutes".
 */
export const PROVIDER_STREAM_DEADLINE_MS = CHAT_TOOL_LOOP_BUDGET_MS;

/**
 * Budget for one Cloud Code agent turn (`POST /api/code/sessions/:id/agent`).
 *
 * Deliberately NOT derived from a platform limit: that route declares no
 * `maxDuration`, so the ceiling it actually runs under is a deployment
 * property this repo does not state. Recorded as the parent of the command
 * deadline below, which is the relationship this module can prove.
 */
export const CLOUD_CODE_TURN_BUDGET_MS = 10 * 60_000;

/**
 * Cap on one sandbox command — in a Cloud Code turn, and on the two one-shot
 * command paths in `lib/services/cloud-code-session-service.ts` (repository
 * clone at provisioning, terminal exec).
 *
 * This is the E2B executor's own ceiling, not a preference: every command goes
 * through `apps/web/lib/e2b/runtime.ts`'s `runCommand`, which does
 * `Math.min(E2B_COMMAND_TIMEOUT_MS, Math.max(1_000, timeoutMs ?? …))` with
 * `E2B_COMMAND_TIMEOUT_MS = 60_000` (runtime.ts:70) — the only implementation
 * of the `runCommand` capability in the repo. This constant read 120_000 when
 * it was first extracted, which could never take effect: the number named here
 * has to be the one that actually binds, or the hierarchy asserts a deadline
 * the runtime does not honour.
 *
 * DRIFT RISK, not closed: `E2B_COMMAND_TIMEOUT_MS` is module-private, so this
 * mirror is held by comment rather than by import or by a source-pinned test
 * (the way `CHAT_COMPLETIONS_FUNCTION_LIMIT_MS` is pinned to the route). Export
 * it from `e2b/runtime.ts` and import it here to close that.
 */
export const CLOUD_CODE_COMMAND_DEADLINE_MS = 60_000;

/**
 * Floor for a clamped child deadline. A child admitted with almost no parent
 * budget left still gets a non-zero window so it fails as a timeout with a
 * readable message instead of a zero-length timer that fires before the call
 * is even dispatched.
 */
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

/**
 * The parent/child edges this module asserts. Each child must fit inside its
 * parent's budget on its own; `nestedDeadlineMs` is what keeps it fitting once
 * part of the parent's budget is already spent.
 *
 * TEST-ONLY BY DESIGN: nothing in production reads this table — it exists so
 * the static half of the invariant is asserted rather than described, and the
 * enforcement lives entirely in `nestedDeadlineMs`. Each `childMs` must be the
 * value that actually binds at runtime; a row naming a cap the runtime silently
 * lowers (as the cloud-code row did while it read 120_000) asserts nothing.
 */
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
