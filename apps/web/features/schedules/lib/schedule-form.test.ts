import { describe, expect, it } from 'vitest';
import { getAutoRoutingProfiles, getCoreManualModelOptions } from '@agiworkforce/types';
import { describeSweepCadence } from '@/lib/schedules/schedule-time';
import {
  INITIAL_SCHEDULE_DRAFT,
  isoToZonedLocalInput,
  scheduleToDraft,
  validateAndBuildScheduleRequest,
  zonedLocalInputToIso,
} from './schedule-form';
import type { ScheduleTask } from '../types';
import { AVAILABLE_MODELS } from '../types';

function draft(overrides: Partial<typeof INITIAL_SCHEDULE_DRAFT> = {}) {
  return {
    ...INITIAL_SCHEDULE_DRAFT,
    name: 'Morning brief',
    prompt: 'Summarize the three most important priorities for today.',
    timezone: 'America/Chicago',
    ...overrides,
  };
}

function task(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id: 'schedule-1',
    userId: 'user-1',
    name: 'Morning brief',
    description: null,
    scheduleType: 'cron',
    cronExpression: '30 9 * * 1-5',
    executeAt: null,
    intervalMs: null,
    timezone: 'America/Chicago',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 2,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Summarize my priorities.',
    model: 'auto-balanced',
    status: 'active',
    lastExecutedAt: '2026-07-14T14:30:00.000Z',
    nextExecutionAt: '2026-07-15T14:30:00.000Z',
    lastError: null,
    metadata: {
      productRecurrence: 'weekly',
      timeOfDay: '09:30',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-14T14:30:00.000Z',
    ...overrides,
  };
}

