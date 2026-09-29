import { z } from 'zod';
import { stripTrailingSlashes } from '@agiworkforce/types';

export const MANAGED_CLOUD_SCHEDULES_PATH = '/api/schedules';

export const MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE = 50;
export const MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE = 100;
export const MANAGED_CLOUD_SCHEDULE_RUNS_DEFAULT_PAGE_SIZE = 20;
export const MANAGED_CLOUD_SCHEDULE_RUNS_MAX_PAGE_SIZE = 100;
export const MANAGED_CLOUD_SCHEDULES_MAX_PAGE_OFFSET = 10_000;
export const MANAGED_CLOUD_SCHEDULE_MAX_CREDIT_CAP = 1_000_000;

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
  'rrule',
  'event',
]);
export type ManagedCloudScheduleRecurrence = z.infer<typeof ManagedCloudScheduleRecurrenceSchema>;

export const ManagedCloudScheduleDaypartSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
});
export type ManagedCloudScheduleDaypart = z.infer<typeof ManagedCloudScheduleDaypartSchema>;

export const ManagedCloudScheduleMissedExecutionPolicySchema = z.enum(['run_once', 'skip']);
export type ManagedCloudScheduleMissedExecutionPolicy = z.infer<
  typeof ManagedCloudScheduleMissedExecutionPolicySchema
>;

export const ManagedCloudScheduleFieldConditionSchema = z.object({
  field: z.string().min(1).max(400),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'in',
    'exists',
    'not_exists',
    'greater_than',
    'less_than',
  ]),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])
    .optional(),
});
export type ManagedCloudScheduleFieldCondition = z.infer<
  typeof ManagedCloudScheduleFieldConditionSchema
>;

export const ManagedCloudScheduleConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url_changed'), url: z.string().url().max(2_000) }),
  z.object({
    kind: z.literal('url_matches'),
    url: z.string().url().max(2_000),
    conditions: z.array(ManagedCloudScheduleFieldConditionSchema).min(1).max(10),
  }),
]);
export type ManagedCloudScheduleCondition = z.infer<typeof ManagedCloudScheduleConditionSchema>;

export const ManagedCloudScheduleConditionStateSchema = z.object({
  checkedAt: z.string(),
  met: z.boolean(),
  detail: z.string(),
  contentSha256: z.string().nullable().optional(),
});

export const ManagedCloudScheduleSourcesSchema = z.object({
  project: z.boolean(),
  memory: z.boolean(),
  web: z.boolean(),
  recentChats: z.boolean().optional(),
});
export type ManagedCloudScheduleSources = z.infer<typeof ManagedCloudScheduleSourcesSchema>;

export const MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES: ManagedCloudScheduleSources = {
  project: true,
  memory: true,
  web: true,
  recentChats: false,
};
export const MANAGED_CLOUD_SCHEDULE_MAX_CONNECTORS = 100;

export const ManagedCloudScheduleConnectorsSchema = z
  .array(z.string().trim().min(1).max(128))
  .max(MANAGED_CLOUD_SCHEDULE_MAX_CONNECTORS)
  .nullable();

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
  creditCap: z
    .number()
    .int()
    .min(1)
    .max(MANAGED_CLOUD_SCHEDULE_MAX_CREDIT_CAP)
    .nullable()
    .optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  recurrenceRule: z.string().trim().min(1).max(512).nullable().optional(),
  dayparts: z.array(ManagedCloudScheduleDaypartSchema).max(7).nullable().optional(),
  retryMaxAttempts: z.number().int().min(0).max(5).optional(),
  retryBackoffSeconds: z.number().int().min(60).max(86_400).optional(),
  missedExecutionPolicy: ManagedCloudScheduleMissedExecutionPolicySchema.optional(),
  condition: ManagedCloudScheduleConditionSchema.nullable().optional(),
  sources: ManagedCloudScheduleSourcesSchema.optional(),
  connectors: ManagedCloudScheduleConnectorsSchema.optional(),
});
export type ManagedCloudScheduleMutation = z.infer<typeof ManagedCloudScheduleMutationSchema>;

export const ManagedCloudScheduleTaskSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  scheduleType: z.enum(['cron', 'once', 'interval', 'rrule', 'event']),
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
  recurrenceRule: z.string().nullable().optional(),
  dayparts: z.array(ManagedCloudScheduleDaypartSchema).nullable().optional(),
  retryMaxAttempts: z.number().int().nonnegative().optional(),
  retryBackoffSeconds: z.number().int().positive().optional(),
  retryAttempt: z.number().int().nonnegative().optional(),
  missedExecutionPolicy: ManagedCloudScheduleMissedExecutionPolicySchema.optional(),
  condition: ManagedCloudScheduleConditionSchema.nullable().optional(),
  conditionState: ManagedCloudScheduleConditionStateSchema.nullable().optional(),
  creditCap: z.number().positive().nullable().optional(),
  creditsUsed: z.number().nonnegative().optional(),
  pausedReason: z.enum(['credit_cap_reached', 'approval_required']).nullable().optional(),
  sources: ManagedCloudScheduleSourcesSchema.optional(),
  connectors: ManagedCloudScheduleConnectorsSchema.optional(),
});
export type ManagedCloudScheduleTask = z.infer<typeof ManagedCloudScheduleTaskSchema>;

