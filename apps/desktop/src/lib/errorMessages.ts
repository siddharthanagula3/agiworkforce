/**
 * errorMessages.ts — friendly error message utility
 *
 * Provides a simple `getFriendlyError(err)` function that converts any
 * raw error (Error object, string, unknown) into a plain user-facing string.
 *
 * Components that only need the string (not the full FriendlyError object)
 * should import from here. Components that need the full {title, message,
 * suggestion, icon} shape should import getFriendlyError from
 * @agiworkforce/utils directly.
 *
 * Pattern mapping:
 *   "stream_watchdog_timeout" | "timed out"   → request too long, try shorter message
 *   "ECONNREFUSED" | "network" | "fetch"       → connection failed, check internet
 *   "401" | "unauthorized" | "api key"         → invalid API key, update in Settings
 *   "429" | "rate limit"                       → too many requests, wait and retry
 *   "500" | "server error"                     → server error, try again
 *   default                                    → something went wrong, please try again
 */

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
  // Normalise to a string we can pattern-match against
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
