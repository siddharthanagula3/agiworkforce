import { describe, expect, it, vi } from 'vitest';
import {
  createManagedCloudSchedulesClient,
  ManagedCloudScheduleListResponseSchema,
  ManagedCloudScheduleMutationSchema,
  ManagedCloudScheduleRunResponseSchema,
  ManagedCloudScheduleTaskSchema,
  managedCloudSchedulePath,
  managedCloudScheduleRunsPath,
} from '../schedules';
import { MANAGED_CLOUD_DEFAULT_MODEL_SELECTION } from '../conversations';

const schedule = {
  id: 'schedule-1',
  userId: 'user-1',
  name: 'Morning brief',
  description: null,
  scheduleType: 'cron',
  cronExpression: '0 9 * * 1-5',
  executeAt: null,
  intervalMs: null,
  timezone: 'America/Chicago',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: null,
  executionCount: 3,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Summarize my priorities.',
  model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  status: 'active',
  lastExecutedAt: '2026-07-17T14:00:00.000Z',
  nextExecutionAt: '2026-07-18T14:00:00.000Z',
  lastError: null,
  metadata: {
    productRecurrence: 'weekly',
    timeOfDay: '09:00',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  createdAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-17T14:00:01.000Z',
};

describe('managed cloud schedule wire contracts', () => {
  it('parses canonical schedule lists and rejects incomplete tasks', () => {
    expect(
      ManagedCloudScheduleListResponseSchema.parse({
        schedules: [schedule],
        pagination: { limit: 50, offset: 0 },
      }).schedules[0],
    ).toEqual(schedule);

    expect(() =>
      ManagedCloudScheduleListResponseSchema.parse({
        schedules: [{ ...schedule, prompt: undefined }],
        pagination: { limit: 50, offset: 0 },
      }),
    ).toThrow();
  });

  it('preserves terminal run statuses and structured results', () => {
    const run = {
      id: 'run-1',
      taskId: schedule.id,
      status: 'timeout',
      triggerSource: 'manual',
      scheduledFor: null,
      startedAt: '2026-07-17T14:00:00.000Z',
      completedAt: '2026-07-17T14:00:40.000Z',
      durationMs: 40_000,
      result: { text: 'Partial result', model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION },
      error: 'Execution timed out',
      idempotencyKey: 'request-12345678',
      leaseExpiresAt: null,
      attemptCount: 1,
    };

    expect(ManagedCloudScheduleRunResponseSchema.parse({ run, replay: false })).toEqual({
      run,
      replay: false,
    });
  });

  it('encodes schedule identifiers in canonical paths', () => {
    expect(managedCloudSchedulePath('schedule/1')).toBe('/api/schedules/schedule%2F1');
    expect(managedCloudScheduleRunsPath('schedule/1')).toBe('/api/schedules/schedule%2F1/runs');
  });

  it('accepts a schedule with no project scope and one bound to a project', () => {
    expect(ManagedCloudScheduleTaskSchema.parse(schedule).projectId).toBeUndefined();
    expect(
      ManagedCloudScheduleTaskSchema.parse({ ...schedule, projectId: 'project-1' }).projectId,
    ).toBe('project-1');
    expect(
      ManagedCloudScheduleTaskSchema.parse({ ...schedule, projectId: null }).projectId,
    ).toBeNull();
  });

  it('accepts a create/update mutation with an omitted, null or set project scope', () => {
    const base = {
      name: 'Morning brief',
      description: null,
      prompt: 'Summarize my priorities.',
      model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
      recurrence: 'weekly' as const,
      cronExpression: null,
      scheduledAt: null,
      intervalMs: null,
      timeOfDay: '09:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      dayOfMonth: null,
      timezone: 'America/Chicago',
      isActive: true,
      expiresAt: null,
      maxExecutions: null,
    };
    expect(ManagedCloudScheduleMutationSchema.parse(base).projectId).toBeUndefined();
    expect(
      ManagedCloudScheduleMutationSchema.parse({ ...base, projectId: null }).projectId,
    ).toBeNull();
    expect(
      ManagedCloudScheduleMutationSchema.parse({ ...base, projectId: 'project-1' }).projectId,
    ).toBe('project-1');
  });
});

describe('managed cloud schedules client', () => {
  it('validates mutation payloads and preserves host authentication headers', async () => {
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer desktop-token');
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      return new Response(JSON.stringify({ schedule }), { status: 201 });
    });
    const client = createManagedCloudSchedulesClient({
      baseUrl: 'https://agi.example/',
      fetchImpl,
      getHeaders: () => ({ Authorization: 'Bearer desktop-token' }),
    });

    await expect(
      client.createSchedule({
        name: 'Morning brief',
        description: null,
        prompt: 'Summarize my priorities.',
        model: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
        recurrence: 'weekly',
        cronExpression: null,
        scheduledAt: null,
        intervalMs: null,
        timeOfDay: '09:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        dayOfMonth: null,
        timezone: 'America/Chicago',
        isActive: true,
        expiresAt: null,
        maxExecutions: null,
      }),
    ).resolves.toEqual(schedule);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://agi.example/api/schedules',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('requires an idempotency key before dispatching a manual run', async () => {
    const fetchImpl = vi.fn();
    const client = createManagedCloudSchedulesClient({ fetchImpl });

    await expect(client.runNow('schedule-1', '   ')).rejects.toThrow(/idempotency key/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('carries a project scope through to the list request query string', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ schedules: [], pagination: { limit: 50, offset: 0 } })),
    );
    const client = createManagedCloudSchedulesClient({
      baseUrl: 'https://agi.example/',
      fetchImpl,
    });

    await client.listSchedules({ limit: 50, offset: 0, projectId: 'project-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://agi.example/api/schedules?limit=50&offset=0&projectId=project-1',
      expect.anything(),
    );

    await client.listSchedules({ limit: 50, offset: 0 });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'https://agi.example/api/schedules?limit=50&offset=0',
      expect.anything(),
    );
  });
});
