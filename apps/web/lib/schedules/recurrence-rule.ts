import {
  dayNumber,
  daysInMonth,
  wallClockAt,
  wallClockMs,
  weekdayOf,
  zonedWallClockToInstant,
  type WallClock,
} from './zoned-time';

export type RecurrenceFrequency = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface RecurrenceWeekday {
  weekday: number;
  ordinal: number | null;
}

export interface RecurrenceRule {
  freq: RecurrenceFrequency;
  interval: number;
  byDay: RecurrenceWeekday[];
  byMonthDay: number[];
  byMonth: number[];
  byHour: number[];
  byMinute: number[];
  count: number | null;
  until: Date | null;
  start: WallClock;
}

export class RecurrenceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurrenceRuleError';
  }
}

const MAX_RULE_LENGTH = 512;
const MAX_INTERVAL = 366;
const MAX_COUNT = 1_000_000;
const SEARCH_DAYS = 366 * 8;
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const FREQUENCIES: readonly RecurrenceFrequency[] = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'];
const SUPPORTED_PARTS = new Set([
  'FREQ',
  'INTERVAL',
  'BYDAY',
  'BYMONTHDAY',
  'BYMONTH',
  'BYHOUR',
  'BYMINUTE',
  'COUNT',
  'UNTIL',
  'WKST',
]);

function fail(message: string): never {
  throw new RecurrenceRuleError(message);
}

function parseIntegerList(value: string, label: string, min: number, max: number): number[] {
  const values = value.split(',').map((item) => {
    if (!/^[+-]?\d{1,3}$/.test(item)) fail(`${label} must be a comma-separated list of numbers`);
    const parsed = Number(item);
    if (parsed < min || parsed > max || (parsed === 0 && min < 0)) {
      fail(`${label} values must be between ${min} and ${max}`);
    }
    return parsed;
  });
  return [...new Set(values)].sort((left, right) => left - right);
}

function parseDateTime(
  value: string,
  label: string,
  timezone: string,
): { wall: WallClock; utc: boolean } {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!match) fail(`${label} must look like 20260917T090000`);
  const wall: WallClock = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
  };
  if (
    wall.month < 1 ||
    wall.month > 12 ||
    wall.day < 1 ||
    wall.day > daysInMonth(wall.year, wall.month) ||
    wall.hour > 23 ||
    wall.minute > 59
  ) {
    fail(`${label} is not a valid date and time`);
  }
  const utc = match[7] === 'Z';
  if (utc) {
    return { wall: wallClockAt(new Date(wallClockMs(wall)), timezone), utc };
  }
  return { wall, utc };
}

function untilInstant(value: string, timezone: string): Date {
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const { wall } = parseDateTime(value.slice(0, -1), 'UNTIL', 'UTC');
    return new Date(wallClockMs(wall));
  }
  const { wall } = parseDateTime(value, 'UNTIL', timezone);
  const end = /^\d{8}$/.test(value) ? { ...wall, hour: 23, minute: 59 } : wall;
  const instant = zonedWallClockToInstant(end, timezone);
  if (!instant) fail('UNTIL falls in a daylight saving gap');
  return instant;
}

function parseByDay(value: string, freq: RecurrenceFrequency): RecurrenceWeekday[] {
  return value.split(',').map((item) => {
    const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(item);
    if (!match) fail('BYDAY must list weekdays such as MO,WE or 1MO,-1FR');
    const ordinal = match[1] === undefined ? null : Number(match[1]);
    if (ordinal !== null) {
      if (freq !== 'MONTHLY') fail('A numbered BYDAY such as 1MO is only valid with FREQ=MONTHLY');
      if (ordinal === 0 || ordinal < -5 || ordinal > 5)
        fail('BYDAY position must be 1 to 5 or -1 to -5');
    }
    return { weekday: WEEKDAY_CODES.indexOf(match[2] as (typeof WEEKDAY_CODES)[number]), ordinal };
  });
}

