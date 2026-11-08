import { validateTimeZone } from './schedule-time';
import { wallClockAt, sameWallClock, type WallClock } from './zoned-time';

function parseLocalInput(value: string): WallClock {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a complete local date and time.');
  const parts: WallClock = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const normalized = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    normalized.getUTCFullYear() !== parts.year ||
    normalized.getUTCMonth() + 1 !== parts.month ||
    normalized.getUTCDate() !== parts.day
  ) {
    throw new Error('Enter a valid local date and time.');
  }
  return parts;
}

export function zonedLocalInputToIso(value: string, timezone: string): string {
  const target = parseLocalInput(value);
  validateTimeZone(timezone);
  const naiveUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const offsets = new Set<number>();

  for (let hours = -48; hours <= 48; hours += 6) {
    const sampleMs = naiveUtc + hours * 60 * 60_000;
    const sample = new Date(sampleMs);
    const local = wallClockAt(sample, timezone);
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    offsets.add(localAsUtc - sampleMs);
  }

  const candidates = [...offsets]
    .map((offset) => new Date(naiveUtc - offset))
    .filter((candidate) => sameWallClock(wallClockAt(candidate, timezone), target))
    .map((candidate) => candidate.toISOString())
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .sort();

  if (candidates.length === 0) {
    throw new Error(
      'This local time does not exist because the clock changes for daylight saving.',
    );
  }
  if (candidates.length > 1) {
    throw new Error('This local time occurs twice because the clock changes for daylight saving.');
  }
  return candidates[0]!;
}

export function isoToZonedLocalInput(value: string | null, timezone: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = wallClockAt(date, validateTimeZone(timezone));
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}
