import { invoke as tauriInvoke } from '@tauri-apps/api/core';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256KB per invocation
const WINDOW_MS = 1000;
const MAX_REQS_PER_WINDOW = 30; // per-command, per-window
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds default timeout
const MAX_RETRIES = 3; // Maximum retry attempts
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second initial delay

// Different timeout values for different operation types
const COMMAND_TIMEOUTS: Record<string, number> = {
  // Auth operations may take longer
  auth_login: 60000,
  auth_register: 60000,
  auth_refresh_token: 30000,

  // File operations may take longer for large files
  read_file: 60000,
  write_file: 60000,

  // Terminal operations may need extended time
  execute_command: 120000,

  // Quick operations
  get_settings: 5000,
  get_onboarding_status: 5000,
};

// Commands that should be retried on transient failures
const RETRYABLE_COMMANDS = new Set([
  'auth_refresh_token',
  'get_settings',
  'get_onboarding_status',
  'analytics_get_session_id',
  'analytics_flush_events',
  'mcp_check_server_health',
]);

// Error codes that indicate retryable transient failures
const RETRYABLE_ERROR_CODES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE']);

const buckets = new Map<string, number[]>();
// Track pending rate limit operations to prevent race conditions
const rateLimitLocks = new Map<string, Promise<void>>();

function byteLength(obj: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch (error) {
    // Don't silently return 0 - throw error to prevent bypassing payload limit
    throw new Error(
      `Failed to serialize payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Wraps a promise with a timeout that rejects if operation takes too long
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`Operation '${operation}' timed out after ${timeoutMs}ms`);
      (err as any).code = 'TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

/**
 * Type guard to validate response has expected shape
 */
export function validateResponse<T>(
  response: unknown,
  validator: (value: unknown) => value is T,
  command: string,
): T {
  if (!validator(response)) {
    const err = new Error(
      `Invalid response from '${command}': expected valid structure but got ${JSON.stringify(response)?.substring(0, 100)}`,
    );
    (err as any).code = 'INVALID_RESPONSE';
    throw err;
  }
  return response;
}

/**
 * Common type guards for backend responses
 */
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
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as any).code;
    return RETRYABLE_ERROR_CODES.has(code);
  }
  // Also retry on generic network errors
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

/**
 * Retry operation with exponential backoff
 */
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

      // Don't retry if:
      // 1. This was the last attempt
      // 2. The command is not retryable
      // 3. The error is not retryable
      if (attempt === maxRetries || !RETRYABLE_COMMANDS.has(command) || !isRetryableError(error)) {
        throw error;
      }

      // Calculate exponential backoff delay: 1s, 2s, 4s
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);

      if (import.meta.env.DEV) {
        console.warn(
          `[IPC] Retry ${attempt + 1}/${maxRetries} for '${command}' after ${delay}ms. Error:`,
          error,
        );
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

async function rateLimit(key: string): Promise<void> {
  // Wait for any pending rate limit check for this key to complete
  while (rateLimitLocks.has(key)) {
    await rateLimitLocks.get(key);
  }

  // Create a promise that we'll resolve when done
  let resolveLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  rateLimitLocks.set(key, lockPromise);

  try {
    const now = Date.now();
    const arr = buckets.get(key) ?? [];
    const pruned = arr.filter((t) => now - t < WINDOW_MS);

    if (pruned.length >= MAX_REQS_PER_WINDOW) {
      const retry = WINDOW_MS - (now - (pruned[0] ?? now));
      const err = new Error(`Rate limit exceeded for ${key}. Retry in ${retry}ms`);
      // Attach a hint for callers to surface user-friendly toasts
      (err as any).code = 'RATE_LIMIT';
      throw err;
    }

    pruned.push(now);
    buckets.set(key, pruned);
  } finally {
    // Always release the lock
    rateLimitLocks.delete(key);
    resolveLock!();
  }
}

export async function invoke<T = unknown>(command: string, args?: Json): Promise<T> {
  // Validate command name (done outside retry to fail fast)
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('Invalid command name');
  }

  // Enforce payload cap - will throw if serialization fails (done outside retry to fail fast)
  const size = byteLength(args);
  if (size > MAX_PAYLOAD_BYTES) {
    const err = new Error(`Payload too large: ${size} bytes (max ${MAX_PAYLOAD_BYTES})`);
    (err as any).code = 'PAYLOAD_TOO_LARGE';
    throw err;
  }

  // Wrap operation with retry logic for transient failures
  return withRetry(async () => {
    // Rate-limit by command name (now async to prevent race conditions)
    await rateLimit(command);

    // Get timeout for this command (use default if not specified)
    const timeout = COMMAND_TIMEOUTS[command] ?? DEFAULT_TIMEOUT_MS;

    // Wrap with timeout to prevent hanging operations
    // Filter out null/primitives as tauri invoke only accepts Record<string, unknown> | undefined
    const invokeArgs =
      args === null || typeof args !== 'object' || Array.isArray(args) ? undefined : args;
    return withTimeout(tauriInvoke<T>(command, invokeArgs), timeout, command);
  }, command);
}
