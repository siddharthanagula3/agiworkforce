const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_CRON_LENGTH = 256;
const SEARCH_YEARS = 6;
const MAX_SEARCH_STEPS = 50_000;

type CronFieldName = 'minute' | 'hour' | 'day of month' | 'month' | 'day of week';

interface CronField {
  readonly values: ReadonlySet<number>;
  readonly sorted: readonly number[];
  readonly wildcard: boolean;
}

export interface ParsedCronExpression {
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dayOfMonth: CronField;
  readonly month: CronField;
  readonly dayOfWeek: CronField;
}

export interface ScheduleTiming {
  scheduleType: 'cron' | 'once' | 'interval';
  cronExpression?: string | null;
  executeAt?: string | null;
  intervalMs?: number | null;
  timezone: string;
}

export type ProductRecurrence = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom' | 'interval';

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

function parseCronField(
  source: string,
  name: CronFieldName,
  min: number,
  max: number,
  normalize: (value: number) => number = (value) => value,
): CronField {
  const wildcard = source === '*';
  const values = new Set<number>();
  const segments = source.split(',');
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new Error(`Invalid ${name} field`);
  }

  for (const segment of segments) {
    const stepParts = segment.split('/');
    if (stepParts.length > 2) throw new Error(`Invalid ${name} step`);
    const [base = '', stepText] = stepParts;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step <= 0 || step > max - min + 1) {
      throw new Error(`Invalid ${name} step`);
    }

    let start: number;
    let end: number;
    if (base === '*') {
      start = min;
      end = max;
    } else if (/^\d+$/.test(base)) {
      start = Number(base);
      end = stepText === undefined ? start : max;
    } else {
      const match = /^(\d+)-(\d+)$/.exec(base);
      if (!match) throw new Error(`Invalid ${name} field`);
      start = Number(match[1]);
      end = Number(match[2]);
    }

    if (start < min || end > max || start > end) {
      throw new Error(`${name} must be between ${min} and ${max}`);
    }
    for (let value = start; value <= end; value += step) values.add(normalize(value));
  }

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error(`Invalid ${name} field`);
  return { values, sorted, wildcard };
}

function maxDaysInMonth(month: number): number {
  if (month === 2) return 29;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseCronExpression(expression: string): ParsedCronExpression {
  if (expression.length > MAX_CRON_LENGTH) throw new Error('Cron expression is too long');
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Cron expression must contain exactly five fields');

  const parsed: ParsedCronExpression = {
    minute: parseCronField(fields[0]!, 'minute', 0, 59),
    hour: parseCronField(fields[1]!, 'hour', 0, 23),
    dayOfMonth: parseCronField(fields[2]!, 'day of month', 1, 31),
    month: parseCronField(fields[3]!, 'month', 1, 12),
    dayOfWeek: parseCronField(fields[4]!, 'day of week', 0, 7, (value) =>
      value === 7 ? 0 : value,
    ),
  };

  if (!parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) {
    const canOccur = parsed.month.sorted.some((month) =>
      parsed.dayOfMonth.sorted.some((day) => day <= maxDaysInMonth(month)),
    );
    if (!canOccur) throw new Error('Cron expression can never occur');
  }

  return parsed;
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

export function getNextExecutionAt(timing: ScheduleTiming, after: Date, now: Date = after): Date {
  assertFiniteDate(after, 'after');
  assertFiniteDate(now, 'now');
  validateTimeZone(timing.timezone);

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

  const expression = timing.cronExpression?.trim();
  if (!expression) throw new Error('Cron schedule requires cronExpression');
  const searchAfter = after > now ? after : now;
  return nextCronOccurrence(expression, timing.timezone, searchAfter);
}

export const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

const CADENCE_SAMPLE_OCCURRENCES = 8;

function localWallClockMs(parts: LocalDateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function tightestCronGapMs(expression: string, timezone: string, from: Date): number | null {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: validateTimeZone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  let previous = nextCronOccurrence(expression, timezone, from);
  let previousLocal = localParts(formatter, previous);
  let tightest: number | null = null;
  for (let index = 1; index < CADENCE_SAMPLE_OCCURRENCES; index += 1) {
    let next: Date;
    try {
      next = nextCronOccurrence(expression, timezone, previous);
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

const CRON_DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatCronClockTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatCronDayList(days: readonly number[]): string {
  const labels = days.map((day) => CRON_DAY_LABELS[day]!);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/**
 * Renders a cron expression the way the product form's own presets read
 * ("Weekly on Monday at 9:00 AM"), for the shapes `buildCronExpression`
 * itself produces: one minute, one hour, and a wildcard month. Anything
 * outside that, a step, a range, multiple hours, a restricted month, falls
 * back to the raw expression rather than describing it wrong.
 */
export function describeCronCadence(expression: string): string {
  let cron: ParsedCronExpression;
  try {
    cron = parseCronExpression(expression);
  } catch {
    return expression;
  }

  if (cron.minute.sorted.length !== 1 || cron.hour.sorted.length !== 1 || !cron.month.wildcard) {
    return expression;
  }

  const time = formatCronClockTime(cron.hour.sorted[0]!, cron.minute.sorted[0]!);

  if (cron.dayOfMonth.wildcard && cron.dayOfWeek.wildcard) {
    return `Daily at ${time}`;
  }
  if (cron.dayOfMonth.wildcard && cron.dayOfWeek.sorted.length === 7) {
    return `Daily at ${time}`;
  }
  if (cron.dayOfMonth.wildcard) {
    return `Weekly on ${formatCronDayList(cron.dayOfWeek.sorted)} at ${time}`;
  }
  if (cron.dayOfWeek.wildcard && cron.dayOfMonth.sorted.length === 1) {
    return `Monthly on day ${cron.dayOfMonth.sorted[0]} at ${time}`;
  }
  return expression;
}

export function assertDeliverableCadence(timing: ScheduleTiming, now: Date): void {
  if (timing.scheduleType === 'once') return;

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

  const expression = timing.cronExpression?.trim();
  if (!expression) return;
  const gap = tightestCronGapMs(expression, timing.timezone, now);
  if (gap !== null && gap < SWEEP_INTERVAL_MS) {
    throw new Error(
      `Scheduled tasks are swept ${cadence}, so a cron expression cannot fire more often than that`,
    );
  }
}
