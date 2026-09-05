import { z } from 'zod';
import { stripTrailingSlashes } from '@agiworkforce/types';

export const MANAGED_CLOUD_SCHEDULES_PATH = '/api/schedules';

export const MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE = 50;
export const MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE = 100;
export const MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE = 20;
export const MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE = 100;
export const MANAGED_CLOUD_SCHEDULES_MAX_PAGE_OFFSET = 10_000;

export function clampSchedulePageSize(
  value: number | null | undefined,
  defaultSize: number,
  maxSize: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultSize;
  return Math.min(maxSize, Math.max(1, Math.trunc(value)));
}

export function clampSchedulePageOffset(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MANAGED_CLOUD_SCHEDULES_MAX_PAGE_OFFSET, Math.max(0, Math.trunc(value)));
}

const NullableRecordSchema = z.record(z.string(), z.unknown()).nullable();

export const ManagedCloudScheduleRecurrenceSchema = z.enum([
  'once',
  'daily',
  'weekly',
  'monthly',
  'custom',
  'interval',
]);
export type ManagedCloudScheduleRecurrence = z.infer<typeof ManagedCloudScheduleRecurrenceSchema>;

export const ManagedCloudScheduleMutationSchema = z.object({
  name: z.string().trim().min(1).max(500),
  description: z.string().max(2_000).nullable(),
  prompt: z.string().trim().min(1).max(10_000),
  model: z.string().trim().min(1).max(200),
  recurrence: ManagedCloudScheduleRecurrenceSchema,
  cronExpression: z.string().trim().min(1).max(200).nullable(),
  scheduledAt: z.string().datetime().nullable(),
  intervalMs: z.number().int().positive().safe().nullable(),
  timeOfDay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  timezone: z.string().trim().min(1).max(100),
  isActive: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  maxExecutions: z.number().int().min(1).max(1_000_000).nullable(),
  projectId: z.string().trim().min(1).nullable().optional(),
});
export type ManagedCloudScheduleMutation = z.infer<typeof ManagedCloudScheduleMutationSchema>;

export const ManagedCloudScheduleTaskSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  scheduleType: z.enum(['cron', 'once', 'interval']),
  cronExpression: z.string().nullable(),
  executeAt: z.string().nullable(),
  intervalMs: z.number().int().nullable(),
  timezone: z.string(),
  isEnabled: z.boolean(),
  expiresAt: z.string().nullable(),
  maxExecutions: z.number().int().nullable(),
  executionCount: z.number().int().nonnegative(),
  actionType: z.enum(['agent', 'workflow', 'notification', 'command']),
  actionConfig: NullableRecordSchema,
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['active', 'paused', 'completed', 'failed', 'expired']),
  lastExecutedAt: z.string().nullable(),
  nextExecutionAt: z.string().nullable(),
  lastError: z.string().nullable(),
  metadata: NullableRecordSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  projectId: z.string().nullable().optional(),
});
export type ManagedCloudScheduleTask = z.infer<typeof ManagedCloudScheduleTaskSchema>;

export const ManagedCloudScheduleRunSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  status: z.enum(['running', 'success', 'failed', 'timeout', 'cancelled']),
  triggerSource: z.enum(['schedule', 'manual', 'webhook', 'api']),
  scheduledFor: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  result: NullableRecordSchema,
  error: z.string().nullable(),
  idempotencyKey: z.string(),
  leaseExpiresAt: z.string().nullable(),
  attemptCount: z.number().int().positive(),
});
export type ManagedCloudScheduleRun = z.infer<typeof ManagedCloudScheduleRunSchema>;

export const ManagedCloudSchedulePaginationSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const ManagedCloudScheduleListResponseSchema = z.object({
  schedules: z.array(ManagedCloudScheduleTaskSchema),
  pagination: ManagedCloudSchedulePaginationSchema,
});

