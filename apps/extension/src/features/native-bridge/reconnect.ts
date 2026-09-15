export const NATIVE_RECONNECT_BASE_DELAY_MS = 1_000;
export const NATIVE_RECONNECT_MAX_DELAY_MS = 30_000;
export const NATIVE_RECONNECT_MAX_ATTEMPTS = 8;

/**
 * Chrome reports a host that is missing, forbidden, or blocked by policy only
 * through the disconnect message. Retrying those cannot succeed until the user
 * installs or re-authorizes AGI Desktop, so they end the reconnect sequence
 * instead of consuming the backoff budget.
 */
export function isPermanentNativeDisconnect(error: string): boolean {
  return (
    error.includes('Native host not found') ||
    error.includes('Specified native messaging host not found') ||
    error.includes('Access to the specified native messaging host is forbidden') ||
    error.includes('not allowed')
  );
}

/**
 * Delay before the given 1-based reconnect attempt, or null once the attempts
 * are exhausted and only an explicit user action should reconnect.
 */
export function nativeReconnectDelayMs(attempt: number): number | null {
  if (attempt >= NATIVE_RECONNECT_MAX_ATTEMPTS) return null;
  return Math.min(
    NATIVE_RECONNECT_BASE_DELAY_MS * 2 ** Math.max(attempt - 1, 0),
    NATIVE_RECONNECT_MAX_DELAY_MS,
  );
}
