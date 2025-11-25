/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay between retries in milliseconds
   * @default 30000
   */
  maxDelay?: number;

  /**
   * Backoff multiplier (2^n * initialDelay)
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Error types that should abort retries immediately
   */
  abortOnErrors?: string[];

  /**
   * Callback invoked before each retry attempt
   */
  onRetry?: (attempt: number, error: Error) => void;

  /**
   * Function to determine if error is retryable
   */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Calculate delay with exponential backoff
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
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   async () => {
 *     return await fetch('/api/data');
 *   },
 *   {
 *     maxAttempts: 5,
 *     initialDelay: 1000,
 *     onRetry: (attempt, error) => {
 *
 *     }
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
    abortOnErrors = [],
    onRetry,
    shouldRetry,
  } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should abort
      if (abortOnErrors.some((errorType) => lastError.message.includes(errorType))) {
        throw lastError;
      }

      // Custom retry check
      if (shouldRetry && !shouldRetry(lastError, attempt + 1)) {
        throw lastError;
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts - 1) {
        break;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, initialDelay, backoffMultiplier, maxDelay);

      // Notify retry callback
      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw new RetryError(
    `Operation failed after ${maxAttempts} attempts: ${lastError.message}`,
    maxAttempts,
    lastError,
  );
}

/**
 * Retry with specific strategies for common error types
 */
export async function retryWithStrategy<T>(
  operation: () => Promise<T>,
  errorType: 'network' | 'database' | 'api' | 'filesystem',
): Promise<T> {
  const strategies: Record<typeof errorType, RetryOptions> = {
    network: {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      abortOnErrors: ['404', 'Not Found', 'Unauthorized', 'Forbidden'],
    },
    database: {
      maxAttempts: 5,
      initialDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 1.5,
      abortOnErrors: ['SQLITE_CORRUPT', 'corrupted'],
    },
    api: {
      maxAttempts: 4,
      initialDelay: 2000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      shouldRetry: (error, attempt) => {
        // Retry on 5xx errors and rate limits
        if (error.message.includes('429') || error.message.includes('Rate limit')) {
          return true;
        }
        if (error.message.includes('5')) {
          return attempt < 3;
        }
        return false;
      },
    },
    filesystem: {
      maxAttempts: 3,
      initialDelay: 500,
      maxDelay: 3000,
      backoffMultiplier: 2,
      abortOnErrors: ['ENOENT', 'EACCES', 'Permission denied'],
    },
  };

  return retry(operation, strategies[errorType]);
}

/**
 * Batch retry - retry multiple operations with shared options
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

/**
 * Retry with timeout - abort if operation takes too long
 */
export async function retryWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  retryOptions: RetryOptions = {},
): Promise<T> {
  return retry(async () => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([operation(), timeoutPromise]);
  }, retryOptions);
}

/**
 * Create a retriable version of a function
 */
export function makeRetriable<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: RetryOptions = {},
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => {
    return retry(() => fn(...args), options);
  };
}
