import { invoke as tauriInvoke } from '@tauri-apps/api/core';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

/**
 * Error with a code property for categorization.
 */
interface CodedError extends Error {
  code: string;
}

/**
 * Creates an error with a code property.
 */
function createCodedError(message: string, code: string): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

const MAX_PAYLOAD_BYTES = 256 * 1024;
const WINDOW_MS = 1000;
const MAX_REQS_PER_WINDOW = 30;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

const COMMAND_TIMEOUTS: Record<string, number> = {
  auth_login: 60000,
  auth_register: 60000,
  auth_refresh_token: 30000,

  read_file: 60000,
  file_write: 60000,

  execute_command: 120000,

  get_settings: 5000,
  get_onboarding_status: 5000,
};

const RETRYABLE_COMMANDS = new Set([
  'auth_refresh_token',
  'get_settings',
  'get_onboarding_status',
  'analytics_get_session_id',
  'analytics_flush_events',
  'mcp_check_server_health',
]);

const RETRYABLE_ERROR_CODES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE']);

const buckets = new Map<string, number[]>();

const rateLimitLocks = new Map<string, Promise<void>>();

/**
 * Calculates the byte length of an object when serialized to JSON.
 * Used to enforce payload size limits on IPC calls.
 *
 * @param obj - The object to measure
 * @returns The byte length of the JSON-serialized object
 * @throws Error if the object cannot be serialized to JSON
 */
function byteLength(obj: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch (error) {
    throw new Error(
      `Failed to serialize payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Wraps a promise with a timeout, rejecting if the operation takes too long.
 * Useful for preventing hung IPC calls from blocking the UI indefinitely.
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param operation - Name of the operation for error messages
 * @returns The resolved value of the original promise
 * @throws CodedError with code 'TIMEOUT' if the operation exceeds the timeout
 *
 * @example
 * const result = await withTimeout(fetchData(), 5000, 'fetchData');
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        createCodedError(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT'),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

export function validateResponse<T>(
  response: unknown,
  validator: (value: unknown) => value is T,
  command: string,
): T {
  if (!validator(response)) {
    throw createCodedError(
      `Invalid response from '${command}': expected valid structure but got ${JSON.stringify(response)?.substring(0, 100)}`,
      'INVALID_RESPONSE',
    );
  }
  return response;
}

export const TypeGuards = {
  isObject: (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  },

  isString: (value: unknown): value is string => {
    return typeof value === 'string';
  },

  isNumber: (value: unknown): value is number => {
    return typeof value === 'number' && !isNaN(value);
  },

  isBoolean: (value: unknown): value is boolean => {
    return typeof value === 'boolean';
  },

  isArray: (value: unknown): value is unknown[] => {
    return Array.isArray(value);
  },

  hasProperty: <T extends string>(value: unknown, prop: T): value is Record<T, unknown> => {
    return TypeGuards.isObject(value) && prop in value;
  },

  hasProperties: <T extends string>(value: unknown, props: T[]): value is Record<T, unknown> => {
    return TypeGuards.isObject(value) && props.every((prop) => prop in value);
  },
};

/**
 * Type guard to check if an error has a code property.
 */
function isCodedError(error: unknown): error is CodedError {
  return (
    error instanceof Error && 'code' in error && typeof (error as CodedError).code === 'string'
  );
}

function isRetryableError(error: unknown): boolean {
  if (isCodedError(error)) {
    return RETRYABLE_ERROR_CODES.has(error.code);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('unavailable')
    );
  }
  return false;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  command: string,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !RETRYABLE_COMMANDS.has(command) || !isRetryableError(error)) {
        throw error;
      }

      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);

      if (import.meta.env.DEV) {
        console.warn(
          `[IPC] Retry ${attempt + 1}/${maxRetries} for '${command}' after ${delay}ms. Error:`,
          error,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Enforces rate limiting for IPC commands using a sliding window algorithm.
 * Prevents excessive calls to the same command within a time window.
 *
 * @param key - The command name or key to rate limit
 * @throws CodedError with code 'RATE_LIMIT' if the rate limit is exceeded
 *
 * @example
 * await rateLimit('auth_login');
 * // Proceeds if under limit, throws if exceeded
 */
async function rateLimit(key: string): Promise<void> {
  // Wait for any existing lock on this key to be released
  while (rateLimitLocks.has(key)) {
    await rateLimitLocks.get(key);
  }

  // HKS-002 fix: Initialize resolveLock with a no-op to ensure it's always defined
  // This prevents potential deadlocks if an error occurs during lock setup
  let resolveLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });

  // AUDIT-007-020 fix: Set the lock and immediately wrap in try/finally
  // to guarantee lock release even if any subsequent operation fails
  rateLimitLocks.set(key, lockPromise);

  try {
    const now = Date.now();
    const arr = buckets.get(key) ?? [];
    const pruned = arr.filter((t) => now - t < WINDOW_MS);

    if (pruned.length >= MAX_REQS_PER_WINDOW) {
      const retry = WINDOW_MS - (now - (pruned[0] ?? now));
      throw createCodedError(`Rate limit exceeded for ${key}. Retry in ${retry}ms`, 'RATE_LIMIT');
    }

    pruned.push(now);
    buckets.set(key, pruned);
  } finally {
    // HKS-002 + AUDIT-007-020 fix: Always delete lock first, then resolve
    // This ensures cleanup happens even if any operation throws
    // The lock MUST be released to prevent deadlock on subsequent calls
    rateLimitLocks.delete(key);
    resolveLock();
  }
}

/**
 * Invokes a Tauri backend command with automatic rate limiting, timeout, and retry handling.
 * This is the primary way to communicate between the React frontend and Rust backend.
 *
 * @param command - The Tauri command name to invoke
 * @param args - Optional JSON-serializable arguments to pass to the command
 * @returns The response from the Tauri command
 * @throws CodedError with code 'PAYLOAD_TOO_LARGE' if args exceed 256KB
 * @throws CodedError with code 'RATE_LIMIT' if too many calls to the same command
 * @throws CodedError with code 'TIMEOUT' if the command exceeds its timeout
 *
 * @example
 * const settings = await invoke<Settings>('get_settings');
 * await invoke('file_write', { path: '/tmp/test.txt', content: 'Hello' });
 */
export async function invoke<T = unknown>(command: string, args?: Json): Promise<T> {
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('Invalid command name');
  }

  const size = byteLength(args);
  if (size > MAX_PAYLOAD_BYTES) {
    throw createCodedError(
      `Payload too large: ${size} bytes (max ${MAX_PAYLOAD_BYTES})`,
      'PAYLOAD_TOO_LARGE',
    );
  }

  return withRetry(async () => {
    await rateLimit(command);

    const timeout = COMMAND_TIMEOUTS[command] ?? DEFAULT_TIMEOUT_MS;

    const invokeArgs =
      args === null || typeof args !== 'object' || Array.isArray(args) ? undefined : args;
    return withTimeout(tauriInvoke<T>(command, invokeArgs), timeout, command);
  }, command);
}