export const ManagedCloudScheduleResponseSchema = z.object({
  schedule: ManagedCloudScheduleTaskSchema,
});

export const ManagedCloudScheduleRunListResponseSchema = z.object({
  runs: z.array(ManagedCloudScheduleRunSchema),
  pagination: ManagedCloudSchedulePaginationSchema,
});

export const ManagedCloudScheduleRunResponseSchema = z.object({
  run: ManagedCloudScheduleRunSchema,
  replay: z.boolean(),
});

export const ManagedCloudScheduleDeleteResponseSchema = z.object({ success: z.literal(true) });

export function managedCloudSchedulePath(scheduleId: string): string {
  return `${MANAGED_CLOUD_SCHEDULES_PATH}/${encodeURIComponent(scheduleId)}`;
}

export function managedCloudScheduleRunsPath(scheduleId: string): string {
  return `${managedCloudSchedulePath(scheduleId)}/runs`;
}

export type ManagedCloudSchedulesMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ManagedCloudSchedulesHeaderContext {
  method: ManagedCloudSchedulesMethod;
  path: string;
  mutation: boolean;
  json: boolean;
  idempotencyKey?: string;
}

export interface ManagedCloudSchedulesClientConfig {
  baseUrl?: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  getHeaders?: (context: ManagedCloudSchedulesHeaderContext) => HeadersInit | Promise<HeadersInit>;
  credentials?: RequestCredentials;
}

export interface ManagedCloudSchedulesPageInput {
  limit: number;
  offset: number;
  projectId?: string | null;
  signal?: AbortSignal;
}

export interface ManagedCloudSchedulesClient {
  listSchedules(input: ManagedCloudSchedulesPageInput): Promise<{
    schedules: ManagedCloudScheduleTask[];
    pagination: { limit: number; offset: number };
    hasMore: boolean;
  }>;
  getSchedule(scheduleId: string, signal?: AbortSignal): Promise<ManagedCloudScheduleTask>;
  createSchedule(
    input: ManagedCloudScheduleMutation,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask>;
  updateSchedule(
    scheduleId: string,
    input: ManagedCloudScheduleMutation,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask>;
  setScheduleEnabled(
    scheduleId: string,
    isActive: boolean,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask>;
  deleteSchedule(scheduleId: string, signal?: AbortSignal): Promise<void>;
  listRuns(
    scheduleId: string,
    input: ManagedCloudSchedulesPageInput,
  ): Promise<{
    runs: ManagedCloudScheduleRun[];
    pagination: { limit: number; offset: number };
    hasMore: boolean;
  }>;
  runNow(
    scheduleId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<{ run: ManagedCloudScheduleRun; replay: boolean }>;
}

export class ManagedCloudSchedulesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ManagedCloudSchedulesHttpError';
  }
}

export class ManagedCloudSchedulesContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManagedCloudSchedulesContractError';
  }
}

function scheduleBaseUrl(value: string): string {
  return stripTrailingSlashes(value);
}