export const MANAGED_CLOUD_SCHEDULE_APPROVAL_MAX_TOOL_CALLS = 32;

export const ManagedCloudScheduleRunApprovalToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string(),
  input: z.string().nullable(),
});
export type ManagedCloudScheduleRunApprovalToolCall = z.infer<
  typeof ManagedCloudScheduleRunApprovalToolCallSchema
>;

export const ManagedCloudScheduleRunPendingApprovalSchema = z.object({
  requestedAt: z.string(),
  expiresAt: z.string(),
  toolCalls: z
    .array(ManagedCloudScheduleRunApprovalToolCallSchema)
    .min(1)
    .max(MANAGED_CLOUD_SCHEDULE_APPROVAL_MAX_TOOL_CALLS),
});
export type ManagedCloudScheduleRunPendingApproval = z.infer<
  typeof ManagedCloudScheduleRunPendingApprovalSchema
>;

export const ManagedCloudScheduleRunSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  status: z.enum(['running', 'success', 'failed', 'timeout', 'cancelled', 'awaiting_approval']),
  triggerSource: z.enum(['schedule', 'manual', 'webhook', 'api']),
  scheduledFor: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  result: NullableRecordSchema,
  output: z.string().nullable().optional(),
  error: z.string().nullable(),
  idempotencyKey: z.string(),
  leaseExpiresAt: z.string().nullable(),
  attemptCount: z.number().int().positive(),
  creditsUsed: z.number().nonnegative().nullable().optional(),
  pendingApproval: ManagedCloudScheduleRunPendingApprovalSchema.nullable().optional(),
});
export type ManagedCloudScheduleRun = z.infer<typeof ManagedCloudScheduleRunSchema>;

export const MANAGED_CLOUD_SCHEDULE_APPROVAL_DECISIONS = ['approved', 'rejected'] as const;

export const ManagedCloudScheduleRunApprovalSchema = z.object({
  decision: z.enum(MANAGED_CLOUD_SCHEDULE_APPROVAL_DECISIONS),
  toolCallIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(MANAGED_CLOUD_SCHEDULE_APPROVAL_MAX_TOOL_CALLS),
});
export type ManagedCloudScheduleRunApproval = z.infer<typeof ManagedCloudScheduleRunApprovalSchema>;

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

export const ManagedCloudScheduleRecentRunSchema = ManagedCloudScheduleRunSchema.extend({
  taskName: z.string(),
});
export type ManagedCloudScheduleRecentRun = z.infer<typeof ManagedCloudScheduleRecentRunSchema>;

export const ManagedCloudScheduleRecentRunListResponseSchema = z.object({
  runs: z.array(ManagedCloudScheduleRecentRunSchema),
  nextCursor: z.string().min(1).nullable(),
});
export type ManagedCloudScheduleRecentRunListResponse = z.infer<
  typeof ManagedCloudScheduleRecentRunListResponseSchema
>;

export const MANAGED_CLOUD_SCHEDULE_RECENT_RUNS_PATH = '/api/schedules/runs';

export function managedCloudScheduleRecentRunsPath(limit: number, cursor?: string | null): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return `${MANAGED_CLOUD_SCHEDULE_RECENT_RUNS_PATH}?${query.toString()}`;
}

export const ManagedCloudScheduleRunResponseSchema = z.object({
  run: ManagedCloudScheduleRunSchema,
  replay: z.boolean(),
});

export const ManagedCloudScheduleRunApprovalResponseSchema = z.object({
  run: ManagedCloudScheduleRunSchema,
});

export const ManagedCloudScheduleDeleteResponseSchema = z.object({ success: z.literal(true) });

export const MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export const ManagedCloudScheduleShareSnapshotSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  prompt: z.string(),
  model: z.string().nullable(),
  scheduleType: ManagedCloudScheduleTaskSchema.shape.scheduleType,
  cronExpression: z.string().nullable(),
  intervalMs: z.number().int().nullable(),
  recurrenceRule: z.string().nullable(),
  dayparts: z.array(ManagedCloudScheduleDaypartSchema).nullable(),
  metadata: NullableRecordSchema,
  missedExecutionPolicy: ManagedCloudScheduleMissedExecutionPolicySchema,
  retryMaxAttempts: z.number().int().nonnegative(),
  retryBackoffSeconds: z.number().int().positive(),
});
export type ManagedCloudScheduleShareSnapshot = z.infer<
  typeof ManagedCloudScheduleShareSnapshotSchema
