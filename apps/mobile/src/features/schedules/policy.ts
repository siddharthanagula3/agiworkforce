import type { RecurrenceType } from './store';

export const MOBILE_SUPPORTED_SCHEDULE_RECURRENCES = [
  'once',
  'daily',
  'weekly',
  'monthly',
] as const satisfies readonly RecurrenceType[];

export type MobileSupportedScheduleRecurrence =
  (typeof MOBILE_SUPPORTED_SCHEDULE_RECURRENCES)[number];

const MOBILE_SUPPORTED_RECURRENCE_SET = new Set<string>(MOBILE_SUPPORTED_SCHEDULE_RECURRENCES);

export const CLOUD_SCHEDULE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function describeCloudScheduleSweep(): { cadence: string; window: string } {
  const hours = CLOUD_SCHEDULE_SWEEP_INTERVAL_MS / (60 * 60 * 1000);
  if (hours >= 24) {
    const days = hours / 24;
    return days === 1
      ? { cadence: 'once a day', window: 'daily' }
      : { cadence: `every ${days} days`, window: `${days}-day` };
  }
  return hours === 1
    ? { cadence: 'once an hour', window: 'hourly' }
    : { cadence: `every ${hours} hours`, window: `${hours}-hour` };
}

export const MOBILE_SCHEDULE_CADENCE_NOTE = `Schedules are checked ${describeCloudScheduleSweep().cadence}. The selected time is a preference, and delivery can occur later in the ${describeCloudScheduleSweep().window} Cloud window.`;

export function isMobileScheduleRecurrenceSupported(
  recurrence: unknown,
): recurrence is MobileSupportedScheduleRecurrence {
  return typeof recurrence === 'string' && MOBILE_SUPPORTED_RECURRENCE_SET.has(recurrence);
}

export function assertMobileScheduleRecurrenceSupported(recurrence: unknown): void {
  if (!isMobileScheduleRecurrenceSupported(recurrence)) {
    throw new Error(
      'Mobile schedules support Once, Daily, Weekly, or Monthly. Create interval or custom cron schedules on Web.',
    );
  }
}

export function requestsSubDailySchedule(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return (
    /\bhourly\b/.test(normalized) ||
    /\bevery\s+(?:an?\s+|\d+\s+)?hours?\b/.test(normalized) ||
    /\bevery\s+(?:a\s+|\d+\s+)?minutes?\b/.test(normalized) ||
    /\bevery\s+\d+\s+(?:mins?|hrs?)\b/.test(normalized)
  );
}
