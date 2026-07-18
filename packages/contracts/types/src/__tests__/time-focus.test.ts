import { describe, expect, it } from 'vitest';
import {
  getQuietHoursWindowKey,
  isDateWithinQuietHours,
  isMinuteWithinQuietHours,
  normalizeTimeFocusPreferences,
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
