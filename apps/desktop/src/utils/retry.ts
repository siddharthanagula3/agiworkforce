export interface RetryOptions {
  maxAttempts?: number;

  initialDelay?: number;

  maxDelay?: number;

  backoffMultiplier?: number;

  abortOnErrors?: string[];

  onRetry?: (attempt: number, error: Error) => void;

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

function calculateDelay(
  attempt: number,
  initialDelay: number,
  backoffMultiplier: number,
  maxDelay: number,
): number {
  const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
  return Math.min(delay, maxDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

      if (abortOnErrors.some((errorType) => lastError.message.includes(errorType))) {
        throw lastError;
      }

      if (shouldRetry && !shouldRetry(lastError, attempt + 1)) {
        throw lastError;
      }

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

export async function retryWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  retryOptions: RetryOptions = {},
): Promise<T> {
  return retry(async () => {
    // AUDIT-007-013 fix: Store timeout ID so it can be cleared when operation succeeds
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Operation timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } finally {
      // AUDIT-007-013 fix: Always clear the timeout to prevent timer leak
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }, retryOptions);
}

export function makeRetriable<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: RetryOptions = {},
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => {
    return retry(() => fn(...args), options);
  };
}
