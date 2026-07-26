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

export const MOBILE_SCHEDULE_CADENCE_NOTE =
  'Schedules are checked once daily. The selected time is a preference, and delivery can occur later in the daily Cloud window.';

export function isMobileScheduleRecurrenceSupported(
  recurrence: unknown,
): recurrence is MobileSupportedScheduleRecurrence {
  return typeof recurrence === 'string' && MOBILE_SUPPORTED_RECURRENCE_SET.has(recurrence);
}

export function assertMobileScheduleRecurrenceSupported(recurrence: unknown): void {
  if (!isMobileScheduleRecurrenceSupported(recurrence)) {
    throw new Error(
      'Mobile schedules support Once, Daily, Weekly, or Monthly while Cloud scheduling is checked once daily.',
    );
  }
}

/**
 * Quick Schedule deliberately refuses sub-daily phrases instead of falling
 * through to its generic “has a time” daily parser and silently changing the
 * requested cadence.
 */
export function requestsSubDailySchedule(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return (
    /\bhourly\b/.test(normalized) ||
    /\bevery\s+(?:an?\s+|\d+\s+)?hours?\b/.test(normalized) ||
    /\bevery\s+(?:a\s+|\d+\s+)?minutes?\b/.test(normalized) ||
    /\bevery\s+\d+\s+(?:mins?|hrs?)\b/.test(normalized)
  );
}
