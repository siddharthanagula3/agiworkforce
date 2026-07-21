/**
 * Regression guard for the notification-preferences gate (shouldNotifyWithPreferences).
 *
 * These preferences were previously INERT — no live notification path consulted
 * them. backgroundFetch.ts (agent-approval push) and notifications.ts (foreground
 * handler) now call this gate, so this test pins the contract those paths depend on.
 */
import {
  shouldNotifyWithPreferences,
  type NotificationPrefsState,
} from '@/stores/notificationPrefsStore';

const base: Pick<NotificationPrefsState, 'categoryEnabled' | 'quietHours'> = {
  categoryEnabled: { approvals: true, task_updates: true, errors: true, status: true },
  quietHours: { enabled: false, startTime: '22:00', endTime: '07:00' },
};

const NOON = 12 * 60;
const LATE_NIGHT = 23 * 60;

describe('shouldNotifyWithPreferences', () => {
  it('suppresses a notification whose category toggle is off', () => {
    const prefs = { ...base, categoryEnabled: { ...base.categoryEnabled, approvals: false } };
    expect(shouldNotifyWithPreferences('agent_approval_needed', prefs, NOON)).toBe(false);
  });

  it('allows a notification whose category is on and outside quiet hours', () => {
    expect(shouldNotifyWithPreferences('agent_approval_needed', base, NOON)).toBe(true);
  });

  it('suppresses a non-critical type inside quiet hours', () => {
    const prefs = { ...base, quietHours: { enabled: true, startTime: '22:00', endTime: '07:00' } };
    // task_completed → task_updates (non-critical) → quiet hours applies.
    expect(shouldNotifyWithPreferences('task_completed', prefs, LATE_NIGHT)).toBe(false);
  });

  it('never quiet-hours-suppresses a critical approval (safety exemption)', () => {
    const prefs = { ...base, quietHours: { enabled: true, startTime: '22:00', endTime: '07:00' } };
    expect(shouldNotifyWithPreferences('agent_approval_needed', prefs, LATE_NIGHT)).toBe(true);
  });
});
