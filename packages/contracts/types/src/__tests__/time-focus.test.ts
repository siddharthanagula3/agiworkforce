import { describe, expect, it } from 'vitest';
import {
  getQuietHoursWindowKey,
  isDateWithinQuietHours,
  isMinuteWithinQuietHours,
  normalizeTimeFocusPreferences,
  quietHoursEndAt,
  quietHoursRemainingMinutes,
  type QuietHoursPreferences,
} from '../time-focus';

describe('time and focus contract', () => {
  it('evaluates same-day and overnight ranges with one shared clock helper', () => {
    expect(isMinuteWithinQuietHours(9 * 60, '08:00', '10:00')).toBe(true);
    expect(isMinuteWithinQuietHours(10 * 60, '08:00', '10:00')).toBe(false);
    expect(isMinuteWithinQuietHours(23 * 60, '22:00', '08:00')).toBe(true);
    expect(isMinuteWithinQuietHours(2 * 60, '22:00', '08:00')).toBe(true);
    expect(isMinuteWithinQuietHours(12 * 60, '22:00', '08:00')).toBe(false);
    expect(isMinuteWithinQuietHours(12 * 60, 'bad', '08:00')).toBe(false);
    expect(isMinuteWithinQuietHours(12 * 60, '08:00', '08:00')).toBe(false);
  });

  it('applies selected weekdays in the saved IANA timezone, including overnight carryover', () => {
    const schedule = {
      enabled: true,
      days: [1] as const,
      startTime: '22:00',
      endTime: '08:00',
      timezone: 'UTC',
    };

    expect(isDateWithinQuietHours(new Date('2026-07-20T23:00:00.000Z'), schedule)).toBe(true);
    expect(isDateWithinQuietHours(new Date('2026-07-21T02:00:00.000Z'), schedule)).toBe(true);
    expect(isDateWithinQuietHours(new Date('2026-07-21T09:00:00.000Z'), schedule)).toBe(false);
    expect(isDateWithinQuietHours(new Date('2026-07-22T02:00:00.000Z'), schedule)).toBe(false);
  });

  it('uses one stable key for both sides of an overnight quiet-hours window', () => {
    const schedule = {
      enabled: true,
      days: [1] as const,
      startTime: '22:00',
      endTime: '08:00',
      timezone: 'UTC',
    };

    expect(getQuietHoursWindowKey(new Date('2026-07-20T23:00:00.000Z'), schedule)).toBe(
      '2026-07-20|UTC|22:00-08:00',
    );
    expect(getQuietHoursWindowKey(new Date('2026-07-21T02:00:00.000Z'), schedule)).toBe(
      '2026-07-20|UTC|22:00-08:00',
    );
  });

  it('normalizes untrusted account settings and fails closed on invalid schedules', () => {
    expect(
      normalizeTimeFocusPreferences(
        {
          breakReminderMinutes: 60,
          quietHours: {
            enabled: true,
            days: [5, 1, 1],
            startTime: '22:00',
            endTime: '08:00',
            timezone: 'America/Chicago',
          },
        },
        'UTC',
      ),
    ).toEqual({
      breakReminderMinutes: 60,
      quietHours: {
        enabled: true,
        days: [1, 5],
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'America/Chicago',
      },
    });

    expect(
      normalizeTimeFocusPreferences(
        {
          breakReminderMinutes: 999,
          quietHours: {
            enabled: true,
            days: [],
            startTime: '25:00',
            endTime: '25:00',
            timezone: 'Not/AZone',
          },
        },
        'UTC',
      ),
    ).toEqual({
      breakReminderMinutes: null,
      quietHours: {
        enabled: false,
        days: [],
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
      },
    });

    expect(
      normalizeTimeFocusPreferences(
        {
          breakReminderMinutes: 30,
          quietHours: {
            enabled: true,
            days: [1, 9],
            startTime: '22:00',
            endTime: '08:00',
            timezone: 'Not/AZone',
          },
        },
        'UTC',
      ).quietHours.enabled,
    ).toBe(false);
  });
});

