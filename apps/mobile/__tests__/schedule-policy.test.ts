import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CLOUD_SCHEDULE_SWEEP_INTERVAL_MS,
  describeCloudScheduleSweep,
  isMobileScheduleRecurrenceSupported,
  MOBILE_SCHEDULE_CADENCE_NOTE,
} from '@/src/features/schedules/policy';
import {
  isoToZonedDateInput,
  scheduleTimingProblem,
  zonedDateAndTimeToIso,
} from '@/src/features/schedules/timing';
import { parseNaturalLanguage } from '@/src/features/schedules/components/QuickSchedule';

const SWEEP_ROUTE = '/api/cron/run-schedules';

function deployedSweepSchedule(): string {
  const vercelConfig = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../vercel.json'), 'utf8'),
  ) as { crons?: { path: string; schedule: string }[] };
  const entry = vercelConfig.crons?.find((cron) => cron.path === SWEEP_ROUTE);
  if (!entry) throw new Error(`vercel.json has no cron entry for ${SWEEP_ROUTE}`);
  return entry.schedule;
}

function fieldValueCount(field: string, span: number): number {
  const selected = new Set<number>();
  for (const part of field.split(',')) {
    const [range, step] = part.split('/');
    const stride = step ? Number(step) : 1;
    let start = 0;
    let end = span - 1;
    if (range && range !== '*') {
      const [from, to] = range.split('-');
      start = Number(from);
      end = to === undefined ? start : Number(to);
    }
    for (let value = start; value <= end; value += stride) selected.add(value);
  }
  return selected.size;
}

function firingsPerDay(expression: string): number {
  const [minute, hour] = expression.trim().split(/\s+/);
  return fieldValueCount(minute!, 60) * fieldValueCount(hour!, 24);
}

describe('Mobile schedule policy', () => {
  it('only offers cadences the Mobile editor can express honestly', () => {
    expect(['once', 'daily', 'weekly', 'monthly'].every(isMobileScheduleRecurrenceSupported)).toBe(
      true,
    );
    expect(isMobileScheduleRecurrenceSupported('custom')).toBe(false);
    expect(isMobileScheduleRecurrenceSupported('interval')).toBe(false);
  });

  it('states the sweep cadence actually deployed in vercel.json', () => {
    const perDay = firingsPerDay(deployedSweepSchedule());
    expect(CLOUD_SCHEDULE_SWEEP_INTERVAL_MS).toBe(Math.floor((24 * 60 * 60 * 1000) / perDay));
    expect(MOBILE_SCHEDULE_CADENCE_NOTE).toContain(
      `checked ${describeCloudScheduleSweep().cadence}`,
    );
    expect(MOBILE_SCHEDULE_CADENCE_NOTE).toContain(
      `${describeCloudScheduleSweep().window} Cloud window`,
    );
  });

  it('renders the deployed sweep in whole units instead of a fractional hour', () => {
    const sweepMinutes = Math.floor((24 * 60) / firingsPerDay(deployedSweepSchedule()));
    const { cadence, window } = describeCloudScheduleSweep();
    expect(cadence).toMatch(/^(once a (minute|hour|day)|every \d+ (minutes|hours|days))$/);
    expect(window).toMatch(/^(\d+-(minute|hour|day)|hourly|daily)$/);
    if (sweepMinutes < 60) {
      expect(cadence).toBe(`every ${sweepMinutes} minutes`);
      expect(window).toBe(`${sweepMinutes}-minute`);
    }
  });

  it.each(['hourly', 'every hour at 9am', 'every 15 minutes', 'every 2 hours at 9am'])(
    'does not reinterpret unsupported sub-daily phrase %j as a daily task',
    (phrase) => {
      expect(parseNaturalLanguage(phrase)).toBeNull();
    },
  );

  it.each([
    ['Every Saturday at 6pm', [6], '18:00'],
    ['Saturdays at 6pm', [6], '18:00'],
    ['Every Sat at 6:30pm', [6], '18:30'],
    ['Every Sunday at 6pm', [0], '18:00'],
    ['Every Saturday @ noon', [6], '12:00'],
    ['Every Saturday at midnight', [6], '00:00'],
    ['Check inventory at the depot, Saturdays at 7am', [6], '07:00'],
  ])('reads the clock in %j rather than the letters inside a weekday', (phrase, days, time) => {
    expect(parseNaturalLanguage(phrase)).toMatchObject({
      recurrence: 'weekly',
      daysOfWeek: days,
      timeOfDay: time,
    });
  });

  it('defaults to 09:00 only when no clock was given', () => {
    expect(parseNaturalLanguage('Every Saturday')).toMatchObject({
      daysOfWeek: [6],
      timeOfDay: '09:00',
    });
  });

  it.each(['Every Saturday at lunch', 'Every day at the office', 'Saturdays at 25'])(
    'rejects %j instead of replacing a clock it cannot read with the default',
    (phrase) => {
      expect(parseNaturalLanguage(phrase)).toBeNull();
    },
  );
});

