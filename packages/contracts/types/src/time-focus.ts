/** Cross-surface account settings for optional break and quiet-hours nudges. */

export const TIME_FOCUS_PREFERENCES_NAMESPACE = 'time-focus';
export const BREAK_REMINDER_MINUTES = [30, 60, 120, 240] as const;

export type BreakReminderMinutes = (typeof BREAK_REMINDER_MINUTES)[number];
export type TimeFocusWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface QuietHoursPreferences {
  enabled: boolean;
  /** JavaScript weekday numbers: Sunday = 0 through Saturday = 6. */
  days: readonly TimeFocusWeekday[];
  /** 24-hour clock time in HH:MM form. */
  startTime: string;
  /** 24-hour clock time in HH:MM form. */
  endTime: string;
  /** IANA timezone used when the setting was saved. */
  timezone: string;
}

export interface TimeFocusPreferences {
  breakReminderMinutes: BreakReminderMinutes | null;
  quietHours: QuietHoursPreferences;
}

interface ZonedDateParts {
  dateKey: string;
  weekday: TimeFocusWeekday;
  minuteOfDay: number;
  year: number;
  month: number;
  day: number;
}

const WEEKDAY_BY_LABEL: Record<string, TimeFocusWeekday> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function clockTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * One clock-window evaluator for browser and native notification consumers.
 * Equal endpoints are treated as disabled, never as an implicit 24-hour lock.
 */
export function isMinuteWithinQuietHours(
  minuteOfDay: number,
  startTime: string,
  endTime: string,
): boolean {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 24 * 60) return false;
  const start = clockTimeToMinutes(startTime);
  const end = clockTimeToMinutes(endTime);
  if (start === null || end === null || start === end) return false;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

export function isValidIanaTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts | null {
  if (!Number.isFinite(date.getTime()) || !isValidIanaTimeZone(timezone)) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const weekday = WEEKDAY_BY_LABEL[read('weekday') ?? ''];
  const year = Number(read('year'));
  const month = Number(read('month'));
  const day = Number(read('day'));
  const hour = Number(read('hour'));
  const minute = Number(read('minute'));
  if (
    weekday === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }
  return {
    dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    weekday,
    minuteOfDay: hour * 60 + minute,
    year,
    month,
    day,
  };
}

function previousWeekday(weekday: TimeFocusWeekday): TimeFocusWeekday {
  return ((weekday + 6) % 7) as TimeFocusWeekday;
}

function previousCalendarDateKey(parts: ZonedDateParts): string {
  const previous = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1));
  return previous.toISOString().slice(0, 10);
}

function activeQuietHoursStartDateKey(date: Date, schedule: QuietHoursPreferences): string | null {
  if (!schedule.enabled || schedule.days.length === 0) return null;
  const start = clockTimeToMinutes(schedule.startTime);
  const end = clockTimeToMinutes(schedule.endTime);
  const parts = getZonedDateParts(date, schedule.timezone);
  if (start === null || end === null || start === end || !parts) return null;

  if (start < end) {
    return schedule.days.includes(parts.weekday) &&
      parts.minuteOfDay >= start &&
      parts.minuteOfDay < end
      ? parts.dateKey
      : null;
  }

  if (schedule.days.includes(parts.weekday) && parts.minuteOfDay >= start) return parts.dateKey;
  if (schedule.days.includes(previousWeekday(parts.weekday)) && parts.minuteOfDay < end) {
    return previousCalendarDateKey(parts);
  }
  return null;
}

export function isDateWithinQuietHours(date: Date, schedule: QuietHoursPreferences): boolean {
  return activeQuietHoursStartDateKey(date, schedule) !== null;
}

/** Stable dismissal key for both sides of an overnight quiet-hours window. */
export function getQuietHoursWindowKey(date: Date, schedule: QuietHoursPreferences): string | null {
  const startDateKey = activeQuietHoursStartDateKey(date, schedule);
  return startDateKey
    ? `${startDateKey}|${schedule.timezone}|${schedule.startTime}-${schedule.endTime}`
    : null;
}

export function getDateKeyInTimeZone(date: Date, timezone: string): string | null {
  return getZonedDateParts(date, timezone)?.dateKey ?? null;
}

export function defaultTimeFocusPreferences(timezone = 'UTC'): TimeFocusPreferences {
  const safeTimezone = isValidIanaTimeZone(timezone) ? timezone : 'UTC';
  return {
    breakReminderMinutes: null,
    quietHours: {
      enabled: false,
      days: [],
      startTime: '22:00',
      endTime: '08:00',
      timezone: safeTimezone,
    },
  };
}

/** Runtime-normalizes untrusted account JSON and disables malformed schedules. */
export function normalizeTimeFocusPreferences(
  value: unknown,
  fallbackTimezone = 'UTC',
): TimeFocusPreferences {
  const defaults = defaultTimeFocusPreferences(fallbackTimezone);
  if (!isRecord(value)) return defaults;

  const breakReminderMinutes = BREAK_REMINDER_MINUTES.includes(
    value['breakReminderMinutes'] as BreakReminderMinutes,
  )
    ? (value['breakReminderMinutes'] as BreakReminderMinutes)
    : null;
  const quiet = isRecord(value['quietHours']) ? value['quietHours'] : {};
  const rawDays = Array.isArray(quiet['days']) ? quiet['days'] : [];
  const daysAreValid = rawDays.every(
    (day) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
  );
  const days = Array.isArray(quiet['days'])
    ? ([...new Set(rawDays)]
        .filter(
          (day): day is TimeFocusWeekday =>
            Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
        )
        .sort((a, b) => a - b) as TimeFocusWeekday[])
    : [];
  const startTimeIsValid =
    typeof quiet['startTime'] === 'string' && clockTimeToMinutes(quiet['startTime']) !== null;
  const startTime = startTimeIsValid
    ? (quiet['startTime'] as string)
    : defaults.quietHours.startTime;
  const endTimeIsValid =
    typeof quiet['endTime'] === 'string' && clockTimeToMinutes(quiet['endTime']) !== null;
  const endTime = endTimeIsValid ? (quiet['endTime'] as string) : defaults.quietHours.endTime;
  const timezoneIsValid =
    typeof quiet['timezone'] === 'string' && isValidIanaTimeZone(quiet['timezone']);
  const timezone = timezoneIsValid ? (quiet['timezone'] as string) : defaults.quietHours.timezone;
  const enabled =
    quiet['enabled'] === true &&
    daysAreValid &&
    startTimeIsValid &&
    endTimeIsValid &&
    timezoneIsValid &&
    days.length > 0 &&
    startTime !== endTime;

  return {
    breakReminderMinutes,
    quietHours: { enabled, days, startTime, endTime, timezone },
  };
}