export function parseRecurrenceRule(text: string, timezone: string): RecurrenceRule {
  const source = text.trim();
  if (!source) fail('A recurrence rule is required');
  if (source.length > MAX_RULE_LENGTH) fail('Recurrence rule is too long');

  let start: WallClock | null = null;
  let ruleLine: string | null = null;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const dtstart = /^DTSTART(?:;TZID=([^:;]+))?:(.+)$/i.exec(line);
    if (dtstart) {
      if (start) fail('Only one DTSTART is allowed');
      if (dtstart[1] && dtstart[1] !== timezone) {
        fail('DTSTART time zone must match the schedule time zone');
      }
      start = parseDateTime(dtstart[2]!.toUpperCase(), 'DTSTART', timezone).wall;
      continue;
    }
    const rrule = /^(?:RRULE:)?(FREQ=.+)$/i.exec(line);
    if (rrule) {
      if (ruleLine) fail('Only one RRULE is allowed');
      ruleLine = rrule[1]!.toUpperCase();
      continue;
    }
    fail('Only DTSTART and RRULE lines are supported');
  }
  if (!ruleLine) fail('RRULE with FREQ is required');
  if (!start) fail('DTSTART is required');

  const parts = new Map<string, string>();
  for (const segment of ruleLine.split(';')) {
    if (!segment) continue;
    const [key, value] = segment.split('=');
    if (!key || value === undefined || value === '') fail(`Invalid rule part: ${segment}`);
    if (!SUPPORTED_PARTS.has(key)) fail(`${key} is not supported in schedule rules`);
    if (parts.has(key)) fail(`${key} appears more than once`);
    parts.set(key, value);
  }

  const freq = parts.get('FREQ') as RecurrenceFrequency | undefined;
  if (!freq || !FREQUENCIES.includes(freq)) {
    fail('FREQ must be HOURLY, DAILY, WEEKLY or MONTHLY');
  }
  if (parts.has('WKST') && parts.get('WKST') !== 'MO') fail('WKST must be MO');
  if (parts.has('COUNT') && parts.has('UNTIL')) fail('Use COUNT or UNTIL, not both');

  const interval = parts.has('INTERVAL')
    ? parseIntegerList(parts.get('INTERVAL')!, 'INTERVAL', 1, MAX_INTERVAL)
    : [1];
  if (interval.length !== 1) fail('INTERVAL must be a single number');

  let count: number | null = null;
  if (parts.has('COUNT')) {
    const value = parts.get('COUNT')!;
    if (!/^\d{1,7}$/.test(value) || Number(value) < 1 || Number(value) > MAX_COUNT) {
      fail('COUNT must be a positive number');
    }
    count = Number(value);
  }

  const rule: RecurrenceRule = {
    freq,
    interval: interval[0]!,
    byDay: parts.has('BYDAY') ? parseByDay(parts.get('BYDAY')!, freq) : [],
    byMonthDay: parts.has('BYMONTHDAY')
      ? parseIntegerList(parts.get('BYMONTHDAY')!, 'BYMONTHDAY', -31, 31)
      : [],
    byMonth: parts.has('BYMONTH') ? parseIntegerList(parts.get('BYMONTH')!, 'BYMONTH', 1, 12) : [],
    byHour: parts.has('BYHOUR') ? parseIntegerList(parts.get('BYHOUR')!, 'BYHOUR', 0, 23) : [],
    byMinute: parts.has('BYMINUTE')
      ? parseIntegerList(parts.get('BYMINUTE')!, 'BYMINUTE', 0, 59)
      : [],
    count,
    until: parts.has('UNTIL') ? untilInstant(parts.get('UNTIL')!, timezone) : null,
    start,
  };
  if (rule.byMonthDay.length > 0 && freq === 'WEEKLY') {
    fail('BYMONTHDAY cannot be combined with FREQ=WEEKLY');
  }
  return rule;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function formatWall(wall: WallClock): string {
  return `${pad(wall.year, 4)}${pad(wall.month)}${pad(wall.day)}T${pad(wall.hour)}${pad(wall.minute)}00`;
}

function formatUtc(instant: Date): string {
  return `${instant.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

export function formatRecurrenceRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byMonth.length) parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  if (rule.byMonthDay.length) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.byDay.length) {
    parts.push(
      `BYDAY=${rule.byDay.map((day) => `${day.ordinal ?? ''}${WEEKDAY_CODES[day.weekday]}`).join(',')}`,
    );
  }
  if (rule.byHour.length) parts.push(`BYHOUR=${rule.byHour.join(',')}`);
  if (rule.byMinute.length) parts.push(`BYMINUTE=${rule.byMinute.join(',')}`);
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${formatUtc(rule.until)}`);
  return `DTSTART:${formatWall(rule.start)}\nRRULE:${parts.join(';')}`;
}

export function normalizeRecurrenceRule(text: string, timezone: string, now: Date): string {
  const source = text.trim();
  const anchored = /(^|\n)\s*DTSTART/i.test(source)
    ? source
    : `DTSTART:${formatWall(wallClockAt(now, timezone))}\n${source}`;
  return formatRecurrenceRule(parseRecurrenceRule(anchored, timezone));
}

function monthDayMatches(rule: RecurrenceRule, year: number, month: number, day: number): boolean {
  const length = daysInMonth(year, month);
  return rule.byMonthDay.some((value) => (value > 0 ? value : length + value + 1) === day);
}

function weekdayMatches(rule: RecurrenceRule, year: number, month: number, day: number): boolean {
  const weekday = weekdayOf(year, month, day);
  const length = daysInMonth(year, month);
  return rule.byDay.some((entry) => {
    if (entry.weekday !== weekday) return false;
    if (entry.ordinal === null) return true;
    if (entry.ordinal > 0) return Math.ceil(day / 7) === entry.ordinal;
    return -Math.ceil((length - day + 1) / 7) === entry.ordinal;
  });
}

function mondayWeekIndex(value: number): number {
  return Math.floor((value + 3) / 7);
}

