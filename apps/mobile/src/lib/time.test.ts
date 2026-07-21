import { formatClock, formatRelativeTime } from './time';

describe('formatClock', () => {
  it('renders MM:SS zero-padded', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(5_000)).toBe('00:05');
    expect(formatClock(125_000)).toBe('02:05');
    expect(formatClock(3_599_000)).toBe('59:59');
  });
});

describe('formatRelativeTime', () => {
  const now = Date.now();
  it('buckets by unit and falls back to a date past 7 days', () => {
    expect(formatRelativeTime(new Date(now).toISOString())).toBe('just now');
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(formatRelativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago');
    expect(formatRelativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago');
    expect(formatRelativeTime(new Date(now - 30 * 86_400_000).toISOString())).toMatch(/\d/);
  });
});
