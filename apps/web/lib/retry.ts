
class AbortError extends Error {
  constructor(message = 'Aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  jitterFactor?: number;
  signal?: AbortSignal;
  isRetryable?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
  totalDelayMs: number;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'signal' | 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  jitterFactor: 0.25,
  isRetryable: () => true,
};

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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const abortHandler = () => {
        clearTimeout(timer);
        reject(new AbortError());
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

/**
 * Retry an async operation with exponential backoff
 *
 * @example
 * ```ts
 * const result = await retryWithBackoff(
 *   () => fetch('/api/data'),
 *   {
 *     maxRetries: 5,
 *     initialDelayMs: 500,
 *     isRetryable: (err) => err instanceof NetworkError,
 *     onRetry: (err, attempt) => console.log(`Retry ${attempt}...`),
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;
  let totalDelayMs = 0;
  let lastError: unknown;

  while (attempt <= opts.maxRetries) {
    try {
      if (opts.signal?.aborted) {
        return {
          success: false,
          error: new AbortError(),
          attempts: attempt,
          totalDelayMs,
        };
      }

      const data = await fn();
      return {
        success: true,
        data,
        attempts: attempt + 1,
        totalDelayMs,
      };
    } catch (error) {
      lastError = error;
      attempt++;

      if (attempt > opts.maxRetries) {
        break;
      }

      if (!opts.isRetryable(error, attempt)) {
        break;
      }

      const delay = calculateDelay(attempt, {
        initialDelayMs: opts.initialDelayMs,
        maxDelayMs: opts.maxDelayMs,
        backoffMultiplier: opts.backoffMultiplier,
        jitter: opts.jitter,
        jitterFactor: opts.jitterFactor,
      });

      totalDelayMs += delay;

      opts.onRetry?.(error, attempt, delay);

      try {
        await sleep(delay, opts.signal);
      } catch {
        return {
          success: false,
          error: new AbortError(),
          attempts: attempt,
          totalDelayMs,
        };
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt,
    totalDelayMs,
  };
}
