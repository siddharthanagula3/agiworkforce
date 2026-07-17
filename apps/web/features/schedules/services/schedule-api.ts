'use client';

import { z } from 'zod';
import { getCsrfToken as getBrowserCsrfToken } from '@/lib/client/csrf';
import type { ScheduleMutation, ScheduleRun, ScheduleTask } from '../types';

const nullableRecordSchema = z.record(z.string(), z.unknown()).nullable();

const scheduleTaskSchema = z.object({
  id: z.string(),
  userId: z.string(),
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
  executionCount: z.number().int(),
  actionType: z.enum(['agent', 'workflow', 'notification', 'command']),
  actionConfig: nullableRecordSchema,
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['active', 'paused', 'completed', 'failed', 'expired']),
  lastExecutedAt: z.string().nullable(),
  nextExecutionAt: z.string().nullable(),
  lastError: z.string().nullable(),
  metadata: nullableRecordSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const scheduleRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  status: z.enum(['running', 'success', 'failed', 'timeout', 'cancelled']),
  triggerSource: z.enum(['schedule', 'manual', 'webhook', 'api']),
  scheduledFor: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  result: nullableRecordSchema,
  error: z.string().nullable(),
  idempotencyKey: z.string(),
  leaseExpiresAt: z.string().nullable(),
  attemptCount: z.number().int(),
});

const paginationSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

const listSchedulesSchema = z.object({
  schedules: z.array(scheduleTaskSchema),
  pagination: paginationSchema,
});
const scheduleResponseSchema = z.object({ schedule: scheduleTaskSchema });
const listRunsSchema = z.object({ runs: z.array(scheduleRunSchema), pagination: paginationSchema });
const runResponseSchema = z.object({ run: scheduleRunSchema, replay: z.boolean() });
const deleteResponseSchema = z.object({ success: z.literal(true) });

export class ScheduleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ScheduleApiError';
  }
}

interface ScheduleApiDependencies {
  fetchImpl?: typeof fetch;
  getCsrfToken?: () => Promise<string>;
}

interface PageInput {
  limit: number;
  offset: number;
  signal?: AbortSignal;
}

