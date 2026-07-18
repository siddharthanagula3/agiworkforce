import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeFocusReminder, focusActivityStorageKey, readFocusActivity } from './TimeFocusReminder';

const preferenceMocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: preferenceMocks.fetch,
}));

const mondayNight = new Date('2026-07-20T23:00:00.000Z');

async function flushPreferences() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('TimeFocusReminder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mondayNight);
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    preferenceMocks.fetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds dismissible quiet-hours friction once per active window', async () => {
    preferenceMocks.fetch.mockResolvedValue({
      breakReminderMinutes: null,
      quietHours: {
        enabled: true,
        days: [1],
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
      },
    });
    const onLeave = vi.fn();
    const first = render(<TimeFocusReminder userId="user-1" onLeave={onLeave} />);
    await flushPreferences();

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Quiet hours are active');
    fireEvent.click(screen.getByRole('button', { name: 'Continue in AGI' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    first.unmount();
    render(<TimeFocusReminder userId="user-1" onLeave={onLeave} />);
    await flushPreferences();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('offers a real come-back-later path without locking the user out', async () => {
    preferenceMocks.fetch.mockResolvedValue({
      breakReminderMinutes: null,
      quietHours: {
        enabled: true,
        days: [1],
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
      },
    });
    const onLeave = vi.fn();
    render(<TimeFocusReminder userId="user-1" onLeave={onLeave} />);
    await flushPreferences();

    fireEvent.click(screen.getByRole('button', { name: 'Come back later' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('nudges after the configured visible daily time and remembers dismissal', async () => {
    preferenceMocks.fetch.mockResolvedValue({
      breakReminderMinutes: 30,
      quietHours: {
        enabled: false,
        days: [],
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
      },
    });
    localStorage.setItem(
      focusActivityStorageKey('user-1'),
      JSON.stringify({ dateKey: '2026-07-20', activeMs: 29 * 60_000, dismissedBreakMinutes: null }),
    );
    render(<TimeFocusReminder userId="user-1" onLeave={vi.fn()} activeTickMs={60_000} />);
    await flushPreferences();

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Time for a break?');
    fireEvent.click(screen.getByRole('button', { name: 'Continue in AGI' }));

    expect(readFocusActivity(localStorage, 'user-1', '2026-07-20')).toMatchObject({
      dismissedBreakMinutes: 30,
    });
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('does not count hidden-tab time and isolates activity by account', async () => {
    preferenceMocks.fetch.mockResolvedValue({
      breakReminderMinutes: 30,
      quietHours: {
        enabled: false,
        days: [],
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
      },
    });
    localStorage.setItem(
      focusActivityStorageKey('user-2'),
      JSON.stringify({ dateKey: '2026-07-20', activeMs: 29 * 60_000, dismissedBreakMinutes: null }),
    );
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    render(<TimeFocusReminder userId="user-2" onLeave={vi.fn()} activeTickMs={60_000} />);
    await flushPreferences();
    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(readFocusActivity(localStorage, 'user-2', '2026-07-20').activeMs).toBe(29 * 60_000);
    expect(localStorage.getItem(focusActivityStorageKey('user-1'))).toBeNull();
  });

  it('fails closed on malformed local activity data', () => {
    localStorage.setItem(focusActivityStorageKey('user-1'), '{not-json');
    expect(readFocusActivity(localStorage, 'user-1', '2026-07-20')).toEqual({
      dateKey: '2026-07-20',
      activeMs: 0,
      dismissedBreakMinutes: null,
    });
  });
});
