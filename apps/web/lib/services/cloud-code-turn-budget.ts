import { CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS } from '@agiworkforce/types';
import { CLOUD_CODE_TURN_BUDGET_MS, FUNCTION_TEARDOWN_RESERVE_MS } from '@/lib/deadline-policy';

/**
 * The wall-clock ceiling the platform enforces on the two routes that reach the
 * Code agent service: `export const maxDuration = 300` in
 * `app/api/code/sessions/[sessionId]/agent/route.ts` and in that route's
 * `approvals/route.ts`. Next.js needs `maxDuration` to be a literal, so it
 * cannot import this, the route literals and the shared limit clients wait on
 * are kept in step by hand.
 */
export const CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS = CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS;

/**
 * What an agent turn is actually allowed to spend, and why it is not
 * {@link CLOUD_CODE_TURN_BUDGET_MS}.
 *
 * `cloud-code-agent-loop.ts` defaults to that 600 s standalone budget, which is
 * twice the platform ceiling above. Under that default the loop's own `timeout`
 * guard is unreachable dead code: the function is killed at 300 s, and a
 * platform kill runs no `finally`, no `catch`, nothing. The turn row is left at
 * `state = 'running'` with a null `stop_reason`, the managed-usage reservation
 * is never finalised, and the E2B sandbox is never paused or disposed, it just
 * keeps costing money until something else reaps it.
 *
 * The ceiling is the one budget we do not control, so the loop budget moves
 * under it and keeps the same teardown reserve the chat tool loop keeps for its
 * own unwind (settle the reservation, write the terminal turn row, pause the
 * sandbox). The loop now reaches its `timeout` return with time to spare, which
 * is what makes every line of that unwind path run at all.
 */
export const CLOUD_CODE_AGENT_TURN_BUDGET_MS = Math.min(
  CLOUD_CODE_TURN_BUDGET_MS,
  CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS - FUNCTION_TEARDOWN_RESERVE_MS,
);