function dateMatches(rule: RecurrenceRule, year: number, month: number, day: number): boolean {
  if (rule.byMonth.length > 0 && !rule.byMonth.includes(month)) return false;
  const start = rule.start;
  const today = dayNumber(year, month, day);
  const origin = dayNumber(start.year, start.month, start.day);
  if (today < origin) return false;

  switch (rule.freq) {
    case 'HOURLY':
    case 'DAILY':
      if (rule.freq === 'DAILY' && (today - origin) % rule.interval !== 0) return false;
      if (rule.byDay.length > 0 && !weekdayMatches(rule, year, month, day)) return false;
      if (rule.byMonthDay.length > 0 && !monthDayMatches(rule, year, month, day)) return false;
      return true;
    case 'WEEKLY': {
      if ((mondayWeekIndex(today) - mondayWeekIndex(origin)) % rule.interval !== 0) return false;
      if (rule.byDay.length === 0)
        return weekdayOf(year, month, day) === weekdayOf(start.year, start.month, start.day);
      return weekdayMatches(rule, year, month, day);
    }
    case 'MONTHLY': {
      const months = (year - start.year) * 12 + (month - start.month);
      if (months % rule.interval !== 0) return false;
      if (rule.byMonthDay.length === 0 && rule.byDay.length === 0) return day === start.day;
      if (rule.byMonthDay.length > 0 && !monthDayMatches(rule, year, month, day)) return false;
      if (rule.byDay.length > 0 && !weekdayMatches(rule, year, month, day)) return false;
      return true;
    }
  }
}

function hoursFor(rule: RecurrenceRule, wallDay: WallClock): number[] {
  if (rule.freq !== 'HOURLY') return rule.byHour.length > 0 ? rule.byHour : [rule.start.hour];
  const originHours = wallClockMs({ ...rule.start, minute: 0 }) / 3_600_000;
  const hours: number[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const elapsed = wallClockMs({ ...wallDay, hour, minute: 0 }) / 3_600_000 - originHours;
    if (elapsed < 0 || elapsed % rule.interval !== 0) continue;
    if (rule.byHour.length > 0 && !rule.byHour.includes(hour)) continue;
    hours.push(hour);
  }
  return hours;
}

export function nextRecurrenceOccurrence(
  rule: RecurrenceRule,
  timezone: string,
  after: Date,
): Date | null {
  if (rule.until && rule.until <= after) return null;
  const afterWall = wallClockAt(after, timezone);
  const startMs = wallClockMs(rule.start);
  const firstDay =
    dayNumber(afterWall.year, afterWall.month, afterWall.day) >=
    dayNumber(rule.start.year, rule.start.month, rule.start.day)
      ? afterWall
      : rule.start;
  const minutes = rule.byMinute.length > 0 ? rule.byMinute : [rule.start.minute];

  for (let offset = 0; offset < SEARCH_DAYS; offset += 1) {
    const date = new Date(Date.UTC(firstDay.year, firstDay.month - 1, firstDay.day + offset));
    const wallDay: WallClock = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: 0,
      minute: 0,
    };
    if (!dateMatches(rule, wallDay.year, wallDay.month, wallDay.day)) continue;
    for (const hour of hoursFor(rule, wallDay)) {
      for (const minute of minutes) {
        const wall = { ...wallDay, hour, minute };
        if (wallClockMs(wall) < startMs) continue;
        const instant = zonedWallClockToInstant(wall, timezone);
        if (!instant || instant <= after) continue;
        if (rule.until && instant > rule.until) return null;
        return instant;
      }
    }
  }
  return null;
}

function listWords(values: string[]): string {
  if (values.length <= 1) return values.join('');
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function ordinalWord(value: number): string {
  if (value === -1) return 'last';
  if (value < 0) return `${-value}${ordinalSuffix(-value)} to last`;
  return `${value}${ordinalSuffix(value)}`;
}

function ordinalSuffix(value: number): string {
  if (value % 100 >= 11 && value % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][value % 10] ?? 'th';
}

export function describeRecurrenceRule(text: string, timezone: string): string {
  let rule: RecurrenceRule;
  try {
    rule = parseRecurrenceRule(text, timezone);
  } catch {
    return 'Custom rule';
  }
  const unit = { HOURLY: 'hour', DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' }[rule.freq];
  const every = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  const details: string[] = [];
  if (rule.byDay.length > 0) {
    details.push(
      `on ${listWords(
        rule.byDay.map((day) =>
          day.ordinal === null
            ? WEEKDAY_NAMES[day.weekday]!
            : `the ${ordinalWord(day.ordinal)} ${WEEKDAY_NAMES[day.weekday]}`,
        ),
      )}`,
    );
  }
  if (rule.byMonthDay.length > 0) {
    details.push(
      `on day ${listWords(rule.byMonthDay.map((day) => (day < 0 ? ordinalWord(day) : String(day))))}`,
    );
  }
  if (rule.freq !== 'HOURLY') {
    const hours = rule.byHour.length > 0 ? rule.byHour : [rule.start.hour];
    const minutes = rule.byMinute.length > 0 ? rule.byMinute : [rule.start.minute];
    details.push(
      `at ${listWords(hours.flatMap((hour) => minutes.map((minute) => `${pad(hour)}:${pad(minute)}`)))}`,
    );
  }
  if (rule.count !== null) details.push(`${rule.count} times`);
  return [every, ...details].join(' ');
}
