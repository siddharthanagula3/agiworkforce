import { z } from 'zod';
import {
  SettingsSyncPullResponseSchema,
  SettingsSyncPushRequestSchema,
  SettingsSyncPushResponseSchema,
  SettingsServerVersionSchema,
  type SettingsSyncPullResponse,
  type SettingsSyncPushRequest,
  type SettingsSyncPushResponse,
} from './sync';

export const MANAGED_CLOUD_SETTINGS_SYNC_PATH = '/api/settings/sync';

export type ManagedCloudSettingsFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type ManagedCloudSettingsOperation = 'pull' | 'push';
export type ManagedCloudSettingsEventPhase = 'start' | 'retry' | 'success' | 'error';

export interface ManagedCloudSettingsClientEvent {
  operation: ManagedCloudSettingsOperation;
  phase: ManagedCloudSettingsEventPhase;
  attempt: number;
  status?: number;
  error?: unknown;
}

export interface ManagedCloudSettingsClientConfig {
  baseUrl?: string;
  fetchImpl?: ManagedCloudSettingsFetch;
  getHeaders?: (operation: ManagedCloudSettingsOperation) => HeadersInit | Promise<HeadersInit>;
  maxAttempts?: number;
  retryDelayMs?: number;
  onEvent?: (event: ManagedCloudSettingsClientEvent) => void;
}

export interface ManagedCloudSettingsRequestOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  retryDelayMs?: number;
}

export interface ManagedCloudSettingsClient {
  pull(
    cursor: string,
    options?: ManagedCloudSettingsRequestOptions,
  ): Promise<SettingsSyncPullResponse>;
  push(
    input: SettingsSyncPushRequest,
    options?: ManagedCloudSettingsRequestOptions,
  ): Promise<SettingsSyncPushResponse>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 350;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

export class ManagedCloudSettingsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ManagedCloudSettingsHttpError';
  }
}

export class ManagedCloudSettingsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedCloudSettingsContractError';
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function abortError(): Error {
  const error = new Error('Managed Cloud settings request was cancelled');
  error.name = 'AbortError';
  return error;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    assertNotAborted(signal);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const handle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(handle);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function responseError(response: Response): Promise<ManagedCloudSettingsHttpError> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body['error'];
  const message =
    typeof raw === 'string'
      ? raw
      : raw &&
          typeof raw === 'object' &&
          typeof (raw as Record<string, unknown>)['message'] === 'string'
        ? ((raw as Record<string, unknown>)['message'] as string)
        : `HTTP ${response.status}`;
  return new ManagedCloudSettingsHttpError(`HTTP ${response.status}: ${message}`, response.status);
}

async function parseContract<T>(
  response: Response,
  schema: z.ZodType<T>,
  name: string,
): Promise<T> {
  const body = await response.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ManagedCloudSettingsContractError(
      `Managed Cloud settings ${name} contract violation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function isTransient(error: unknown): boolean {
  if (error instanceof ManagedCloudSettingsContractError) return false;
  if (error instanceof ManagedCloudSettingsHttpError) {
    return TRANSIENT_HTTP_STATUSES.has(error.status);
  }
  return error instanceof Error && error.name !== 'AbortError';
}

export function createManagedCloudSettingsClient(
  config: ManagedCloudSettingsClientConfig = {},
): ManagedCloudSettingsClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function requestHeaders(
    operation: ManagedCloudSettingsOperation,
  ): Promise<HeadersInit | undefined> {
    const configured = await config.getHeaders?.(operation);
    if (operation !== 'push') return configured;
    if (!configured) return { 'Content-Type': 'application/json' };
    if (!Array.isArray(configured) && !(configured instanceof Headers)) {
      return { 'Content-Type': 'application/json', ...configured };
    }
    const headers = new Headers(configured);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return headers;
  }

  async function request<T>(
    operation: ManagedCloudSettingsOperation,
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    options: ManagedCloudSettingsRequestOptions,
  ): Promise<T> {
    const maxAttempts = Math.max(
      1,
      options.maxAttempts ?? config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    );
    const retryDelayMs = Math.max(
      0,
      options.retryDelayMs ?? config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    );
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      assertNotAborted(options.signal);
      config.onEvent?.({ operation, phase: 'start', attempt });
      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          ...init,
          headers: await requestHeaders(operation),
          signal: options.signal,
        });
        if (!response.ok) throw await responseError(response);
        const parsed = await parseContract(response, schema, `${operation} response`);
        config.onEvent?.({ operation, phase: 'success', attempt, status: response.status });
        return parsed;
      } catch (error) {
        lastError = error;
        const status = error instanceof ManagedCloudSettingsHttpError ? error.status : undefined;
        if (attempt >= maxAttempts || !isTransient(error)) {
          config.onEvent?.({ operation, phase: 'error', attempt, status, error });
          throw error;
        }
        config.onEvent?.({ operation, phase: 'retry', attempt, status, error });
        await delay(retryDelayMs * attempt, options.signal);
      }
    }

    throw lastError;
  }

  return {
    async pull(cursor, options = {}) {
      const parsedCursor = SettingsServerVersionSchema.safeParse(cursor);
      if (!parsedCursor.success) {
        throw new ManagedCloudSettingsContractError('Managed Cloud settings cursor is invalid');
      }
      return request(
        'pull',
        `${MANAGED_CLOUD_SETTINGS_SYNC_PATH}?since=${encodeURIComponent(parsedCursor.data)}`,
        { method: 'GET' },
        SettingsSyncPullResponseSchema,
        options,
      );
    },

    async push(input, options = {}) {
      const parsed = SettingsSyncPushRequestSchema.safeParse(input);
      if (!parsed.success) {
        throw new ManagedCloudSettingsContractError(
          `Managed Cloud settings push request contract violation: ${parsed.error.message}`,
        );
      }
      return request(
        'push',
        MANAGED_CLOUD_SETTINGS_SYNC_PATH,
        {
          method: 'POST',
          body: JSON.stringify(parsed.data),
        },
        SettingsSyncPushResponseSchema,
        options,
      );
    },
  };
}
