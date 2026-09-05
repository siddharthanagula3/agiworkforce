import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduleApi, ScheduleApiError } from './schedule-api';
import type { ScheduleMutation, ScheduleRun, ScheduleTask } from '../types';

const schedule: ScheduleTask = {
  id: 'schedule/1',
  userId: 'user-1',
  name: 'Morning brief',
  description: null,
  scheduleType: 'cron',
  cronExpression: '0 9 * * *',
  executeAt: null,
  intervalMs: null,
  timezone: 'UTC',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: null,
  executionCount: 0,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Brief me.',
  model: 'auto-balanced',
  status: 'active',
  lastExecutedAt: null,
  nextExecutionAt: '2026-07-16T09:00:00.000Z',
  lastError: null,
  metadata: { productRecurrence: 'daily', timeOfDay: '09:00' },
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const run: ScheduleRun = {
  id: 'run-1',
  taskId: 'schedule/1',
  status: 'success',
  triggerSource: 'manual',
  scheduledFor: '2026-07-15T12:00:00.000Z',
  startedAt: '2026-07-15T12:00:00.000Z',
  completedAt: '2026-07-15T12:00:01.000Z',
  durationMs: 1_000,
  result: { text: 'Done', model: 'test-model' },
  error: null,
  idempotencyKey: 'manual:request-12345678',
  leaseExpiresAt: null,
  attemptCount: 1,
};

const payload: ScheduleMutation = {
  name: 'Morning brief',
  description: null,
  prompt: 'Brief me.',
  model: 'auto-balanced',
  recurrence: 'daily',
  cronExpression: null,
  scheduledAt: null,
  intervalMs: null,
  timeOfDay: '09:00',
  daysOfWeek: [],
  dayOfMonth: null,
  timezone: 'UTC',
  isActive: true,
  expiresAt: null,
  maxExecutions: null,
  projectId: null,
};

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('schedule API client', () => {
  const fetchImpl = vi.fn<typeof fetch>();
  const getCsrfToken = vi.fn(async () => 'csrf-token');
  const api = createScheduleApi({ fetchImpl: fetchImpl as unknown as typeof fetch, getCsrfToken });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists canonical schedules with bounded pagination metadata', async () => {
    fetchImpl.mockResolvedValueOnce(
      response({ schedules: [schedule], pagination: { limit: 20, offset: 40 } }),
    );

    await expect(api.listSchedules({ limit: 20, offset: 40 })).resolves.toEqual({
      schedules: [schedule],
      pagination: { limit: 20, offset: 40 },
      hasMore: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/schedules?limit=20&offset=40', {
      credentials: 'include',
      signal: undefined,
    });
  });

  it('scopes the list request to a project when one is given', async () => {
    fetchImpl.mockResolvedValueOnce(
      response({ schedules: [], pagination: { limit: 20, offset: 0 } }),
    );

    await api.listSchedules({ limit: 20, offset: 0, projectId: 'project-1' });
    expect(fetchImpl).toHaveBeenCalledWith('/api/schedules?limit=20&offset=0&projectId=project-1', {
      credentials: 'include',
      signal: undefined,
    });
  });

  it('rejects malformed API responses instead of rendering untrusted shapes', async () => {
    fetchImpl.mockResolvedValueOnce(response({ schedules: [{ id: 'partial' }] }));

    await expect(api.listSchedules({ limit: 20, offset: 0 })).rejects.toThrow(
      'Schedules returned an invalid response.',
    );
  });

  it('surfaces the safe nested API error and status for recovery UI', async () => {
    fetchImpl.mockResolvedValueOnce(
      response(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid cron expression' } },
        { status: 400 },
      ),
    );

    await expect(api.createSchedule(payload)).rejects.toMatchObject({
      message: 'Invalid cron expression',
      status: 400,
      code: 'VALIDATION_ERROR',
    } satisfies Partial<ScheduleApiError>);
  });

  it('sends create, edit, pause, and delete through CSRF-protected canonical routes', async () => {
    fetchImpl
      .mockResolvedValueOnce(response({ schedule }, { status: 201 }))
      .mockResolvedValueOnce(response({ schedule }))
      .mockResolvedValueOnce(
        response({ schedule: { ...schedule, isEnabled: false, status: 'paused' } }),
      )
      .mockResolvedValueOnce(response({ success: true }));

    await api.createSchedule(payload);
    await api.updateSchedule(schedule.id, payload);
    await api.setScheduleEnabled(schedule.id, false);
    await api.deleteSchedule(schedule.id);

    expect(getCsrfToken).toHaveBeenCalledTimes(4);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/schedules',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'csrf-token' },
        body: JSON.stringify(payload),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      '/api/schedules/schedule%2F1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(payload) }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      '/api/schedules/schedule%2F1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      '/api/schedules/schedule%2F1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('requires a stable caller idempotency key for manual execution', async () => {
    fetchImpl.mockResolvedValueOnce(response({ run, replay: false }, { status: 201 }));

    await expect(api.runNow(schedule.id, 'request-12345678')).resolves.toEqual({
      run,
      replay: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/schedules/schedule%2F1/runs', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Idempotency-Key': 'request-12345678',
        'x-csrf-token': 'csrf-token',
      },
      signal: undefined,
    });
  });

  it('loads owner-scoped run history with pagination', async () => {
    fetchImpl.mockResolvedValueOnce(
      response({ runs: [run], pagination: { limit: 10, offset: 0 } }),
    );

    await expect(api.listRuns(schedule.id, { limit: 10, offset: 0 })).resolves.toEqual({
      runs: [run],
      pagination: { limit: 10, offset: 0 },
      hasMore: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/schedules/schedule%2F1/runs?limit=10&offset=0', {
      credentials: 'include',
      signal: undefined,
    });
  });

  it('refreshes one canonical schedule after a synchronous manual run', async () => {
    fetchImpl.mockResolvedValueOnce(response({ schedule }));

    await expect(api.getSchedule(schedule.id)).resolves.toEqual(schedule);
    expect(fetchImpl).toHaveBeenCalledWith('/api/schedules/schedule%2F1', {
      credentials: 'include',
      signal: undefined,
    });
  });
});