>;

export const ManagedCloudScheduleShareSchema = z.object({
  token: z.string().regex(MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN),
  snapshot: ManagedCloudScheduleShareSnapshotSchema,
  createdAt: z.string(),
});
export type ManagedCloudScheduleShare = z.infer<typeof ManagedCloudScheduleShareSchema>;

export const ManagedCloudScheduleShareResponseSchema = z.object({
  share: ManagedCloudScheduleShareSchema,
});
export type ManagedCloudScheduleShareResponse = z.input<
  typeof ManagedCloudScheduleShareResponseSchema
>;

export const MANAGED_CLOUD_SCHEDULE_SHARES_PATH = '/api/schedule-shares';

export function managedCloudScheduleSharedPath(token: string): string {
  return `${MANAGED_CLOUD_SCHEDULE_SHARES_PATH}/${encodeURIComponent(token)}`;
}

export function managedCloudScheduleShareUrlPath(token: string): string {
  return `/share/schedules/${encodeURIComponent(token)}`;
}

export function managedCloudSchedulePath(scheduleId: string): string {
  return `${MANAGED_CLOUD_SCHEDULES_PATH}/${encodeURIComponent(scheduleId)}`;
}

export function managedCloudScheduleSharePath(scheduleId: string): string {
  return `${managedCloudSchedulePath(scheduleId)}/share`;
}

export function managedCloudScheduleRunsPath(scheduleId: string): string {
  return `${managedCloudSchedulePath(scheduleId)}/runs`;
}