function parseScheduleContract<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ManagedCloudSchedulesContractError(
      `Managed Cloud schedules ${label} contract violation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

async function scheduleHttpError(response: Response): Promise<ManagedCloudSchedulesHttpError> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body['error'];
  const nested =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : undefined;
  const message =
    typeof raw === 'string'
      ? raw
      : typeof nested?.['message'] === 'string'
        ? nested['message']
        : typeof body['message'] === 'string'
          ? body['message']
          : `Request failed (${response.status}).`;
  return new ManagedCloudSchedulesHttpError(
    message,
    response.status,
    typeof nested?.['code'] === 'string' ? nested['code'] : undefined,
  );
}

export function createManagedCloudSchedulesClient(
  config: ManagedCloudSchedulesClientConfig = {},
): ManagedCloudSchedulesClient {
  const baseUrl = scheduleBaseUrl(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    path: string,
    method: ManagedCloudSchedulesMethod,
    schema: z.ZodType<T>,
    options: {
      body?: unknown;
      signal?: AbortSignal;
      idempotencyKey?: string;
      label: string;
    },
  ): Promise<T> {
    const json = options.body !== undefined;
    const mutation = method !== 'GET';
    const configuredHeaders = await config.getHeaders?.({
      method,
      path,
      mutation,
      json,
      idempotencyKey: options.idempotencyKey,
    });
    const headers = new Headers(configuredHeaders);
    if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: Object.fromEntries(headers.entries()),
        credentials: config.credentials,
        body: json ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ManagedCloudSchedulesHttpError(
        'Could not reach the schedules service. Check your connection and retry.',
        0,
      );
    }
    if (!response.ok) throw await scheduleHttpError(response);
    const value = await response.json().catch(() => undefined);
    return parseScheduleContract(schema, value, `${options.label} response`);
  }

  return {
    async listSchedules({ limit, offset, projectId, signal }) {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (projectId) query.set('projectId', projectId);
      const result = await request(
        `${MANAGED_CLOUD_SCHEDULES_PATH}?${query.toString()}`,
        'GET',
        ManagedCloudScheduleListResponseSchema,
        { signal, label: 'list' },
      );
      return {
        schedules: result.schedules,
        pagination: result.pagination,
        hasMore: result.schedules.length === result.pagination.limit,
      };
    },
    async getSchedule(scheduleId, signal) {
      const result = await request(
        managedCloudSchedulePath(scheduleId),
        'GET',
        ManagedCloudScheduleResponseSchema,
        { signal, label: 'get' },
      );
      return result.schedule;
    },
    async createSchedule(input, signal) {
      const body = parseScheduleContract(
        ManagedCloudScheduleMutationSchema,
        input,
        'create request',
      );
      const result = await request(
        MANAGED_CLOUD_SCHEDULES_PATH,
        'POST',
        ManagedCloudScheduleResponseSchema,
        { body, signal, label: 'create' },
      );
      return result.schedule;
    },
    async updateSchedule(scheduleId, input, signal) {
      const body = parseScheduleContract(
        ManagedCloudScheduleMutationSchema,
        input,
        'update request',
      );
      const result = await request(
        managedCloudSchedulePath(scheduleId),
        'PUT',
        ManagedCloudScheduleResponseSchema,
        { body, signal, label: 'update' },
      );
      return result.schedule;
    },
    async setScheduleEnabled(scheduleId, isActive, signal) {
      const result = await request(
        managedCloudSchedulePath(scheduleId),
        'PATCH',
        ManagedCloudScheduleResponseSchema,
        { body: { isActive }, signal, label: 'status update' },
      );
      return result.schedule;
    },
    async deleteSchedule(scheduleId, signal) {
      await request(
        managedCloudSchedulePath(scheduleId),
        'DELETE',
        ManagedCloudScheduleDeleteResponseSchema,
        { signal, label: 'delete' },
      );
    },
    async listRuns(scheduleId, { limit, offset, signal }) {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      const result = await request(
        `${managedCloudScheduleRunsPath(scheduleId)}?${query.toString()}`,
        'GET',
        ManagedCloudScheduleRunListResponseSchema,
        { signal, label: 'run history' },
      );
      return {
        runs: result.runs,
        pagination: result.pagination,
        hasMore: result.runs.length === result.pagination.limit,
      };
    },
    async runNow(scheduleId, idempotencyKey, signal) {
      if (!idempotencyKey.trim()) {
        throw new ManagedCloudSchedulesContractError(
          'Managed Cloud schedules manual run requires an idempotency key.',
        );
      }
      const result = await request(
        managedCloudScheduleRunsPath(scheduleId),
        'POST',
        ManagedCloudScheduleRunResponseSchema,
        { signal, idempotencyKey, label: 'manual run' },
      );
      return { run: result.run, replay: result.replay };
    },
  };
}