export interface ScheduleApi {
  listSchedules(input: PageInput): Promise<{
    schedules: ScheduleTask[];
    pagination: { limit: number; offset: number };
    hasMore: boolean;
  }>;
  getSchedule(scheduleId: string, signal?: AbortSignal): Promise<ScheduleTask>;
  createSchedule(payload: ScheduleMutation, signal?: AbortSignal): Promise<ScheduleTask>;
  updateSchedule(
    scheduleId: string,
    payload: ScheduleMutation,
    signal?: AbortSignal,
  ): Promise<ScheduleTask>;
  setScheduleEnabled(
    scheduleId: string,
    isActive: boolean,
    signal?: AbortSignal,
  ): Promise<ScheduleTask>;
  deleteSchedule(scheduleId: string, signal?: AbortSignal): Promise<void>;
  listRuns(
    scheduleId: string,
    input: PageInput,
  ): Promise<{
    runs: ScheduleRun[];
    pagination: { limit: number; offset: number };
    hasMore: boolean;
  }>;
  runNow(
    scheduleId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<{ run: ScheduleRun; replay: boolean }>;
}

function schedulePath(scheduleId: string): string {
  return `/api/schedules/${encodeURIComponent(scheduleId)}`;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiError(body: unknown, status: number): ScheduleApiError {
  const parsed = z
    .object({
      error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
      message: z.string().optional(),
    })
    .safeParse(body);
  const message = parsed.success
    ? (parsed.data.error?.message ?? parsed.data.message ?? `Request failed (${status}).`)
    : `Request failed (${status}).`;
  return new ScheduleApiError(
    message,
    status,
    parsed.success ? parsed.data.error?.code : undefined,
  );
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown, invalidMessage: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ScheduleApiError(invalidMessage, 502, 'INVALID_RESPONSE');
  return parsed.data;
}

export function createScheduleApi(dependencies: ScheduleApiDependencies = {}): ScheduleApi {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const getCsrfToken = dependencies.getCsrfToken ?? getBrowserCsrfToken;

  async function request<T>(
    url: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    invalidMessage: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ScheduleApiError(
        'Could not reach the schedules service. Check your connection and retry.',
        0,
      );
    }
    const body = await responseBody(response);
    if (!response.ok) throw apiError(body, response.status);
    return parseBody(schema, body, invalidMessage);
  }

  async function mutationHeaders(includeJson = true): Promise<Record<string, string>> {
    const csrfToken = await getCsrfToken();
    return {
      ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
      'x-csrf-token': csrfToken,
    };
  }

  return {
    async listSchedules({ limit, offset, signal }) {
      const body = await request(
        `/api/schedules?limit=${limit}&offset=${offset}`,
        { credentials: 'include', signal },
        listSchedulesSchema,
        'Schedules returned an invalid response.',
      );
      return {
        schedules: body.schedules as ScheduleTask[],
        pagination: body.pagination,
        hasMore: body.schedules.length === body.pagination.limit,
      };
    },

    async getSchedule(scheduleId, signal) {
      const body = await request(
        schedulePath(scheduleId),
        { credentials: 'include', signal },
        scheduleResponseSchema,
        'Schedule refresh returned an invalid response.',
      );
      return body.schedule as ScheduleTask;
    },

    async createSchedule(payload, signal) {
      const body = await request(
        '/api/schedules',
        {
          method: 'POST',
          credentials: 'include',
          headers: await mutationHeaders(),
          body: JSON.stringify(payload),
          signal,
        },
        scheduleResponseSchema,
        'Schedule creation returned an invalid response.',
      );
      return body.schedule as ScheduleTask;
    },

    async updateSchedule(scheduleId, payload, signal) {
      const body = await request(
        schedulePath(scheduleId),
        {
          method: 'PUT',
          credentials: 'include',
          headers: await mutationHeaders(),
          body: JSON.stringify(payload),
          signal,
        },
        scheduleResponseSchema,
        'Schedule update returned an invalid response.',
      );
      return body.schedule as ScheduleTask;
    },

    async setScheduleEnabled(scheduleId, isActive, signal) {
      const body = await request(
        schedulePath(scheduleId),
        {
          method: 'PATCH',
          credentials: 'include',
          headers: await mutationHeaders(),
          body: JSON.stringify({ isActive }),
          signal,
        },
        scheduleResponseSchema,
        'Schedule status update returned an invalid response.',
      );
      return body.schedule as ScheduleTask;
    },

    async deleteSchedule(scheduleId, signal) {
      await request(
        schedulePath(scheduleId),
        {
          method: 'DELETE',
          credentials: 'include',
          headers: await mutationHeaders(false),
          signal,
        },
        deleteResponseSchema,
        'Schedule deletion returned an invalid response.',
      );
    },

    async listRuns(scheduleId, { limit, offset, signal }) {
      const body = await request(
        `${schedulePath(scheduleId)}/runs?limit=${limit}&offset=${offset}`,
        { credentials: 'include', signal },
        listRunsSchema,
        'Schedule history returned an invalid response.',
      );
      return {
        runs: body.runs as ScheduleRun[],
        pagination: body.pagination,
        hasMore: body.runs.length === body.pagination.limit,
      };
    },

    async runNow(scheduleId, idempotencyKey, signal) {
      if (!idempotencyKey.trim()) {
        throw new ScheduleApiError('A manual run idempotency key is required.', 400);
      }
      const body = await request(
        `${schedulePath(scheduleId)}/runs`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Idempotency-Key': idempotencyKey,
            ...(await mutationHeaders(false)),
          },
          signal,
        },
        runResponseSchema,
        'Manual schedule run returned an invalid response.',
      );
      return { run: body.run as ScheduleRun, replay: body.replay };
    },
  };
}

export const scheduleApi = createScheduleApi();
