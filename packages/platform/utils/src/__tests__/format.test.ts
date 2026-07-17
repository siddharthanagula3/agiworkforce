import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime } from '../format';

const originalRelativeTimeFormat = Intl.RelativeTimeFormat;

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(Intl, 'RelativeTimeFormat', {
      configurable: true,
      writable: true,
      value: originalRelativeTimeFormat,
    });
  });

  it('falls back when Intl.RelativeTimeFormat is unavailable', () => {
    const now = new Date('2026-06-11T18:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    Object.defineProperty(Intl, 'RelativeTimeFormat', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    expect(formatRelativeTime(now)).toBe('now');
    expect(formatRelativeTime(now - 5 * 60_000)).toBe('5 minutes ago');
    expect(formatRelativeTime(now + 3_600_000)).toBe('in 1 hour');
  });
});