describe('Quick Schedule one-time dates', () => {
  const at = { now: new Date('2026-11-15T12:00:00.000Z'), timezone: 'UTC' };

  it.each([
    ['January 5 2031 at 9am', '2031-01-05', '09:00', 'Once on Jan 5, 2031 at 09:00'],
    ['Jan 5th, 2031 at 6:30pm', '2031-01-05', '18:30', 'Once on Jan 5, 2031 at 18:30'],
    ['5 March 2031 9am', '2031-03-05', '09:00', 'Once on Mar 5, 2031 at 09:00'],
    ['Pay rent on 2031-01-05 at 8am', '2031-01-05', '08:00', 'Once on Jan 5, 2031 at 08:00'],
    ['January 5 at 9am', '2027-01-05', '09:00', 'Once on Jan 5, 2027 at 09:00'],
    ['December 24 at 7pm', '2026-12-24', '19:00', 'Once on Dec 24, 2026 at 19:00'],
    ['tomorrow at 8am', '2026-11-16', '08:00', 'Once on Nov 16, 2026 at 08:00'],
  ])('reads %j as a one-time schedule', (phrase, date, time, description) => {
    expect(parseNaturalLanguage(phrase, at)).toEqual({
      recurrence: 'once',
      scheduledDate: date,
      timeOfDay: time,
      description,
    });
  });

  it.each([
    'February 30 2031 at 9am',
    '1/5/2031 at 9am',
    'next Friday at 9am',
    'every January 5 at 9am',
    'once at 9am',
    'Summarize my inbox at 8am',
  ])('says it cannot read %j instead of turning it into a repeating schedule', (phrase) => {
    expect(parseNaturalLanguage(phrase, at)).toBeNull();
  });

  it('keeps a bare clock and an explicit cadence as daily', () => {
    expect(parseNaturalLanguage('at 9am', at)).toMatchObject({ recurrence: 'daily' });
    expect(parseNaturalLanguage('Every day at 9am', at)).toMatchObject({
      recurrence: 'daily',
      timeOfDay: '09:00',
    });
  });
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

  it('shows each known timing problem as its own sentence', () => {
    const problem = (date: string, time: string, timezone: string) => {
      try {
        zonedDateAndTimeToIso(date, time, timezone);
      } catch (error) {
        return scheduleTimingProblem(error);
      }
      return null;
    };
    expect(problem('2026-03-08', '02:30', 'America/New_York')).toBe(
      'This local time does not exist because the clock changes for daylight saving.',
    );
    expect(problem('2026-11-01', '01:30', 'America/New_York')).toBe(
      'This local time occurs twice because the clock changes for daylight saving.',
    );
    expect(problem('2026-02-30', '09:00', 'UTC')).toBe('Enter a valid date and time.');
    expect(problem('2026-02-20', '09:00', 'Moon/Base')).toBe(
      'Enter a valid IANA timezone, such as America/Chicago.',
    );
  });

  it('never lets a foreign error or thrown value reach the screen', () => {
    expect(scheduleTimingProblem(new RangeError('Invalid time zone specified: Moon/Base'))).toBe(
      'Enter a valid date and time.',
    );
    expect(scheduleTimingProblem(new Error('Unexpected token < in JSON'))).toBe(
      'Enter a valid date and time.',
    );
    expect(
      scheduleTimingProblem(
        'This local time occurs twice because the clock changes for daylight saving.',
      ),
    ).toBe('Enter a valid date and time.');
    expect(scheduleTimingProblem(undefined)).toBe('Enter a valid date and time.');
  });
});
