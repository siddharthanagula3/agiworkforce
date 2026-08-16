
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
  const baseDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);

  const cappedDelay = Math.min(baseDelay, options.maxDelayMs);

  if (options.jitter) {
    const jitterRange = cappedDelay * options.jitterFactor;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  return Math.round(cappedDelay);
}
