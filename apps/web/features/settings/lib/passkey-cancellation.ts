// A passkey prompt the person dismissed is not a failure to report, and the
// only way to recognise it is the name the platform gives that rejection.
// Reading raw error text belongs here rather than in a rendered component,
// where the same expression would be one edit away from reaching the screen.
const PASSKEY_CANCELLED = /NotAllowedError|cancel/i;

export function isPasskeyCancellation(cause: unknown): boolean {
  const text = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause);
  return PASSKEY_CANCELLED.test(text);
}
