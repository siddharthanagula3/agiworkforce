import { invoke as tauriInvoke } from '@tauri-apps/api/core';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

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
  write_file: 60000,

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

function byteLength(obj: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch (error) {
    throw new Error(
      `Failed to serialize payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

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

function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as any).code;
    return RETRYABLE_ERROR_CODES.has(code);
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

async function rateLimit(key: string): Promise<void> {
  while (rateLimitLocks.has(key)) {
    await rateLimitLocks.get(key);
  }

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

      (err as any).code = 'RATE_LIMIT';
      throw err;
    }

    pruned.push(now);
    buckets.set(key, pruned);
  } finally {
    rateLimitLocks.delete(key);
    resolveLock!();
  }
}

export async function invoke<T = unknown>(command: string, args?: Json): Promise<T> {
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('Invalid command name');
  }

  const size = byteLength(args);
  if (size > MAX_PAYLOAD_BYTES) {
    const err = new Error(`Payload too large: ${size} bytes (max ${MAX_PAYLOAD_BYTES})`);
    (err as any).code = 'PAYLOAD_TOO_LARGE';
    throw err;
  }

  return withRetry(async () => {
    await rateLimit(command);

    const timeout = COMMAND_TIMEOUTS[command] ?? DEFAULT_TIMEOUT_MS;

    const invokeArgs =
      args === null || typeof args !== 'object' || Array.isArray(args) ? undefined : args;
    return withTimeout(tauriInvoke<T>(command, invokeArgs), timeout, command);
  }, command);
}
