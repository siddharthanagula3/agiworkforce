import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CLOUD_SCHEDULE_SWEEP_INTERVAL_MS,
  describeCloudScheduleSweep,
  isMobileScheduleRecurrenceSupported,
  MOBILE_SCHEDULE_CADENCE_NOTE,
} from '@/src/features/schedules/policy';
import { isoToZonedDateInput, zonedDateAndTimeToIso } from '@/src/features/schedules/timing';
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

/** Values a single cron field selects, for the wildcard, step, list, and range forms Vercel accepts. */
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

/** Firings per day implied by a cron expression. Fields coarser than a day only make it rarer. */
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
    // Mobile has no import path to the web's SWEEP_INTERVAL_MS, so the deployed
    // cron is the pin. Hardcoding "once daily" here is exactly what let the copy
    // keep promising a daily window after the sweep went hourly.
    const perDay = firingsPerDay(deployedSweepSchedule());
    expect(CLOUD_SCHEDULE_SWEEP_INTERVAL_MS).toBe(Math.floor((24 * 60 * 60 * 1000) / perDay));
    expect(MOBILE_SCHEDULE_CADENCE_NOTE).toContain(
      `checked ${describeCloudScheduleSweep().cadence}`,
    );
    expect(MOBILE_SCHEDULE_CADENCE_NOTE).toContain(
      `${describeCloudScheduleSweep().window} Cloud window`,
    );
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
