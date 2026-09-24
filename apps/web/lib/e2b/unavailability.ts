/**
 * Why code execution was not available for a turn, in the terms a user can act
 * on. "Code execution was not available" told a user nothing and told the model
 * nothing either, so it retried the same call on every step of the turn.
 *
 * Pure logic (no `server-only`).
 */

export const E2B_UNAVAILABLE_CAUSES = [
  'not-configured',
  'no-capacity',
  'policy',
  'over-quota',
  'free-allowance-exhausted',
  'provider-error',
] as const;

export type E2BUnavailableCause = (typeof E2B_UNAVAILABLE_CAUSES)[number];

const CAUSE_SENTENCE: Record<E2BUnavailableCause, string> = {
  'not-configured': 'code execution is not configured on this deployment',
  'no-capacity':
    'this account already has as many sandboxes running as its plan allows; one frees up when an earlier session ends',
  policy: 'the network policy for this request does not allow a sandbox',
  // Upgrades need an access code or a waitlist place, so no sentence sends the
  // reader to buy one; Usage is where the reset is shown.
  'over-quota':
    'this account has no usage budget left to pay for sandbox time; Usage in Settings shows when it resets',
  'free-allowance-exhausted': 'the Free sandbox allowance is used for today; it resets tomorrow',
  // An outage read as the account's own limit the last time these were one
  // cause, so the sentence says whose problem it is before anything else.
  'provider-error':
    'the sandbox service could not start a sandbox; this is not a limit on this account',
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
