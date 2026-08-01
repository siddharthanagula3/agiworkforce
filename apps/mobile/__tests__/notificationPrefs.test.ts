/**
 * Regression guard for the notification-preferences gate (shouldNotifyWithPreferences).
 *
 * These preferences were previously INERT — no live notification path consulted
 * them. backgroundFetch.ts (agent-approval push) and notifications.ts (foreground
 * handler) now call this gate, so this test pins the contract those paths depend on.
 */
import {
  getCategoryForType,
  shouldNotifyWithPreferences,
  type NotificationPrefsState,
} from '@/stores/notificationPrefsStore';
import type { TimeFocusWeekday } from '@agiworkforce/types';

const EVERY_DAY: readonly TimeFocusWeekday[] = [0, 1, 2, 3, 4, 5, 6];

const base: Pick<NotificationPrefsState, 'categoryEnabled' | 'quietHours'> = {
  categoryEnabled: { approvals: true, task_updates: true, errors: true, status: true },
  quietHours: {
    enabled: false,
    days: EVERY_DAY,
    startTime: '22:00',
    endTime: '07:00',
    timezone: 'UTC',
  },
};

// 2026-07-31 is a Friday (weekday 5); 2026-08-01 is a Saturday (weekday 6).
const NOON = new Date('2026-07-31T12:00:00Z');
const LATE_NIGHT = new Date('2026-07-31T23:00:00Z');
const SATURDAY_LATE_NIGHT = new Date('2026-08-01T23:00:00Z');

describe('shouldNotifyWithPreferences', () => {
  it('keeps every supported work-update event on the persisted work lane', () => {
    expect(getCategoryForType('task_completed')).toBe('task_updates');
    expect(getCategoryForType('agent_paused')).toBe('task_updates');
    expect(getCategoryForType('schedule_triggered')).toBe('task_updates');
    expect(getCategoryForType('chat_message')).toBe('task_updates');
  });

  it('suppresses a notification whose category toggle is off', () => {
    const prefs = { ...base, categoryEnabled: { ...base.categoryEnabled, approvals: false } };
    expect(shouldNotifyWithPreferences('agent_approval_needed', prefs, NOON)).toBe(false);
  });

  it('allows a notification whose category is on and outside quiet hours', () => {
    expect(shouldNotifyWithPreferences('agent_approval_needed', base, NOON)).toBe(true);
  });

  it('suppresses a non-critical type inside quiet hours', () => {
    const prefs = { ...base, quietHours: { ...base.quietHours, enabled: true } };
    // task_completed → task_updates (non-critical) → quiet hours applies.
    expect(shouldNotifyWithPreferences('task_completed', prefs, LATE_NIGHT)).toBe(false);
  });

  it('never quiet-hours-suppresses a critical approval (safety exemption)', () => {
    const prefs = { ...base, quietHours: { ...base.quietHours, enabled: true } };
    expect(shouldNotifyWithPreferences('agent_approval_needed', prefs, LATE_NIGHT)).toBe(true);
  });

  /**
   * The gate used to evaluate the clock window only, ignoring which days the
   * schedule covered. Quiet hours are shared with web, where the day picker has
   * always existed — so a weekend-only schedule set on web silenced mobile on a
   * Friday night too.
   */
  it('applies quiet hours only on the days the schedule covers', () => {
    const weekendsOnly = {
      ...base,
      quietHours: { ...base.quietHours, enabled: true, days: [0, 6] as TimeFocusWeekday[] },
    };
    expect(shouldNotifyWithPreferences('task_completed', weekendsOnly, LATE_NIGHT)).toBe(true);
    expect(shouldNotifyWithPreferences('task_completed', weekendsOnly, SATURDAY_LATE_NIGHT)).toBe(
      false,
    );
  });

  /** An empty day list is the shared contract's "no schedule", not "every day". */
  it('does not suppress anything when the schedule covers no days', () => {
    const noDays = {
      ...base,
      quietHours: { ...base.quietHours, enabled: true, days: [] as TimeFocusWeekday[] },
    };
    expect(shouldNotifyWithPreferences('task_completed', noDays, LATE_NIGHT)).toBe(true);
  });
});
