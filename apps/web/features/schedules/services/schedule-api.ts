'use client';

import { z } from 'zod';
import {
  MANAGED_CLOUD_SCHEDULES_PATH,
  ManagedCloudScheduleDeleteResponseSchema,
  ManagedCloudScheduleListResponseSchema,
  ManagedCloudScheduleResponseSchema,
  ManagedCloudScheduleRunListResponseSchema,
  ManagedCloudScheduleRunResponseSchema,
  managedCloudSchedulePath,
  managedCloudScheduleRunsPath,
} from '@agiworkforce/cloud-contracts';
import { getCsrfToken as getBrowserCsrfToken } from '@/lib/client/csrf';
import type { ScheduleMutation, ScheduleRun, ScheduleTask } from '../types';

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
  projectId?: string | null;
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
    async listSchedules({ limit, offset, projectId, signal }) {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (projectId) query.set('projectId', projectId);
      const body = await request(
        `${MANAGED_CLOUD_SCHEDULES_PATH}?${query.toString()}`,
        { credentials: 'include', signal },
        ManagedCloudScheduleListResponseSchema,
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
        managedCloudSchedulePath(scheduleId),
        { credentials: 'include', signal },
        ManagedCloudScheduleResponseSchema,
        'Schedule refresh returned an invalid response.',
      );
      return body.schedule as ScheduleTask;
    },

    async createSchedule(payload, signal) {
      const body = await request(
        MANAGED_CLOUD_SCHEDULES_PATH,
        {
          method: 'POST',
          credentials: 'include',
          headers: await mutationHeaders(),
          body: JSON.stringify(payload),
          signal,
        },
        ManagedCloudScheduleResponseSchema,
        'Schedule creation returned an invalid response.',
      );
      return body.schedule as ScheduleTask;
    },

    async updateSchedule(scheduleId, payload, signal) {
      const body = await request(
        managedCloudSchedulePath(scheduleId),
        {
          method: 'PUT',
          credentials: 'include',
          headers: await mutationHeaders(),
          body: JSON.stringify(payload),
          signal,
        },
        ManagedCloudScheduleResponseSchema,
        'Schedule update returned an invalid response.',
      );
      return body.schedule as ScheduleTask;
    },

    async setScheduleEnabled(scheduleId, isActive, signal) {
      const body = await request(
        managedCloudSchedulePath(scheduleId),
        {
          method: 'PATCH',
          credentials: 'include',
          headers: await mutationHeaders(),
          body: JSON.stringify({ isActive }),
          signal,
        },
        ManagedCloudScheduleResponseSchema,
        'Schedule status update returned an invalid response.',
      );
      return body.schedule as ScheduleTask;
    },

    async deleteSchedule(scheduleId, signal) {
      await request(
        managedCloudSchedulePath(scheduleId),
        {
          method: 'DELETE',
          credentials: 'include',
          headers: await mutationHeaders(false),
          signal,
        },
        ManagedCloudScheduleDeleteResponseSchema,
        'Schedule deletion returned an invalid response.',
      );
    },

    async listRuns(scheduleId, { limit, offset, signal }) {
      const body = await request(
        `${managedCloudScheduleRunsPath(scheduleId)}?limit=${limit}&offset=${offset}`,
        { credentials: 'include', signal },
        ManagedCloudScheduleRunListResponseSchema,
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
        managedCloudScheduleRunsPath(scheduleId),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Idempotency-Key': idempotencyKey,
            ...(await mutationHeaders(false)),
          },
          signal,
        },
        ManagedCloudScheduleRunResponseSchema,
        'Manual schedule run returned an invalid response.',
      );
      return { run: body.run as ScheduleRun, replay: body.replay };
    },
  };
}

export const scheduleApi = createScheduleApi();
