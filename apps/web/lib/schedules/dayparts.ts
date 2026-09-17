import { wallClockAt, wallClockMs, weekdayOf, zonedWallClockToInstant } from './zoned-time';

export interface Daypart {
  days: number[];
  start: string;
  end: string;
}

export class DaypartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DaypartError';
  }
}

const MAX_DAYPARTS = 7;
const SEARCH_DAYS = 8;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(value: string, label: string): number {
  const match = TIME_RE.exec(value);
  if (!match) throw new DaypartError(`${label} must use HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeDayparts(value: unknown): Daypart[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new DaypartError('Dayparts must be a list of time windows');
  if (value.length === 0) return null;
  if (value.length > MAX_DAYPARTS) {
    throw new DaypartError(`A schedule can have at most ${MAX_DAYPARTS} dayparts`);
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new DaypartError('Each daypart needs days, a start and an end');
    }
    const record = entry as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter(
      (key) => !['days', 'start', 'end'].includes(key),
    );
    if (unknownKeys.length > 0) {
      throw new DaypartError(`Unknown daypart field: ${unknownKeys.join(', ')}`);
    }
    const days = Array.isArray(record['days']) ? record['days'] : null;
    if (
      !days ||
      days.length === 0 ||
      days.some((day) => typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6)
    ) {
      throw new DaypartError(`Daypart ${index + 1} needs at least one day from 0 (Sunday) to 6`);
    }
    const start = String(record['start'] ?? '');
    const end = String(record['end'] ?? '');
    if (minutesOf(start, 'Daypart start') >= minutesOf(end, 'Daypart end')) {
      throw new DaypartError(`Daypart ${index + 1} must end after it starts`);
    }
    return { days: [...new Set(days as number[])].sort((a, b) => a - b), start, end };
  });
}

export function isWithinDayparts(
  instant: Date,
  timezone: string,
  dayparts: readonly Daypart[],
): boolean {
  const wall = wallClockAt(instant, timezone);
  const weekday = weekdayOf(wall.year, wall.month, wall.day);
  const minute = wall.hour * 60 + wall.minute;
  return dayparts.some(
    (part) =>
      part.days.includes(weekday) &&
      minute >= minutesOf(part.start, 'start') &&
      minute < minutesOf(part.end, 'end'),
  );
}

export function nextDaypartStart(
  instant: Date,
  timezone: string,
  dayparts: readonly Daypart[],
): Date | null {
  if (isWithinDayparts(instant, timezone, dayparts)) return instant;
  const wall = wallClockAt(instant, timezone);
  const nowMs = wallClockMs(wall);
  let best: Date | null = null;
  for (let offset = 0; offset < SEARCH_DAYS; offset += 1) {
    const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + offset));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const weekday = weekdayOf(year, month, day);
    for (const part of dayparts) {
      if (!part.days.includes(weekday)) continue;
      const startMinutes = minutesOf(part.start, 'start');
      const candidateWall = {
        year,
        month,
        day,
        hour: Math.floor(startMinutes / 60),
        minute: startMinutes % 60,
      };
      if (wallClockMs(candidateWall) <= nowMs) continue;
      const candidate = zonedWallClockToInstant(candidateWall, timezone);
      if (candidate && (!best || candidate < best)) best = candidate;
    }
    if (best) return best;
  }
  return best;
}
