/**
 * Turns a caught value into something a person can act on.
 *
 * `err instanceof Error ? err.message : String(err)` reaches the screen with
 * the browser's own wording when the network drops: "Failed to fetch" in
 * Chrome, "Load failed" in Safari, "NetworkError when attempting to fetch
 * resource" in Firefox. None of those name a condition or suggest an action,
 * so a user whose wifi died is told a stack-trace fragment.
 */
const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed/i;

export function networkErrorMessage(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!(error instanceof TypeError || NETWORK_FAILURE.test(raw))) return null;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return offline
    ? 'You appear to be offline. Check your connection.'
    : 'Could not reach the server.';
}

export function toUserMessage(error: unknown, fallback: string): string {
  const network = networkErrorMessage(error);
  if (network) return network;
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}

/**
 * The human answer for an HTTP failure, or null when the status carries no
 * better wording than the server's own message.
 *
 * A status code is a machine's vocabulary. "HTTP 429: Too many requests" tells
 * a reader nothing they can act on; "you are going faster than the service
 * allows, wait a moment" does. Codes also leak shape - a 403 on a list request
 * is a permissions answer, not a fault the reader caused.
 */
export function httpStatusMessage(status: number | undefined): string | null {
  if (typeof status !== 'number') return null;
  if (status === 401) return 'Your session has expired. Sign in again to continue.';
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'That is no longer available.';
  if (status === 408) return 'The server took too long to answer. Try again.';
  if (status === 429) return 'You are going a little fast. Wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Try again shortly.';
  return null;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  if (typeof candidate === 'number') return candidate;
  // Several transports format the message as "HTTP 500" or "HTTP 500: reason"
  // and carry no status field. Recovering it here means the ladder applies
  // without every one of them having to be found and changed first.
  const message = error instanceof Error ? error.message : '';
  const parsed = /^\s*HTTP\s+(\d{3})\b/.exec(message);
  return parsed ? Number(parsed[1]) : undefined;
}

/**
 * `toUserMessage`, plus the HTTP status ladder. Prefer this wherever a caught
 * value may be an HTTP failure rather than only a transport failure.
 */
export function toUserMessageWithStatus(error: unknown, fallback: string): string {
  const network = networkErrorMessage(error);
  if (network) return network;
  const byStatus = httpStatusMessage(statusOf(error));
  if (byStatus) return byStatus;
  return toUserMessage(error, fallback);
}
