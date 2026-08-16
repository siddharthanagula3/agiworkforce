

export const ErrorCodes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',

  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  EMPLOYEE_NOT_FOUND: 'EMPLOYEE_NOT_FOUND',
  PLAN_GENERATION_FAILED: 'PLAN_GENERATION_FAILED',
  TASK_EXECUTION_FAILED: 'TASK_EXECUTION_FAILED',

  API_KEY_ERROR: 'API_KEY_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',

  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',

  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode = ErrorCodes.UNKNOWN,
    public statusCode: number = 500,
    public retryable: boolean = false,
    public userMessage?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) return error.retryable;

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('429') ||
      message.includes('500') ||
      message.includes('failed to fetch') ||
      message.includes('econnreset') ||
      message.includes('enotfound')
    );
  }
  return false;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError && error.userMessage) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('failed to fetch')) {
      return 'Network connection lost. Please check your internet connection and try again.';
    }

    if (message.includes('timeout')) {
      return 'Request timed out. The server took too long to respond. Please try again.';
    }

    if (message.includes('rate limit') || message.includes('429')) {
      return 'Too many requests. Please wait a moment before trying again.';
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return 'Authentication failed. Please log in again.';
    }

    if (message.includes('forbidden') || message.includes('403')) {
      return 'You do not have permission to perform this action.';
    }

    if (message.includes('500') || message.includes('503') || message.includes('server error')) {
      return 'Server error occurred. Please try again later.';
    }

    if (message.includes('api key')) {
      return 'API configuration error. Please contact support.';
    }

    if (error.message.length < 200 && !message.includes('stack')) {
      return error.message;
    }
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred';
}

export const parseErrorMessage = getErrorMessage;

export function getTechnicalErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export function toAppError(error: unknown, defaultCode: ErrorCode = ErrorCodes.UNKNOWN): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = getTechnicalErrorMessage(error);
  const messageLower = message.toLowerCase();

  let code = defaultCode;
  let statusCode = 500;
  let retryable = false;

  if (messageLower.includes('network') || messageLower.includes('failed to fetch')) {
    code = ErrorCodes.NETWORK_ERROR;
    statusCode = 0;
    retryable = true;
  } else if (messageLower.includes('timeout')) {
    code = ErrorCodes.TIMEOUT;
    statusCode = 408;
    retryable = true;
  } else if (messageLower.includes('rate limit') || messageLower.includes('429')) {
    code = ErrorCodes.RATE_LIMIT;
    statusCode = 429;
    retryable = true;
  } else if (messageLower.includes('unauthorized') || messageLower.includes('401')) {
    code = ErrorCodes.UNAUTHORIZED;
    statusCode = 401;
    retryable = false;
  } else if (messageLower.includes('forbidden') || messageLower.includes('403')) {
    code = ErrorCodes.FORBIDDEN;
    statusCode = 403;
    retryable = false;
  } else if (messageLower.includes('503')) {
    code = ErrorCodes.SERVICE_UNAVAILABLE;
    statusCode = 503;
    retryable = true;
  } else if (messageLower.includes('500') || messageLower.includes('server error')) {
    code = ErrorCodes.SERVER_ERROR;
    statusCode = 500;
    retryable = true;
  }

  return new AppError(message, code, statusCode, retryable, getErrorMessage(error));
}

export const TimeoutPresets = {
  FAST: 10000,
  STANDARD: 30000,
  AI_REQUEST: 60000,
  LONG_RUNNING: 120000,
  SEARCH: 15000,
} as const;

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out',
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export interface FetchWithTimeoutOptions {
  timeoutMs?: number;
  timeoutMessage?: string;
  fetchOptions?: RequestInit;
}

export async function fetchWithTimeout(
  url: string | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const {
    timeoutMs = TimeoutPresets.STANDARD,
    timeoutMessage = `Request timed out after ${Math.round(timeoutMs / 1000)}s`,
    fetchOptions = {},
  } = options;

  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError(
        timeoutMessage,
        ErrorCodes.TIMEOUT,
        408,
        true,
        'The request took too long to complete. Please try again.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  enabled?: boolean;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

export type NormalizedRetryConfig = Required<
  Pick<RetryOptions, 'enabled' | 'initialDelay' | 'maxDelay' | 'maxRetries'>
>;

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  enabled: true,
  shouldRetry: isRetryableError,
  onRetry: () => {},
};

export function normalizeRetryConfig(
  retry: RetryOptions | undefined,
  defaults: NormalizedRetryConfig,
): NormalizedRetryConfig {
  return {
    enabled: retry?.enabled ?? defaults.enabled,
    initialDelay: retry?.initialDelay ?? defaults.initialDelay,
    maxDelay: retry?.maxDelay ?? defaults.maxDelay,
    maxRetries: retry?.maxRetries ?? defaults.maxRetries,
  };
}

export function computeBackoffMs(attempt: number, config: NormalizedRetryConfig): number {
  const base = Math.min(config.maxDelay, config.initialDelay * Math.pow(2, Math.max(0, attempt)));
  const jitter = base * 0.2;
  return Math.max(0, Math.floor(base - jitter + Math.random() * jitter * 2));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

  if (opts.enabled === false) {
    return fn();
  }

  let lastError: unknown = null;
  let attempt = 0;

  while (attempt <= opts.maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!opts.shouldRetry(error)) {
        throw toAppError(error);
      }

      if (attempt >= opts.maxRetries) {
        throw toAppError(error);
      }

      const exponentialDelay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelay,
      );

      const jitter = Math.random() * exponentialDelay * 0.3;
      const delay = exponentialDelay + jitter;

      opts.onRetry(attempt + 1, error);

      await sleep(delay);

      attempt++;
    }
  }

  throw toAppError(lastError);
}

export function getRetryDelay(
  attempt: number,
  options: Pick<RetryOptions, 'initialDelay' | 'maxDelay' | 'backoffFactor'> = {},
): number {
  const { initialDelay = 1000, maxDelay = 10000, backoffFactor = 2 } = options;

  const exponentialDelay = Math.min(initialDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);

  const jitter = Math.random() * exponentialDelay * 0.3;
  return exponentialDelay + jitter;
}

export function withErrorHandling<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: {
    defaultErrorCode?: ErrorCode;
    onError?: (error: AppError) => void;
    rethrow?: boolean;
  },
): (...args: TArgs) => Promise<TResult> {
  const { defaultErrorCode = ErrorCodes.UNKNOWN, onError, rethrow = true } = options || {};

  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = toAppError(error, defaultErrorCode);
      onError?.(appError);
      if (rethrow) {
        throw appError;
      }
      throw error;
    }
  };
}

export function safeJsonParse<T>(
  json: string,
  fallback?: T,
): { success: true; data: T } | { success: false; error: AppError } {
  try {
    const data = JSON.parse(json) as T;
    return { success: true, data };
  } catch (error) {
    if (fallback !== undefined) {
      return { success: true, data: fallback };
    }
    return {
      success: false,
      error: new AppError(
        `Failed to parse JSON: ${getTechnicalErrorMessage(error)}`,
        ErrorCodes.VALIDATION_ERROR,
        400,
        false,
        'Invalid data format received',
      ),
    };
  }
}
