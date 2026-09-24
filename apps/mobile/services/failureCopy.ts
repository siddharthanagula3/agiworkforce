/**
 * A wait this surface repeats to a reader is one a server measured. An
 * invented "wait a few hours" is worse than no sentence, because a reader who
 * sits it out and fails again stops believing the next one, so anything that
 * is not a finite number of seconds inside a believable window is dropped
 * rather than rounded into a figure.
 */
const MAX_STATED_RETRY_AFTER_SECONDS = 86_400;

export function statableRetryAfterSeconds(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const seconds = Math.round(raw);
  if (seconds < 1 || seconds > MAX_STATED_RETRY_AFTER_SECONDS) return undefined;
  return seconds;
}

function counted(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export function statedWait(retryAfterSeconds: unknown): string | undefined {
  const seconds = statableRetryAfterSeconds(retryAfterSeconds);
  if (seconds === undefined) return undefined;
  if (seconds < 90) return `about ${counted(seconds, 'second')}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${counted(minutes, 'minute')}`;
  return `about ${counted(Math.round(seconds / 3600), 'hour')}`;
}

/**
 * The id the server already put in its own log line for this failure, so a
 * reader reporting a problem hands over the one string that finds the turn.
 * Only ever appended to a failure: a turn that worked has nothing to report.
 */
export function withFailureReference(message: string, requestId: string | undefined): string {
  return requestId ? `${message} Reference: ${requestId}` : message;
}

/**
 * The gateway tells every surface how a paid upgrade is obtained, and the two
 * routes it names, an access code and the upgrade waitlist, are both errands
 * off this device. App Review reads that as steering to an outside purchase,
 * so the phone keeps the part that is true and actionable here, that upgrades
 * are staged, and stops. The billing screen already says the same thing about
 * plan changes, so a reader is not told two different stories.
 */
const STAGED_UPGRADE_SENTENCE = /Paid upgrades are opening in stages[^.]*\./g;
const STAGED_UPGRADE_FACT = 'Paid upgrades are opening in stages.';

export function withoutExternalPurchaseSteering(message: string): string {
  return message.replace(STAGED_UPGRADE_SENTENCE, STAGED_UPGRADE_FACT);
}
