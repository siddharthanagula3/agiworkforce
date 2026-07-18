import { describe, expect, it } from 'vitest';
import {
  ManagedCloudScheduleListResponseSchema,
  ManagedCloudScheduleRunResponseSchema,
  managedCloudSchedulePath,
  managedCloudScheduleRunsPath,
} from '../schedules';

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
  model: 'auto-balanced',
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
      result: { text: 'Partial result', model: 'auto-balanced' },
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
});
