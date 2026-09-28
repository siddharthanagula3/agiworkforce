import { parseCronExpression, type ParsedCronExpression } from '@agiworkforce/utils/cron';
import { isWithinDayparts, nextDaypartStart, type Daypart } from './dayparts';
import { nextRecurrenceOccurrence, parseRecurrenceRule } from './recurrence-rule';

const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;
const SEARCH_YEARS = 6;
const MAX_SEARCH_STEPS = 50_000;

export interface ScheduleTiming {
  scheduleType: 'cron' | 'once' | 'interval' | 'rrule' | 'event';
  cronExpression?: string | null;
  executeAt?: string | null;
  intervalMs?: number | null;
  recurrenceRule?: string | null;
  dayparts?: readonly Daypart[] | null;
  timezone: string;
}

export type ProductRecurrence =
  'once' | 'daily' | 'weekly' | 'monthly' | 'custom' | 'interval' | 'rrule' | 'event';

export class NoFurtherOccurrenceError extends Error {
  constructor(message = 'Schedule has no further occurrence') {
    super(message);
    this.name = 'NoFurtherOccurrenceError';
  }
}

const MAX_DAYPART_OCCURRENCE_STEPS = 2_000;

export interface CronFormInput {
  recurrence: Exclude<ProductRecurrence, 'once' | 'interval'>;
  timeOfDay?: string;
  daysOfWeek?: readonly number[];
  dayOfMonth?: number | null;
  cronExpression?: string | null;
}

function assertFiniteDate(value: Date, label: string): void {
  if (!Number.isFinite(value.getTime())) throw new Error(`${label} must be a valid timestamp`);
}

export function validateTimeZone(timezone: string): string {
  if (typeof timezone !== 'string' || timezone.length === 0 || timezone.length > 100) {
    throw new Error('A valid IANA time zone is required');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error(`Unknown IANA time zone: ${timezone}`);
  }
  return timezone;
}

function parseTimeOfDay(timeOfDay: string | undefined): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(timeOfDay ?? '');
  if (!match) throw new Error('timeOfDay must use HH:MM format');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('timeOfDay is outside the valid range');
  return { hour, minute };
}

export function buildCronExpression(input: CronFormInput): string {
  if (input.recurrence === 'custom') {
    const cron = input.cronExpression?.trim() ?? '';
    parseCronExpression(cron);
    return cron;
  }

  const { hour, minute } = parseTimeOfDay(input.timeOfDay);
  let cron: string;
  if (input.recurrence === 'daily') {
    cron = `${minute} ${hour} * * *`;
  } else if (input.recurrence === 'weekly') {
    const days = [...new Set(input.daysOfWeek ?? [])].sort((a, b) => a - b);
    if (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error('Weekly schedules require at least one valid day of week');
    }
    cron = `${minute} ${hour} * * ${days.join(',')}`;
  } else {
    const day = input.dayOfMonth;
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error('Monthly schedules require a day of month from 1 to 31');
    }
    cron = `${minute} ${hour} ${day} * *`;
  }
  parseCronExpression(cron);
  return cron;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

