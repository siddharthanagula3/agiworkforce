/**
 * Async Utilities
 *
 * Shared utilities for async operations including sleep, debounce,
 * throttle, and retry logic.
 *
 * @module async
 * @packageDocumentation
 */

import {
  RetryStoppedError,
  classifyRetryError,
  runWithRetryPolicy,
  type RetryBudget,
  type RetryPolicy,
  type RetryTelemetryEvent,
} from './retryPolicy';

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

    let abortHandler: (() => void) | undefined;

    const timer = setTimeout(() => {
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
 * The returned function carries `cancel()`, which drops any pending call. A
 * debounced callback that closes over component state MUST be cancelled on
 * unmount: otherwise the trailing timer fires against a torn-down tree. In
 * production that is a React "update on an unmounted component"; under jsdom
 * it is an uncaught `ReferenceError: window is not defined` thrown from
 * `resolveUpdatePriority` well after the owning test finished, which fails the
 * whole run and blames an unrelated file.
 *
 * @param func - Function to debounce
 * @param wait - Delay in milliseconds
 * @returns Debounced function with a `cancel()` method
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
export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
}

export function debounce<TArgs extends unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  wait: number,
): DebouncedFunction<TArgs> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const executedFunction = function (...args: TArgs) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  } as DebouncedFunction<TArgs>;

  executedFunction.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return executedFunction;
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

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  abortOnErrorMessages?: string[];
  onRetry?: (attempt: number, error: Error) => void;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  idempotent?: boolean;
  budget?: RetryBudget;
  signal?: AbortSignal;
  onEvent?: (event: RetryTelemetryEvent) => void;
}

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

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Retry an async operation using the shared retry policy.
 *
 * Caller-supplied `shouldRetry` and `abortOnErrorMessages` still decide first,
 * so the pre-policy contract is preserved. Everything the policy adds —
 * jittered backoff, Retry-After, idempotency awareness, budget, cancellation
 * and telemetry — applies to every caller without opting in.
 *
 * @throws RetryError when every attempt fails, the caller's own error when the
 *   caller classified it as terminal.
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
    idempotent = true,
    budget,
    signal,
    onEvent,
  } = options;

  const callerRejected = new WeakSet<object>();

  const policy: RetryPolicy = {
    operation: 'utils.retry',
    maxAttempts,
    baseDelayMs: initialDelay,
    maxDelayMs: maxDelay,
    multiplier: backoffMultiplier,
    idempotent,
    classify: (error, attempt) => {
      const normalized = toError(error);
      if (abortOnErrorMessages.some((message) => normalized.message.includes(message))) {
        callerRejected.add(normalized);
        return { disposition: 'terminal', reason: 'caller_abort_message' };
      }
      if (shouldRetry && !shouldRetry(normalized, attempt)) {
        callerRejected.add(normalized);
        return { disposition: 'terminal', reason: 'caller_should_not_retry' };
      }
      const shared = classifyRetryError(error);
      // Legacy contract: an error the shared classifier cannot recognise is
      // still retried, because callers rely on `shouldRetry` to narrow it.
      if (shared.disposition === 'terminal' && shared.reason === 'unclassified') {
        return { disposition: 'retry', reason: 'unclassified' };
      }
      return shared;
    },
    onEvent: (event) => {
      if (event.type === 'scheduled') onRetry?.(event.attempt, toError(event.error));
      onEvent?.(event);
    },
  };
  if (budget) policy.budget = budget;
  if (signal) policy.signal = signal;

  try {
    return await runWithRetryPolicy(operation, policy);
  } catch (error) {
    if (!(error instanceof RetryStoppedError)) throw error;
    const cause = toError(error.lastError);
    if (callerRejected.has(cause)) throw cause;
    throw new RetryError(
      `Operation failed after ${error.attempts} attempts: ${cause.message}`,
      error.attempts,
      cause,
    );
  }
}

export const retryStrategies = {
  network: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    abortOnErrorMessages: ['404', 'Not Found', 'Unauthorized', 'Forbidden'],
  } satisfies RetryOptions,

  database: {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    abortOnErrorMessages: ['SQLITE_CORRUPT', 'corrupted'],
  } satisfies RetryOptions,

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