describe('quiet-hours release instants', () => {
  const overnight: QuietHoursPreferences = {
    enabled: true,
    days: [6],
    startTime: '22:00',
    endTime: '08:00',
    timezone: 'America/Chicago',
  };

  it.each([
    ['America/Chicago', '2026-03-08T06:30Z', '08:00', '2026-03-08T13:00Z'],
    ['America/Chicago', '2026-11-01T05:30Z', '08:00', '2026-11-01T14:00Z'],
    ['America/New_York', '2026-03-08T05:30Z', '08:00', '2026-03-08T12:00Z'],
    ['Europe/London', '2026-03-29T00:30Z', '08:00', '2026-03-29T07:00Z'],
    ['Europe/London', '2026-10-24T23:30Z', '08:00', '2026-10-25T08:00Z'],
    ['Australia/Lord_Howe', '2026-10-03T14:00Z', '08:00', '2026-10-03T21:00Z'],
    ['Australia/Lord_Howe', '2026-04-04T13:30Z', '08:00', '2026-04-04T21:30Z'],
    ['Australia/Lord_Howe', '2026-10-03T14:00Z', '02:15', '2026-10-03T15:30Z'],
    ['Pacific/Chatham', '2026-09-26T11:45Z', '08:00', '2026-09-26T18:15Z'],
    ['Asia/Kathmandu', '2026-01-03T18:45Z', '08:00', '2026-01-04T02:15Z'],
    ['Pacific/Kiritimati', '2026-01-03T10:30Z', '08:00', '2026-01-03T18:00Z'],
    ['America/Chicago', '2026-03-08T06:30Z', '02:30', '2026-03-08T08:00Z'],
    ['America/Chicago', '2026-11-01T05:30Z', '01:30', '2026-11-01T06:30Z'],
    ['America/Chicago', '2026-11-01T07:10Z', '01:30', '2026-11-01T07:30Z'],
  ])('finds the first eligible instant in %s from %s', (timezone, start, endTime, expected) => {
    const schedule = { ...overnight, timezone, endTime };
    const end = quietHoursEndAt(new Date(start), schedule);
    expect(end?.toISOString()).toBe(new Date(expected).toISOString());
    expect(isDateWithinQuietHours(new Date(start), schedule)).toBe(true);
    expect(isDateWithinQuietHours(new Date(expected), schedule)).toBe(false);
    expect(isDateWithinQuietHours(new Date(new Date(expected).getTime() - 1), schedule)).toBe(true);
  });

  it('reports elapsed minutes and removes the seconds component at release', () => {
    const now = new Date('2026-03-08T06:30:45.123Z');
    const end = new Date('2026-03-08T13:00Z');
    expect(quietHoursEndAt(now, overnight)).toEqual(end);
    expect(quietHoursRemainingMinutes(now, overnight)).toBe(
      (end.getTime() - now.getTime()) / 60_000,
    );
  });

  it.each([
    ['2026-12-31T23:30Z', [4], '08:00', '2027-01-01T08:00Z'],
    ['2028-02-28T23:30Z', [1], '08:00', '2028-02-29T08:00Z'],
    ['2026-11-07T23:59:59.999Z', [6], '00:00', '2026-11-08T00:00Z'],
  ] as const)('crosses the calendar boundary after %s', (now, days, endTime, expected) => {
    expect(
      quietHoursEndAt(new Date(now), { ...overnight, timezone: 'UTC', days, endTime }),
    ).toEqual(new Date(expected));
  });

  it('uses the first allowed minute across a skipped calendar date', () => {
    const now = new Date('2011-12-30T09:00Z');
    const schedule = { ...overnight, timezone: 'Pacific/Apia', days: [4] as const };
    expect(quietHoursEndAt(now, schedule)).toEqual(new Date('2011-12-30T10:00Z'));
    expect(quietHoursEndAt(now, { ...schedule, days: [4, 5] })).toEqual(
      new Date('2011-12-30T18:00Z'),
    );
  });

  it('does not hold the allowed interval between repeated local hours', () => {
    expect(
      quietHoursEndAt(new Date('2026-11-01T06:45Z'), { ...overnight, endTime: '01:30' }),
    ).toBeNull();
  });

  it.each([
    { enabled: false },
    { days: [] },
    { timezone: 'Not/AZone' },
    { startTime: 'invalid' },
    { endTime: '22:00' },
  ])('does not invent a release for an inactive or invalid window %j', (override) => {
    expect(
      quietHoursEndAt(new Date('2026-03-08T06:30Z'), { ...overnight, ...override }),
    ).toBeNull();
  });

  it('rejects an invalid clock instant', () => {
    expect(quietHoursEndAt(new Date(Number.NaN), overnight)).toBeNull();
  });

  it.each(Array.from({ length: 24 }, (_, hour) => hour))(
    'preserves the closed-open interval for every UTC minute in hour %i',
    (hour) => {
      const schedule = { ...overnight, timezone: 'UTC', days: [0, 1, 2, 3, 4, 5, 6] as const };
      for (let minute = 0; minute < 60; minute += 1) {
        const now = new Date(Date.UTC(2026, 10, 7, hour, minute));
        const expected =
          hour < 8
            ? new Date('2026-11-07T08:00Z')
            : hour >= 22
              ? new Date('2026-11-08T08:00Z')
              : null;
        expect(quietHoursEndAt(now, schedule)).toEqual(expected);
      }
    },
  );
});
