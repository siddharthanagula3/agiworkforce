import {
  isMobileScheduleRecurrenceSupported,
  MOBILE_SCHEDULE_CADENCE_NOTE,
} from '@/src/features/schedules/policy';
import { isoToZonedDateInput, zonedDateAndTimeToIso } from '@/src/features/schedules/timing';
import { parseNaturalLanguage } from '@/src/features/schedules/components/QuickSchedule';

describe('Mobile schedule policy', () => {
  it('only offers cadences the daily Cloud runner can service honestly', () => {
    expect(['once', 'daily', 'weekly', 'monthly'].every(isMobileScheduleRecurrenceSupported)).toBe(
      true,
    );
    expect(isMobileScheduleRecurrenceSupported('custom')).toBe(false);
    expect(isMobileScheduleRecurrenceSupported('interval')).toBe(false);
    expect(MOBILE_SCHEDULE_CADENCE_NOTE).toContain('checked once daily');
  });

  it.each(['hourly', 'every hour at 9am', 'every 15 minutes', 'every 2 hours at 9am'])(
    'does not reinterpret unsupported sub-daily phrase %j as a daily task',
    (phrase) => {
      expect(parseNaturalLanguage(phrase)).toBeNull();
    },
  );
});

describe('Mobile one-time schedule timing', () => {
  it('converts the displayed wall-clock date and time in the selected timezone', () => {
    expect(zonedDateAndTimeToIso('2026-07-15', '09:30', 'America/New_York')).toBe(
      '2026-07-15T13:30:00.000Z',
    );
    expect(isoToZonedDateInput('2026-07-15T13:30:00.000Z', 'America/New_York')).toBe('2026-07-15');
  });

  it('rejects wall-clock times that do not exist or occur twice at DST boundaries', () => {
    expect(() => zonedDateAndTimeToIso('2026-03-08', '02:30', 'America/New_York')).toThrow(
      'does not exist',
    );
    expect(() => zonedDateAndTimeToIso('2026-11-01', '01:30', 'America/New_York')).toThrow(
      'occurs twice',
    );
  });

  it('rejects invalid dates, times, and IANA timezones', () => {
    expect(() => zonedDateAndTimeToIso('2026-02-30', '09:00', 'UTC')).toThrow(
      'valid date and time',
    );
    expect(() => zonedDateAndTimeToIso('2026-02-20', '24:00', 'UTC')).toThrow(
      'valid date and time',
    );
    expect(() => zonedDateAndTimeToIso('2026-02-20', '09:00', 'Moon/Base')).toThrow(
      'valid IANA timezone',
    );
  });
});