describe('schedule form contract', () => {
  it('derives every picker entry from the canonical auto profiles and current model registry', () => {
    expect(AVAILABLE_MODELS).toEqual([
      ...getAutoRoutingProfiles().map((profile) => ({
        value: profile.id,
        label: profile.label,
      })),
      ...getCoreManualModelOptions().map((model) => ({
        value: model.id,
        label: model.label,
      })),
    ]);
  });

  it('builds the exact supported recurring payload without notification claims', () => {
    const result = validateAndBuildScheduleRequest(
      draft({
        description: 'A useful weekday summary',
        recurrence: 'weekly',
        timeOfDay: '09:30',
        daysOfWeek: [1, 3, 5],
        maxExecutions: '20',
      }),
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(result).toEqual({
      ok: true,
      payload: {
        name: 'Morning brief',
        description: 'A useful weekday summary',
        prompt: 'Summarize the three most important priorities for today.',
        model: 'auto',
        recurrence: 'weekly',
        cronExpression: null,
        scheduledAt: null,
        intervalMs: null,
        timeOfDay: '09:30',
        daysOfWeek: [1, 3, 5],
        dayOfMonth: null,
        timezone: 'America/Chicago',
        isActive: true,
        expiresAt: null,
        maxExecutions: 20,
      },
    });
    expect(JSON.stringify(result)).not.toContain('notification');
  });

  it('converts a one-time wall clock value in its selected IANA timezone to UTC', () => {
    expect(zonedLocalInputToIso('2026-07-15T09:30', 'America/New_York')).toBe(
      '2026-07-15T13:30:00.000Z',
    );
  });

  it('rejects a wall clock time skipped by the spring DST transition', () => {
    expect(() => zonedLocalInputToIso('2026-03-08T02:30', 'America/New_York')).toThrow(
      'does not exist',
    );
  });

  it('rejects an ambiguous wall clock time during the fall DST transition', () => {
    expect(() => zonedLocalInputToIso('2026-11-01T01:30', 'America/New_York')).toThrow(
      'occurs twice',
    );
  });

  it('reports field-level validation errors instead of sending invalid schedule input', () => {
    const result = validateAndBuildScheduleRequest(
      draft({
        name: ' ',
        recurrence: 'weekly',
        daysOfWeek: [],
        timezone: 'Not/A_Timezone',
      }),
      new Date('2026-07-15T12:00:00.000Z'),
    );

    expect(result).toEqual({
      ok: false,
      errors: expect.objectContaining({
        name: 'Enter a schedule name.',
        daysOfWeek: 'Select at least one day.',
        timezone: 'Enter a valid IANA time zone.',
      }),
    });
  });

  it('builds bounded interval input and rejects intervals outside server limits', () => {
    expect(
      validateAndBuildScheduleRequest(
        draft({ recurrence: 'interval', intervalValue: '3', intervalUnit: 'days' }),
        new Date('2026-07-15T12:00:00.000Z'),
      ),
    ).toMatchObject({ ok: true, payload: { intervalMs: 259_200_000 } });

    expect(
      validateAndBuildScheduleRequest(
        draft({ recurrence: 'interval', intervalValue: '0', intervalUnit: 'minutes' }),
        new Date('2026-07-15T12:00:00.000Z'),
      ),
    ).toEqual({
      ok: false,
      errors: expect.objectContaining({
        intervalValue: `Use an interval from ${describeSweepCadence().minimum} to 365 days.`,
      }),
    });
  });

  it('allows an unchanged legacy interval through an unrelated edit but rejects a new one', () => {
    const legacyDraft = draft({
      name: 'Renamed legacy task',
      recurrence: 'interval',
      intervalValue: '1',
      intervalUnit: 'hours',
    });

    expect(
      validateAndBuildScheduleRequest(legacyDraft, new Date('2026-07-15T12:00:00.000Z'), {
        existingIntervalMs: 60 * 60_000,
      }),
    ).toMatchObject({
      ok: true,
      payload: { name: 'Renamed legacy task', intervalMs: 60 * 60_000 },
    });

    expect(
      validateAndBuildScheduleRequest(
        { ...legacyDraft, intervalValue: '2' },
        new Date('2026-07-15T12:00:00.000Z'),
        { existingIntervalMs: 60 * 60_000 },
      ),
    ).toMatchObject({
      ok: false,
      errors: { intervalValue: expect.stringContaining(describeSweepCadence().minimum) },
    });
  });

  // The sweep that runs due tasks currently fires daily, so anything finer is
  // an availability the platform does not have. The client refuses it here so
  // the user is not promised a cadence the deployed trigger cannot serve.
  it('refuses a cadence finer than the deployed sweep, on both interval and cron', () => {
    expect(
      validateAndBuildScheduleRequest(
        draft({ recurrence: 'interval', intervalValue: '5', intervalUnit: 'minutes' }),
        new Date('2026-07-15T12:00:00.000Z'),
      ),
    ).toEqual({
      ok: false,
      errors: expect.objectContaining({
        intervalValue: `Use an interval from ${describeSweepCadence().minimum} to 365 days.`,
      }),
    });

    expect(
      validateAndBuildScheduleRequest(
        draft({ recurrence: 'custom', cronExpression: '*/5 * * * *' }),
        new Date('2026-07-15T12:00:00.000Z'),
      ),
    ).toMatchObject({
      ok: false,
      errors: expect.objectContaining({
        cronExpression: expect.stringContaining('cannot fire more often'),
      }),
    });

    expect(
      validateAndBuildScheduleRequest(
        draft({ recurrence: 'custom', cronExpression: '30 9 * * *' }),
        new Date('2026-07-15T12:00:00.000Z'),
      ),
    ).toMatchObject({ ok: true });
  });

  it('round-trips canonical task metadata into an editable draft', () => {
    expect(scheduleToDraft(task())).toMatchObject({
      name: 'Morning brief',
      prompt: 'Summarize my priorities.',
      recurrence: 'weekly',
      timeOfDay: '09:30',
      daysOfWeek: [1, 2, 3, 4, 5],
      timezone: 'America/Chicago',
      isActive: true,
    });
  });

  it('formats persisted UTC timestamps back into the selected wall clock timezone', () => {
    expect(isoToZonedLocalInput('2026-07-15T13:30:00.000Z', 'America/New_York')).toBe(
      '2026-07-15T09:30',
    );
  });
});
