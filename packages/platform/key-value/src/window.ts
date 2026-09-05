const WINDOW_PATTERN = /^(\d+)\s*(ms|s|m|h|d)$/u;

const MILLISECONDS_PER_UNIT: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
};

const FALLBACK_WINDOW_MS = MILLISECONDS_PER_UNIT['m'] as number;

/**
 * Reads the Upstash duration grammar the rate-limit configuration is already
 * written in, so one window string drives both the Upstash limiter and the
 * in-memory one.
 */
export function parseWindowMilliseconds(window: string): number {
  const match = WINDOW_PATTERN.exec(window.trim());
  if (!match) return FALLBACK_WINDOW_MS;
  const amount = Number.parseInt(match[1] as string, 10);
  const unit = MILLISECONDS_PER_UNIT[match[2] as string];
  return unit === undefined ? FALLBACK_WINDOW_MS : amount * unit;
}
