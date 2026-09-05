import { describe, expect, it } from 'vitest';

import {
  buildCronExpression,
  describeCronCadence,
  getNextExecutionAt,
  parseCronExpression,
  validateTimeZone,
} from './schedule-time';

describe('schedule time calculation', () => {
  it('rejects unknown IANA time zones instead of silently falling back to UTC', () => {
    expect(() => validateTimeZone('America/Not_A_Real_City')).toThrow(/time zone/i);
  });

  it('rejects malformed, out-of-range, and impossible cron expressions', () => {
    expect(() => parseCronExpression('* * *')).toThrow(/five fields/i);
    expect(() => parseCronExpression('60 * * * *')).toThrow(/minute/i);
    expect(() => parseCronExpression('0 9 31 2 *')).toThrow(/never occur/i);
    expect(() => parseCronExpression(`${'1,'.repeat(200)}1 * * * *`)).toThrow(/too long/i);
  });

  it('expands a stepped numeric cron field through the end of its range', () => {
    expect(parseCronExpression('5/10 * * * *').minute.sorted).toEqual([5, 15, 25, 35, 45, 55]);
  });

  it('builds canonical weekly cron from the product form fields', () => {
    expect(
      buildCronExpression({
        recurrence: 'weekly',
        timeOfDay: '08:05',
        daysOfWeek: [5, 1, 5],
      }),
    ).toBe('5 8 * * 1,5');
  });

  it('finds a rare date such as leap day without walking every hour in between', () => {
    const started = Date.now();
    const next = getNextExecutionAt(
      { scheduleType: 'cron', cronExpression: '0 0 29 2 *', timezone: 'UTC' },
      new Date('2026-03-01T00:00:00.000Z'),
    );
    expect(next.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it('still lands on the first allowed hour of the next matching day after a skipped day', () => {
    const next = getNextExecutionAt(
      { scheduleType: 'cron', cronExpression: '15 0 * * 1', timezone: 'America/New_York' },
      new Date('2026-03-07T05:00:00.000Z'),
    );
    expect(next.toISOString()).toBe('2026-03-09T04:15:00.000Z');
  });

  it('skips a nonexistent spring-forward wall time', () => {
    expect(
      getNextExecutionAt(
        {
          scheduleType: 'cron',
          cronExpression: '30 2 * * *',
          timezone: 'America/New_York',
        },
        new Date('2026-03-08T06:59:00.000Z'),
      ).toISOString(),
    ).toBe('2026-03-09T06:30:00.000Z');
  });

  it('does not run the same fall-back wall-clock minute twice', () => {
    expect(
      getNextExecutionAt(
        {
          scheduleType: 'cron',
          cronExpression: '30 1 * * *',
          timezone: 'America/New_York',
        },
        new Date('2026-11-01T05:30:00.000Z'),
      ).toISOString(),
    ).toBe('2026-11-02T06:30:00.000Z');
  });

  it('does not schedule an already-passed wall time in the repeated fall-back hour', () => {
    expect(
      getNextExecutionAt(
        {
          scheduleType: 'cron',
          cronExpression: '45 1 * * *',
          timezone: 'America/New_York',
        },
        new Date('2026-11-01T05:50:00.000Z'),
      ).toISOString(),
    ).toBe('2026-11-02T06:45:00.000Z');
  });

  it('coalesces missed interval occurrences instead of creating a catch-up storm', () => {
    expect(
      getNextExecutionAt(
        {
          scheduleType: 'interval',
          intervalMs: 60_000,
          timezone: 'UTC',
        },
        new Date('2026-07-15T12:00:00.000Z'),
        new Date('2026-07-15T12:05:30.000Z'),
      ).toISOString(),
    ).toBe('2026-07-15T12:06:00.000Z');
  });

  it('rejects one-time schedules that are not in the future', () => {
    expect(() =>
      getNextExecutionAt(
        {
          scheduleType: 'once',
          executeAt: '2026-07-15T11:59:59.000Z',
          timezone: 'UTC',
        },
        new Date('2026-07-15T12:00:00.000Z'),
      ),
    ).toThrow(/future/i);
  });
});

describe('describeCronCadence', () => {
  it('describes a daily cron in words', () => {
    expect(describeCronCadence('0 9 * * *')).toBe('Daily at 9:00 AM');
  });

  it('describes every day of the week spelled out as daily', () => {
    expect(describeCronCadence('0 9 * * 0,1,2,3,4,5,6')).toBe('Daily at 9:00 AM');
  });

  it('describes a single weekly day, matching the leader phrasing', () => {
    expect(describeCronCadence('0 9 * * 1')).toBe('Weekly on Monday at 9:00 AM');
  });

  it('describes multiple weekly days from the product form preset', () => {
    expect(
      describeCronCadence(
        buildCronExpression({ recurrence: 'weekly', timeOfDay: '08:05', daysOfWeek: [5, 1] }),
      ),
    ).toBe('Weekly on Monday and Friday at 8:05 AM');
  });

  it('describes three or more weekly days with a serial comma', () => {
    expect(
      describeCronCadence(
        buildCronExpression({
          recurrence: 'weekly',
          timeOfDay: '07:30',
          daysOfWeek: [1, 2, 3, 4, 5],
        }),
      ),
    ).toBe('Weekly on Monday, Tuesday, Wednesday, Thursday, and Friday at 7:30 AM');
  });

  it('describes a monthly day of month', () => {
    expect(describeCronCadence('0 9 15 * *')).toBe('Monthly on day 15 at 9:00 AM');
  });

  it('formats midnight and noon correctly', () => {
    expect(describeCronCadence('0 0 * * *')).toBe('Daily at 12:00 AM');
    expect(describeCronCadence('0 12 * * *')).toBe('Daily at 12:00 PM');
  });

  it('falls back to the raw expression for shapes it does not describe', () => {
    expect(describeCronCadence('*/15 9 * * *')).toBe('*/15 9 * * *');
    expect(describeCronCadence('0 9,17 * * *')).toBe('0 9,17 * * *');
    expect(describeCronCadence('0 9 * 6 *')).toBe('0 9 * 6 *');
  });

  it('falls back to the raw text for an invalid cron expression', () => {
    expect(describeCronCadence('not a cron')).toBe('not a cron');
  });
});
