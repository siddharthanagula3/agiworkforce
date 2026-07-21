/**
 * Exponential-backoff delay calculation with jitter.
 *
 * Sole consumer is websocketClient's reconnect loop. The full retry-loop
 * helpers that used to live here had no desktop callers; use
 * `@agiworkforce/utils` retry helpers for new retry loops.
 */

/**
 * Calculate delay for a retry attempt with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  options: {
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitter: boolean;
    jitterFactor: number;
  },
): number {
  // Calculate base delay with exponential backoff
  const baseDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);

  // Cap at max delay
  const cappedDelay = Math.min(baseDelay, options.maxDelayMs);

  // Add jitter if enabled
  if (options.jitter) {
    const jitterRange = cappedDelay * options.jitterFactor;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  return Math.round(cappedDelay);
}
