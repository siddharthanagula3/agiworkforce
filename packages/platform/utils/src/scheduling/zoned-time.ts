export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

export function wallClockAt(instant: Date, timezone: string): WallClock {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timezone).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values['year']!,
    month: values['month']!,
    day: values['day']!,
    hour: values['hour']!,
    minute: values['minute']!,
  };
}

export function wallClockMs(wall: WallClock): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

export function sameWallClock(left: WallClock, right: WallClock): boolean {
  return wallClockMs(left) === wallClockMs(right);
}

export function zonedWallClockToInstant(wall: WallClock, timezone: string): Date | null {
  const guess = wallClockMs(wall);
  const offsetAt = (instantMs: number) =>
    wallClockMs(wallClockAt(new Date(instantMs), timezone)) - instantMs;
  const first = guess - offsetAt(guess);
  if (sameWallClock(wallClockAt(new Date(first), timezone), wall)) return new Date(first);
  const second = guess - offsetAt(first);
  if (sameWallClock(wallClockAt(new Date(second), timezone), wall)) return new Date(second);
  return null;
}

export function dayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addLocalDays(wall: WallClock, days: number): WallClock {
  const date = new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day + days, wall.hour, wall.minute),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}
