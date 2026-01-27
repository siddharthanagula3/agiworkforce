/**
 * Retry utility with exponential backoff
 *
 * Provides configurable retry logic for async operations with:
 * - Exponential backoff (delay doubles each retry)
 * - Jitter to prevent thundering herd
 * - Configurable max retries and delays
 * - Abort signal support
 * - Custom retry condition
 */

/**
 * Custom AbortError class for environments where DOMException isn't available
 */
class AbortError extends Error {
  constructor(message = 'Aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to delays (default: true) */
  jitter?: boolean;
  /** Maximum jitter as percentage of delay (default: 0.25 = 25%) */
  jitterFactor?: number;
  /** Optional abort signal to cancel retries */
  signal?: AbortSignal;
  /** Custom function to determine if error is retryable (default: all errors) */
  isRetryable?: (error: unknown, attempt: number) => boolean;
  /** Callback for each retry attempt */
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

/**
 * Sleep for a specified duration with abort signal support
 */
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
      // Check abort signal
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

      // Check if we should retry
      if (attempt > opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!opts.isRetryable(error, attempt)) {
        break;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, {
        initialDelayMs: opts.initialDelayMs,
        maxDelayMs: opts.maxDelayMs,
        backoffMultiplier: opts.backoffMultiplier,
        jitter: opts.jitter,
        jitterFactor: opts.jitterFactor,
      });

      totalDelayMs += delay;

      // Call onRetry callback
      opts.onRetry?.(error, attempt, delay);

      // Wait before retry
      try {
        await sleep(delay, opts.signal);
      } catch {
        // Aborted
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

/**
 * Create a retryable version of an async function
 *
 * @example
 * ```ts
 * const fetchWithRetry = withRetry(fetchData, { maxRetries: 3 });
 * const result = await fetchWithRetry(userId);
 * ```
 */
export function withRetry<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {},
): (...args: TArgs) => Promise<RetryResult<TResult>> {
  return (...args: TArgs) => retryWithBackoff(() => fn(...args), options);
}

/** Error with an HTTP status code */
interface HttpError extends Error {
  status?: number;
}

/** Type guard to check if an error has an HTTP status property */
function hasHttpStatus(error: unknown): error is HttpError {
  return (
    error instanceof Error && 'status' in error && typeof (error as HttpError).status === 'number'
  );
}

/**
 * Common retry conditions for network errors
 */
export const retryConditions = {
  /** Retry on network errors (fetch failures, timeouts) */
  networkError: (error: unknown): boolean => {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true;
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        msg.includes('econnreset')
      );
    }
    return false;
  },

  /** Retry on HTTP 5xx errors */
  serverError: (error: unknown): boolean => {
    if (error instanceof Response) {
      return error.status >= 500 && error.status < 600;
    }
    if (hasHttpStatus(error)) {
      const status = error.status;
      return status !== undefined && status >= 500 && status < 600;
    }
    return false;
  },

  /** Retry on HTTP 429 (rate limit) */
  rateLimited: (error: unknown): boolean => {
    if (error instanceof Response) {
      return error.status === 429;
    }
    if (hasHttpStatus(error)) {
      return error.status === 429;
    }
    return false;
  },

  /** Combine multiple conditions */
  any:
    (...conditions: ((error: unknown) => boolean)[]) =>
    (error: unknown): boolean => {
      return conditions.some((cond) => cond(error));
    },
};
