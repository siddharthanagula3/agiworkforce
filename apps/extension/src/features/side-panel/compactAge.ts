export type CompactAge =
  { unit: 'now' } | { unit: 'minute' | 'hour' | 'day' | 'week'; value: number } | { unit: 'date' };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MAX_WEEKS_SHOWN = 4;

export function compactAge(elapsedMs: number): CompactAge {
  if (elapsedMs < MINUTE_MS) return { unit: 'now' };
  if (elapsedMs < HOUR_MS) return { unit: 'minute', value: Math.floor(elapsedMs / MINUTE_MS) };
  if (elapsedMs < DAY_MS) return { unit: 'hour', value: Math.floor(elapsedMs / HOUR_MS) };
  if (elapsedMs < WEEK_MS) return { unit: 'day', value: Math.floor(elapsedMs / DAY_MS) };
  const weeks = Math.floor(elapsedMs / WEEK_MS);
  if (weeks <= MAX_WEEKS_SHOWN) return { unit: 'week', value: weeks };
  return { unit: 'date' };
}