function localParts(formatter: Intl.DateTimeFormat, date: Date): LocalDateParts {
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const year = values['year']!;
  const month = values['month']!;
  const day = values['day']!;
  return {
    year,
    month,
    day,
    hour: values['hour']!,
    minute: values['minute']!,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function compareLocalMinute(left: LocalDateParts, right: LocalDateParts): number {
  const leftParts = [left.year, left.month, left.day, left.hour, left.minute];
  const rightParts = [right.year, right.month, right.day, right.hour, right.minute];
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function dateMatches(cron: ParsedCronExpression, parts: LocalDateParts): boolean {
  if (!cron.month.values.has(parts.month)) return false;
  const dom = cron.dayOfMonth.values.has(parts.day);
  const dow = cron.dayOfWeek.values.has(parts.dayOfWeek);
  if (!cron.dayOfMonth.wildcard && !cron.dayOfWeek.wildcard) return dom || dow;
  return dom && dow;
}

function nextAllowedMinuteDelta(current: number, allowed: readonly number[]): number {
  const later = allowed.find((value) => value > current);
  return later === undefined ? 60 - current + allowed[0]! : later - current;
}

function nextCronOccurrence(expression: string, timezone: string, after: Date): Date {
  const cron = parseCronExpression(expression);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: validateTimeZone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const originParts = localParts(formatter, after);
  let candidate = new Date(Math.floor(after.getTime() / 60_000) * 60_000 + 60_000);
  const limit = new Date(candidate);
  limit.setUTCFullYear(limit.getUTCFullYear() + SEARCH_YEARS);

  let steps = 0;
  while (candidate <= limit) {
    if (++steps > MAX_SEARCH_STEPS) break;
    const parts = localParts(formatter, candidate);
    if (!dateMatches(cron, parts)) {
      // Jump toward 22:00 local (never past it) so a DST shift inside the jump cannot
      // overshoot into the next day's first hour; hourly stepping finishes the day.
      const toLateEvening = (22 - parts.hour) * 60 - parts.minute;
      const delta = Math.max(60 - parts.minute || 60, toLateEvening);
      candidate = new Date(candidate.getTime() + delta * 60_000);
      continue;
    }
    if (!cron.hour.values.has(parts.hour)) {
      const delta = 60 - parts.minute || 60;
      candidate = new Date(candidate.getTime() + delta * 60_000);
      continue;
    }

    if (cron.minute.values.has(parts.minute)) {
      if (compareLocalMinute(parts, originParts) > 0) return candidate;
    }
    candidate = new Date(
      candidate.getTime() + nextAllowedMinuteDelta(parts.minute, cron.minute.sorted) * 60_000,
    );
  }

  throw new Error('Cron expression has no occurrence within the supported horizon');
}

function nextRuleOccurrence(timing: ScheduleTiming, after: Date): Date {
  const rule = parseRecurrenceRule(timing.recurrenceRule ?? '', timing.timezone);
  const next = nextRecurrenceOccurrence(rule, timing.timezone, after);
  if (!next) throw new NoFurtherOccurrenceError('Recurrence rule has no further occurrence');
  return next;
}

function baseNextExecutionAt(timing: ScheduleTiming, after: Date, now: Date): Date {
  if (timing.scheduleType === 'event') {
    throw new NoFurtherOccurrenceError('Event-triggered tasks run only when an event fires them');
  }

  if (timing.scheduleType === 'once') {
    const executeAt = new Date(timing.executeAt ?? '');
    assertFiniteDate(executeAt, 'executeAt');
    if (executeAt <= now) throw new Error('One-time schedule must be in the future');
    return executeAt;
  }

  if (timing.scheduleType === 'interval') {
    const intervalMs = timing.intervalMs;
    if (
      typeof intervalMs !== 'number' ||
      !Number.isInteger(intervalMs) ||
      intervalMs < MIN_INTERVAL_MS ||
      intervalMs > MAX_INTERVAL_MS
    ) {
      throw new Error('Interval must be between one minute and 365 days');
    }
    let timestamp = after.getTime() + intervalMs;
    if (timestamp <= now.getTime()) {
      timestamp += (Math.floor((now.getTime() - timestamp) / intervalMs) + 1) * intervalMs;
    }
    return new Date(timestamp);
  }

  const searchAfter = after > now ? after : now;
  if (timing.scheduleType === 'rrule') return nextRuleOccurrence(timing, searchAfter);

  const expression = timing.cronExpression?.trim();
  if (!expression) throw new Error('Cron schedule requires cronExpression');
  return nextCronOccurrence(expression, timing.timezone, searchAfter);
}

export function getNextExecutionAt(timing: ScheduleTiming, after: Date, now: Date = after): Date {
  assertFiniteDate(after, 'after');
  assertFiniteDate(now, 'now');
  validateTimeZone(timing.timezone);

  let candidate = baseNextExecutionAt(timing, after, now);
  const dayparts = timing.dayparts;
  if (!dayparts || dayparts.length === 0) return candidate;
  if (timing.scheduleType === 'once') {
    throw new Error('Dayparts apply only to recurring schedules');
  }

  for (let step = 0; step < MAX_DAYPART_OCCURRENCE_STEPS; step += 1) {
    if (isWithinDayparts(candidate, timing.timezone, dayparts)) return candidate;
    if (timing.scheduleType === 'interval') {
      const start = nextDaypartStart(candidate, timing.timezone, dayparts);
      if (!start) break;
      return start;
    }
    candidate =
      timing.scheduleType === 'rrule'
        ? nextRuleOccurrence(timing, candidate)
        : nextCronOccurrence(timing.cronExpression?.trim() ?? '', timing.timezone, candidate);
  }
  throw new NoFurtherOccurrenceError('No occurrence falls inside the chosen dayparts');
}

export const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

const CADENCE_SAMPLE_OCCURRENCES = 8;

function localWallClockMs(parts: LocalDateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function tightestGapMs(
  nextOccurrence: (after: Date) => Date,
  timezone: string,
  from: Date,
): number | null {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: validateTimeZone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  let previous: Date;
  try {
    previous = nextOccurrence(from);
  } catch (error) {
    if (error instanceof NoFurtherOccurrenceError) return null;
    throw error;
  }
  let previousLocal = localParts(formatter, previous);
  let tightest: number | null = null;
  for (let index = 1; index < CADENCE_SAMPLE_OCCURRENCES; index += 1) {
    let next: Date;
    try {
      next = nextOccurrence(previous);
    } catch {
      break;
    }
    const nextLocal = localParts(formatter, next);
    const gap = localWallClockMs(nextLocal) - localWallClockMs(previousLocal);
    if (tightest === null || gap < tightest) tightest = gap;
    previous = next;
    previousLocal = nextLocal;
  }
  return tightest;
}

export function describeSweepCadence(): { cadence: string; minimum: string } {
  const hours = SWEEP_INTERVAL_MS / (60 * 60 * 1000);
  if (hours < 1) {
    const minutes = SWEEP_INTERVAL_MS / (60 * 1000);
    return minutes === 1
      ? { cadence: 'once a minute', minimum: '1 minute' }
      : { cadence: `every ${minutes} minutes`, minimum: `${minutes} minutes` };
  }
  if (hours >= 24) {
    const days = hours / 24;
    return days === 1
      ? { cadence: 'once a day', minimum: '1 day' }
      : { cadence: `every ${days} days`, minimum: `${days} days` };
  }
  return hours === 1
    ? { cadence: 'once an hour', minimum: '1 hour' }
    : { cadence: `every ${hours} hours`, minimum: `${hours} hours` };
}

export function assertDeliverableCadence(timing: ScheduleTiming, now: Date): void {
  if (timing.scheduleType === 'once' || timing.scheduleType === 'event') return;

  const { cadence, minimum } = describeSweepCadence();

  if (timing.scheduleType === 'interval') {
    const intervalMs = timing.intervalMs;
    if (typeof intervalMs === 'number' && intervalMs < SWEEP_INTERVAL_MS) {
      throw new Error(
        `Scheduled tasks are swept ${cadence}, so the shortest supported interval is ${minimum}`,
      );
    }
    return;
  }

  if (timing.scheduleType === 'rrule') {
    const gap = tightestGapMs((after) => nextRuleOccurrence(timing, after), timing.timezone, now);
    if (gap !== null && gap < SWEEP_INTERVAL_MS) {
      throw new Error(
        `Scheduled tasks are swept ${cadence}, so a recurrence rule cannot fire more often than that`,
      );
    }
    return;
  }

  const expression = timing.cronExpression?.trim();
  if (!expression) return;
  const gap = tightestGapMs(
    (after) => nextCronOccurrence(expression, timing.timezone, after),
    timing.timezone,
    now,
  );
  if (gap !== null && gap < SWEEP_INTERVAL_MS) {
    throw new Error(
      `Scheduled tasks are swept ${cadence}, so a cron expression cannot fire more often than that`,
    );
  }
}
