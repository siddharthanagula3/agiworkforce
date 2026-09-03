import { describe, expect, it } from 'vitest';

import { formatUsageResetIn } from '../usage-vocabulary';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-08-21T12:00:00.000Z');

function inMs(ms: number): string | null {
  return formatUsageResetIn(new Date(NOW + ms).toISOString(), NOW);
}

// This string is what a person reads when deciding whether to wait for a quota
// window or stop working. It appears in Settings > Usage and in the chat limit
// banner, and had no test at all.
describe('formatUsageResetIn', () => {
  it('says nothing when there is no reset to report', () => {
    expect(formatUsageResetIn(null, NOW)).toBeNull();
    expect(formatUsageResetIn(undefined, NOW)).toBeNull();
    expect(formatUsageResetIn('not a date', NOW)).toBeNull();
  });

  it('says nothing once the window has already reset', () => {
    expect(inMs(-1)).toBeNull();
    expect(inMs(0)).toBeNull();
  });

  it('reports minutes under an hour', () => {
    expect(inMs(20 * MIN)).toBe('Resets in 20 min');
  });

  it('never reports zero minutes for a window that has not reset', () => {
    expect(inMs(20_000)).toBe('Resets in 1 min');
  });

  it('reports hours and minutes, not hours alone', () => {
    // claude.ai shows "3 hr 54 min"; rounding to "4 hours" loses the detail
    // that decides whether waiting is worth it.
    expect(inMs(3 * HOUR + 54 * MIN)).toBe('Resets in 3 hr 54 min');
  });

  it('never understates the wait by rounding an hour down', () => {
    expect(inMs(3 * HOUR + 29 * MIN)).toBe('Resets in 3 hr 29 min');
  });

  it('keeps the existing wording for a whole number of hours', () => {
    expect(inMs(2 * HOUR)).toBe('Resets in 2 hours');
    expect(inMs(HOUR)).toBe('Resets in 1 hour');
  });

  it('handles the hour boundary from both sides', () => {
    expect(inMs(HOUR - MIN)).toBe('Resets in 59 min');
    expect(inMs(HOUR)).toBe('Resets in 1 hour');
  });

  it('switches to days for a weekly window', () => {
    expect(inMs(3 * DAY)).toBe('Resets in 3 days');
    expect(inMs(DAY)).toBe('Resets in 1 day');
  });

  it('accepts a Date and a timestamp, not only a string', () => {
    expect(formatUsageResetIn(new Date(NOW + 2 * HOUR), NOW)).toBe('Resets in 2 hours');
    expect(formatUsageResetIn(NOW + 2 * HOUR, NOW)).toBe('Resets in 2 hours');
  });
});
