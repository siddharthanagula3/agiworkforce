/**
 * Why code execution was not available for a turn, in the terms a user can act
 * on. "Code execution was not available" told a user nothing and told the model
 * nothing either, so it retried the same call on every step of the turn.
 *
 * Pure logic (no `server-only`).
 */

export type E2BUnavailableCause = 'not-configured' | 'no-capacity' | 'policy';

const CAUSE_SENTENCE: Record<E2BUnavailableCause, string> = {
  'not-configured': 'code execution is not configured on this deployment',
  'no-capacity': 'no sandbox was available for this account right now',
  policy: 'the network policy for this request does not allow a sandbox',
};

export const GENERIC_CODE_EXECUTION_UNAVAILABLE = 'Code execution is unavailable for this request.';

export function codeExecutionUnavailableMessage(cause: E2BUnavailableCause | null): string {
  if (!cause) return GENERIC_CODE_EXECUTION_UNAVAILABLE;
  return (
    `Code execution is unavailable for this request: ${CAUSE_SENTENCE[cause]}. ` +
    'Do not call an execution tool again on this turn; answer without running code ' +
    'and tell the user why.'
  );
}
