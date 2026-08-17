import {
  RetryStoppedError,
  classifyRetryError,
  computeRetryDelayMs,
  runWithRetryPolicy,
  type RetryBudget,
  type RetryPolicy,
  type RetryTelemetryEvent,
} from '@agiworkforce/utils/retry-policy';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  jitterFactor?: number;
  signal?: AbortSignal;
  idempotent?: boolean;
  budget?: RetryBudget;
  isRetryable?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  onEvent?: (event: RetryTelemetryEvent) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
  totalDelayMs: number;
}

export function calculateDelay(
  attempt: number,
  options: {
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitter: boolean;
  },
): number {
  return computeRetryDelayMs(attempt, {
    baseDelayMs: options.initialDelayMs,
    maxDelayMs: options.maxDelayMs,
    multiplier: options.backoffMultiplier,
    jitter: options.jitter ? 'equal' : 'none',
  });
}

/**
 * Retry an async operation under the shared retry policy.
 *
 * Never throws: the caller reads `success` and decides. `isRetryable` still
 * decides first, so a caller that already classifies its own errors keeps that
 * classification; everything else comes from the shared policy.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const maxRetries = options.maxRetries ?? 3;
  let totalDelayMs = 0;
  let attempts = 0;

  const policy: RetryPolicy = {
    operation: 'web.retryWithBackoff',
    maxAttempts: maxRetries + 1,
    baseDelayMs: options.initialDelayMs ?? 1000,
    maxDelayMs: options.maxDelayMs ?? 30000,
    multiplier: options.backoffMultiplier ?? 2,
    jitter: options.jitter === false ? 'none' : 'equal',
    idempotent: options.idempotent ?? true,
    classify: (error, attempt) => {
      if (options.isRetryable && !options.isRetryable(error, attempt)) {
        return { disposition: 'terminal', reason: 'caller_not_retryable' };
      }
      const shared = classifyRetryError(error);
      if (shared.disposition === 'terminal' && shared.reason === 'unclassified') {
        return { disposition: 'retry', reason: 'unclassified' };
      }
      return shared;
    },
    onEvent: (event) => {
      if (event.type === 'attempt') attempts = event.attempt;
      if (event.type === 'scheduled') {
        totalDelayMs += event.delayMs;
        options.onRetry?.(event.error, event.attempt, event.delayMs);
      }
      options.onEvent?.(event);
    },
  };
  if (options.signal) policy.signal = options.signal;
  if (options.budget) policy.budget = options.budget;

  try {
    const data = await runWithRetryPolicy(fn, policy);
    return { success: true, data, attempts, totalDelayMs };
  } catch (error) {
    if (error instanceof RetryStoppedError) {
      return { success: false, error: error.lastError, attempts, totalDelayMs };
    }
    return { success: false, error, attempts, totalDelayMs };
  }
}
