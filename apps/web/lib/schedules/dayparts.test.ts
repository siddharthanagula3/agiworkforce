import { describe, expect, it } from 'vitest';

import { DaypartError, isWithinDayparts, nextDaypartStart, normalizeDayparts } from './dayparts';
import { getNextExecutionAt } from './schedule-time';

const businessHours = [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }];

describe('normalizeDayparts', () => {
  it('accepts windows and sorts their days', () => {
    expect(normalizeDayparts([{ days: [5, 1, 1], start: '09:00', end: '12:00' }])).toEqual([
      { days: [1, 5], start: '09:00', end: '12:00' },
    ]);
    expect(normalizeDayparts(null)).toBeNull();
    expect(normalizeDayparts([])).toBeNull();
  });

  it('rejects a window that ends before it starts, bad days and unknown fields', () => {
    expect(() => normalizeDayparts([{ days: [1], start: '17:00', end: '09:00' }])).toThrow(
      DaypartError,
    );
    expect(() => normalizeDayparts([{ days: [7], start: '09:00', end: '10:00' }])).toThrow(
      'from 0 (Sunday) to 6',
    );
    expect(() =>
      normalizeDayparts([{ days: [1], start: '09:00', end: '10:00', timezone: 'UTC' }]),
    ).toThrow('Unknown daypart field');
  });
});

describe('daypart windows', () => {
  it('matches in the schedule time zone with an exclusive end', () => {
    expect(
      isWithinDayparts(new Date('2026-09-17T13:30:00.000Z'), 'America/New_York', businessHours),
    ).toBe(true);
    expect(
      isWithinDayparts(new Date('2026-09-17T21:00:00.000Z'), 'America/New_York', businessHours),
    ).toBe(false);
  });

  it('moves to the next window start, skipping the weekend', () => {
    expect(
      nextDaypartStart(new Date('2026-09-18T22:00:00.000Z'), 'UTC', businessHours)?.toISOString(),
    ).toBe('2026-09-21T09:00:00.000Z');
  });
});

describe('dayparts in the schedule timing', () => {
  it('skips cron occurrences outside every window', () => {
    const next = getNextExecutionAt(
      {
        scheduleType: 'cron',
        cronExpression: '0 */4 * * *',
        timezone: 'UTC',
        dayparts: businessHours,
      },
      new Date('2026-09-18T16:30:00.000Z'),
    );
    expect(next.toISOString()).toBe('2026-09-21T12:00:00.000Z');
  });

  it('holds an interval schedule until the next window opens', () => {
    const next = getNextExecutionAt(
      { scheduleType: 'interval', intervalMs: 3_600_000, timezone: 'UTC', dayparts: businessHours },
      new Date('2026-09-17T16:30:00.000Z'),
    );
    expect(next.toISOString()).toBe('2026-09-18T09:00:00.000Z');
  });

  it('refuses dayparts on a one-time schedule', () => {
    expect(() =>
      getNextExecutionAt(
        {
          scheduleType: 'once',
          executeAt: '2026-10-01T09:00:00.000Z',
          timezone: 'UTC',
          dayparts: businessHours,
        },
        new Date('2026-09-17T00:00:00.000Z'),
      ),
    ).toThrow('recurring');
  });
});
