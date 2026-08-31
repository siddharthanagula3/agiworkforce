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
