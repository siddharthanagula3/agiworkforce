import { formatNotificationTime } from '@/src/features/notifications/time';

describe('formatNotificationTime', () => {
  const now = Date.parse('2026-06-11T12:00:00.000Z');

  it('clamps future timestamps to just now', () => {
    expect(formatNotificationTime('2026-06-11T12:05:00.000Z', now)).toBe('just now');
  });

  it('falls back safely for invalid timestamps', () => {
    expect(formatNotificationTime('not-a-date', now)).toBe('just now');
  });

  it('formats recent notification ages', () => {
    expect(formatNotificationTime('2026-06-11T11:55:00.000Z', now)).toBe('5m ago');
    expect(formatNotificationTime('2026-06-11T09:00:00.000Z', now)).toBe('3h ago');
    expect(formatNotificationTime('2026-06-09T12:00:00.000Z', now)).toBe('2d ago');
  });
});