export function managedCloudScheduleRunApprovalPath(scheduleId: string, runId: string): string {
  return `${managedCloudScheduleRunsPath(scheduleId)}/${encodeURIComponent(runId)}/approval`;
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

export interface ManagedCloudScheduleRecentRunsPageInput {
  limit: number;
  cursor?: string | null;
  signal?: AbortSignal;
}

export interface ManagedCloudScheduleRecentRunsPage {
  runs: ManagedCloudScheduleRecentRun[];
  nextCursor: string | null;
  hasMore: boolean;
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
  resolveRunApproval(
    scheduleId: string,
    runId: string,
    input: ManagedCloudScheduleRunApproval,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleRun>;
  listRecentRuns(
    input: ManagedCloudScheduleRecentRunsPageInput,
  ): Promise<ManagedCloudScheduleRecentRunsPage>;
  shareSchedule(scheduleId: string, signal?: AbortSignal): Promise<ManagedCloudScheduleShare>;
  unshareSchedule(scheduleId: string, signal?: AbortSignal): Promise<void>;
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
    async resolveRunApproval(scheduleId, runId, input, signal) {
      const body = parseScheduleContract(
        ManagedCloudScheduleRunApprovalSchema,
        input,
        'approval request',
      );
      const result = await request(
        managedCloudScheduleRunApprovalPath(scheduleId, runId),
        'POST',
        ManagedCloudScheduleRunApprovalResponseSchema,
        { body, signal, label: 'approval' },
      );
      return result.run;
    },
    async listRecentRuns({ limit, cursor, signal }) {
      const result = await request(
        managedCloudScheduleRecentRunsPath(limit, cursor),
        'GET',
        ManagedCloudScheduleRecentRunListResponseSchema,
        { signal, label: 'recent runs' },
      );
      return {
        runs: result.runs,
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      };
    },
    async shareSchedule(scheduleId, signal) {
      const result = await request(
        managedCloudScheduleSharePath(scheduleId),
        'POST',
        ManagedCloudScheduleShareResponseSchema,
        { signal, label: 'share' },
      );
      return result.share;
    },
    async unshareSchedule(scheduleId, signal) {
      await request(
        managedCloudScheduleSharePath(scheduleId),
        'DELETE',
        ManagedCloudScheduleDeleteResponseSchema,
        { signal, label: 'unshare' },
      );
    },
  };
}

export interface ManagedCloudScheduleRunTiming {
  skipped: boolean;
  note: string;
}

function formatScheduleLateness(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function describeScheduleRunTiming(
  run: Pick<ManagedCloudScheduleRun, 'result'>,
  formatWhen: (iso: string) => string,
): ManagedCloudScheduleRunTiming | null {
  const result = run.result ?? {};
  const skipped = result['skipped'] === true;
  const missed = recordOf(result['missedExecution']);
  const scheduledFor = typeof missed?.['scheduledFor'] === 'string' ? missed['scheduledFor'] : null;
  const lateByMs = typeof missed?.['lateByMs'] === 'number' ? missed['lateByMs'] : null;
  if (scheduledFor && lateByMs !== null) {
    const when = formatWhen(scheduledFor);
    const late = formatScheduleLateness(lateByMs);
    return skipped
      ? {
          skipped,
          note: `Skipped the run scheduled for ${when}: it was missed by ${late}, and this schedule skips missed runs.`,
        }
      : { skipped, note: `Ran late: scheduled for ${when}, started ${late} later.` };
  }
  const detail = recordOf(result['conditionWatch'])?.['detail'];
  if (skipped && typeof detail === 'string' && detail.trim()) {
    return { skipped, note: `Skipped: the condition was not met. ${detail}` };
  }
  return null;
}

export interface ManagedCloudScheduleTemplateDraft {
  name: string;
  prompt: string;
  recurrence: Extract<ManagedCloudScheduleRecurrence, 'daily' | 'weekly'>;
  daysOfWeek?: number[];
  timeOfDay: string;
  sources?: ManagedCloudScheduleSources;
}

export interface ManagedCloudScheduleTemplate {
  id: string;
  name: string;
  cadenceLabel: string;
  description: string;
  draft: ManagedCloudScheduleTemplateDraft;
}

const WEEKDAYS = [1, 2, 3, 4, 5];

export const MANAGED_CLOUD_SCHEDULE_TEMPLATES: readonly ManagedCloudScheduleTemplate[] = [
  {
    id: 'weekly-review',
    name: 'Weekly review',
    cadenceLabel: 'Fridays at 4:00 PM',
    description: 'Summarise the week and surface what slipped, before you log off.',
    draft: {
      name: 'Weekly review',
      prompt:
        'Write a short review of my week. Cover what got finished, what slipped, and the two or three things that most deserve attention next week. Be concrete and skip filler.',
      recurrence: 'weekly',
      daysOfWeek: [5],
      timeOfDay: '16:00',
    },
  },
  {
    id: 'daily-briefing',
    name: 'Daily briefing',
    cadenceLabel: 'Weekdays at 8:00 AM',
    description: 'A short start-of-day brief so the first thing you read is the plan.',
    draft: {
      name: 'Daily briefing',
      prompt:
        'Give me a brief for today. Check my connected calendar for today’s meetings and what to prepare, my connected email for anything that needs a reply today, what I worked on in my recent chats, what you remember about my work, and the web for news that bears on it. Lead with the few things that matter most, flag anything time-sensitive, and end with one thing worth doing early while I have focus. If a calendar or email is not connected, say so in one line and brief from the rest. Keep it under 250 words.',
      recurrence: 'weekly',
      daysOfWeek: WEEKDAYS,
      timeOfDay: '08:00',
      sources: { ...MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES, recentChats: true },
    },
  },
  {
    id: 'meeting-prep',
    name: 'Meeting prep',
    cadenceLabel: 'Weekdays at 7:30 AM',
    description: 'Questions and context to walk in with, prepared before the day starts.',
    draft: {
      name: 'Meeting prep',
      prompt:
        'Help me prepare for my meetings today. For each, suggest the questions worth asking, the decisions that need making, and anything I should have read first.',
      recurrence: 'weekly',
      daysOfWeek: WEEKDAYS,
      timeOfDay: '07:30',
    },
  },
  {
    id: 'inbox-triage',
    name: 'Inbox triage',
    cadenceLabel: 'Weekdays at 9:00 AM',
    description: 'Sort what needs a reply from what can wait.',
    draft: {
      name: 'Inbox triage',
      prompt:
        'Help me triage my inbox. Separate what genuinely needs a reply today from what can wait, and draft a one-line response for anything routine.',
      recurrence: 'weekly',
      daysOfWeek: WEEKDAYS,
      timeOfDay: '09:00',
    },
  },
  {
    id: 'content-ideas',
    name: 'Content ideas',
    cadenceLabel: 'Mondays at 10:00 AM',
    description: 'A fresh batch of angles to work from at the start of the week.',
    draft: {
      name: 'Content ideas',
      prompt:
        'Suggest five specific things worth writing about this week, based on what I have been working on. For each, give the angle and who it is for, not just a topic.',
      recurrence: 'weekly',
      daysOfWeek: [1],
      timeOfDay: '10:00',
    },
  },
  {
    id: 'monitor-topic',
    name: 'Monitor a topic',
    cadenceLabel: 'Daily at 7:00 AM',
    description: 'Track a subject over time and hear only what actually changed.',
    draft: {
      name: 'Monitor a topic',
      prompt:
        'Track [replace this with the topic you want followed]. Report only what has genuinely changed since the last run, and say plainly when nothing has.',
      recurrence: 'daily',
      timeOfDay: '07:00',
    },
  },
];
