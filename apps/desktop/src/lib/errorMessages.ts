
export { getFriendlyError, formatErrorForChat, getErrorMessage } from '@agiworkforce/utils';
export type { FriendlyError } from '@agiworkforce/utils';

/**
 * Convert any error value to a simple user-facing string.
 * Prefer this for components that just render a string error state.
 *
 * @param err - Error, string, or unknown value
 * @returns A plain, user-friendly error string
 *
 * @example
 * ```ts
 * } catch (err) {
 *   setError(getSimpleErrorMessage(err));
 * }
 * ```
 */
export function getSimpleErrorMessage(err: unknown): string {
  let raw: string;
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === 'string') {
    raw = err;
  } else if (typeof err === 'object' && err !== null && 'message' in err) {
    raw = String((err as { message: unknown }).message);
  } else {
    raw = String(err);
  }

  const lower = raw.toLowerCase();

  if (lower.includes('stream_watchdog_timeout') || lower.includes('watchdog')) {
    return 'The request took too long. Try a shorter message or switch models.';
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return 'Connection failed. Check your internet connection.';
  }
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('api key') ||
    lower.includes('invalid_api_key')
  ) {
    return 'Invalid API key. Update it in Settings \u2192 API Keys.';
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return 'Too many requests. Wait a moment and try again.';
  }
  if (lower.includes('500') || lower.includes('server error')) {
    return 'Server error. Try again in a moment.';
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'The request took too long. Try again in a moment.';
  }

  return 'Something went wrong. Please try again.';
}
