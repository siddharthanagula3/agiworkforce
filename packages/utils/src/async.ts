/**
 * Async Utilities
 *
 * Shared utilities for async operations including sleep, debounce,
 * throttle, and retry logic.
 *
 * @module async
 * @packageDocumentation
 */

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 *
 * @example
 * ```typescript
 * await sleep(1000); // Wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Custom AbortError for environments where DOMException may not be available.
 */
export class AbortError extends Error {
  constructor(message = 'Aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

/**
 * Sleep with abort signal support.
 *
 * @param ms - Duration in milliseconds
 * @param signal - Optional abort signal to cancel the sleep
 * @returns Promise that resolves after the duration or rejects if aborted
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 500);
 * await sleepWithAbort(1000, controller.signal); // Aborts after 500ms
 * ```
 */
export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }

    // Declare abortHandler before the timer so the timer callback can reference it.
    let abortHandler: (() => void) | undefined;

    const timer = setTimeout(() => {
      // Remove the abort listener when the timer fires naturally to prevent
      // listener accumulation when an AbortController is reused across multiple calls.
      if (abortHandler) signal!.removeEventListener('abort', abortHandler);
      resolve();
    }, ms);

    if (signal) {
      abortHandler = () => {
        clearTimeout(timer);
        reject(new AbortError());
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

/**
 * Create a debounced version of a function.
 *
 * The debounced function will only execute after the specified delay
 * has passed without any new calls.
 *
 * @param func - Function to debounce
 * @param wait - Delay in milliseconds
 * @returns Debounced function
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string) => {
 *   console.log('Searching for:', query);
 * }, 300);
 *
 * debouncedSearch('a');
 * debouncedSearch('ab');
 * debouncedSearch('abc'); // Only this one executes after 300ms
 * ```
 */
export function debounce<TArgs extends unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  wait: number,
): (...args: TArgs) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: TArgs) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create a throttled version of a function.
 *
 * The throttled function will execute at most once per specified interval.
 *
 * @param func - Function to throttle
 * @param limit - Minimum interval between calls in milliseconds
 * @returns Throttled function
 *
 * @example
 * ```typescript
 * const throttledScroll = throttle(() => {
 *   console.log('Scroll position:', window.scrollY);
 * }, 100);
 *
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<TArgs extends unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  limit: number,
): (...args: TArgs) => void {
  let inThrottle = false;

  return function executedFunction(...args: TArgs) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Options for retry operations.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /**
   * Error message substrings that should abort retries immediately.
   * Each entry is matched against `error.message` via `String.includes()`.
   */
  abortOnErrorMessages?: string[];
  /** Callback invoked on each retry attempt */
  onRetry?: (attempt: number, error: Error) => void;
  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Error thrown when all retry attempts have been exhausted.
 */
export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(message);
    this.name = 'RetryError';
    Object.setPrototypeOf(this, RetryError.prototype);
  }
}

/**
 * Calculate delay for a retry attempt with exponential backoff.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param initialDelay - Initial delay in milliseconds
 * @param backoffMultiplier - Multiplier for each retry
 * @param maxDelay - Maximum delay cap
 * @returns Delay in milliseconds
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  backoffMultiplier: number,
  maxDelay: number,
): number {
  const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Retry an async operation with exponential backoff.
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws RetryError if all attempts fail
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => fetch('/api/data').then(r => r.json()),
 *   {
 *     maxAttempts: 5,
 *     initialDelay: 500,
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`),
 *   }
 * );
 * ```
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    abortOnErrorMessages = [],
    onRetry,
    shouldRetry,
  } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error should abort retries
      if (abortOnErrorMessages.some((msg) => lastError.message.includes(msg))) {
        throw lastError;
      }

      // Check custom retry condition
      if (shouldRetry && !shouldRetry(lastError, attempt + 1)) {
        throw lastError;
      }

      // Check if this was the last attempt
      if (attempt === maxAttempts - 1) {
        break;
      }

      const delay = calculateDelay(attempt, initialDelay, backoffMultiplier, maxDelay);

      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      await sleep(delay);
    }
  }

  throw new RetryError(
    `Operation failed after ${maxAttempts} attempts: ${lastError.message}`,
    maxAttempts,
    lastError,
  );
}

/**
 * Predefined retry strategies for common scenarios.
 */
export const retryStrategies = {
  /** Network request retry strategy */
  network: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    abortOnErrorMessages: ['404', 'Not Found', 'Unauthorized', 'Forbidden'],
  } satisfies RetryOptions,

  /** Database operation retry strategy */
  database: {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    abortOnErrorMessages: ['SQLITE_CORRUPT', 'corrupted'],
  } satisfies RetryOptions,

  /** API call retry strategy */
  api: {
    maxAttempts: 4,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    shouldRetry: (error: Error, attempt: number) => {
      if (error.message.includes('429') || error.message.includes('Rate limit')) {
        return true;
      }
      if (/\b5\d{2}\b/.test(error.message)) {
        return attempt < 3;
      }
      return false;
    },
  } satisfies RetryOptions,

  /** Filesystem operation retry strategy */
  filesystem: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 3000,
    backoffMultiplier: 2,
    abortOnErrorMessages: ['ENOENT', 'EACCES', 'Permission denied'],
  } satisfies RetryOptions,
};

/**
 * Retry with a predefined strategy.
 *
 * @param operation - Async function to retry
 * @param strategy - Predefined strategy name
 * @returns Result of the operation
 *
 * @example
 * ```typescript
 * const data = await retryWithStrategy(
 *   () => fetch('/api/data').then(r => r.json()),
 *   'network'
 * );
 * ```
 */
export async function retryWithStrategy<T>(
  operation: () => Promise<T>,
  strategy: keyof typeof retryStrategies,
): Promise<T> {
  return retry(operation, retryStrategies[strategy]);
}

/**
 * Make a function retriable by wrapping it with retry logic.
 *
 * @param fn - Function to make retriable
 * @param options - Retry configuration
 * @returns Wrapped function that retries on failure
 *
 * @example
 * ```typescript
 * const fetchUserWithRetry = makeRetriable(
 *   (id: string) => fetch(`/api/users/${id}`).then(r => r.json()),
 *   { maxAttempts: 3 }
 * );
 *
 * const user = await fetchUserWithRetry('123');
 * ```
 */
export function makeRetriable<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: RetryOptions = {},
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => {
    return retry(() => fn(...args), options);
  };
}

/**
 * Execute an async operation with a timeout.
 *
 * @param operation - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result of the operation
 * @throws Error if operation times out
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => fetch('/api/slow-endpoint').then(r => r.json()),
 *   5000
 * );
 * ```
 */
export async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([operation(), timeoutPromise]).finally(() => clearTimeout(timer!));
}

/**
 * Execute multiple operations in parallel with retry support.
 *
 * @param operations - Array of async functions to execute
 * @param options - Retry configuration
 * @returns Array of results or errors
 *
 * @example
 * ```typescript
 * const results = await retryBatch([
 *   () => fetch('/api/users/1'),
 *   () => fetch('/api/users/2'),
 *   () => fetch('/api/users/3'),
 * ], { maxAttempts: 3 });
 * ```
 */
export async function retryBatch<T>(
  operations: Array<() => Promise<T>>,
  options: RetryOptions = {},
): Promise<Array<T | Error>> {
  const results = await Promise.allSettled(
    operations.map((operation) => retry(operation, options)),
  );

  return results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return result.reason instanceof Error ? result.reason : new Error(String(result.reason));
  });
}
