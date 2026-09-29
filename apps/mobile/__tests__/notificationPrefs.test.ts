import {
  DEFAULT_CATEGORY_ENABLED,
  getCategoryForType,
  migrateNotificationPrefs,
  shouldNotifyWithPreferences,
  useNotificationPrefsStore,
  type NotificationPrefsState,
} from '@/stores/notificationPrefsStore';
import { NOTIFICATION_EVENT_TYPES } from '@/services/notificationEventTypes';
import type { TimeFocusWeekday } from '@agiworkforce/types';

const EVERY_DAY: readonly TimeFocusWeekday[] = [0, 1, 2, 3, 4, 5, 6];

const base: Pick<NotificationPrefsState, 'categoryEnabled' | 'quietHours'> = {
  categoryEnabled: { chat_replies: true, tasks: true, product: true },
  quietHours: {
    enabled: false,
    days: EVERY_DAY,
    startTime: '22:00',
    endTime: '07:00',
    timezone: 'UTC',
  },
};

const NOON = new Date('2026-07-31T12:00:00Z');
const LATE_NIGHT = new Date('2026-07-31T23:00:00Z');
const SATURDAY_LATE_NIGHT = new Date('2026-08-01T23:00:00Z');

describe('shouldNotifyWithPreferences', () => {
  it('files every supported event under chat replies, tasks or product', () => {
    expect(getCategoryForType('chat_message')).toBe('chat_replies');
    expect(getCategoryForType('task_completed')).toBe('tasks');
    expect(getCategoryForType('agent_paused')).toBe('tasks');
    expect(getCategoryForType('schedule_run')).toBe('tasks');
    expect(getCategoryForType('schedule_triggered')).toBe('tasks');
    expect(getCategoryForType('agent_approval_needed')).toBe('tasks');
    expect(getCategoryForType('agent_failed')).toBe('tasks');
    expect(getCategoryForType('status_update')).toBe('product');
    expect(getCategoryForType('heartbeat_info')).toBe('product');
    for (const type of NOTIFICATION_EVENT_TYPES) {
      expect(Object.keys(DEFAULT_CATEGORY_ENABLED)).toContain(getCategoryForType(type));
    }
  });

  it('keeps chat replies separate from task updates', () => {
    const prefs = { ...base, categoryEnabled: { ...base.categoryEnabled, chat_replies: false } };
    expect(shouldNotifyWithPreferences('chat_message', prefs, NOON)).toBe(false);
    expect(shouldNotifyWithPreferences('task_completed', prefs, NOON)).toBe(true);
  });

  it('suppresses a notification whose category toggle is off', () => {
    const prefs = { ...base, categoryEnabled: { ...base.categoryEnabled, tasks: false } };
    expect(shouldNotifyWithPreferences('agent_approval_needed', prefs, NOON)).toBe(false);
  });

  it('allows a notification whose category is on and outside quiet hours', () => {
    expect(shouldNotifyWithPreferences('agent_approval_needed', base, NOON)).toBe(true);
  });

  it('suppresses a non-critical type inside quiet hours', () => {
    const prefs = { ...base, quietHours: { ...base.quietHours, enabled: true } };
    expect(shouldNotifyWithPreferences('task_completed', prefs, LATE_NIGHT)).toBe(false);
  });

  it('never quiet-hours-suppresses a critical approval (safety exemption)', () => {
    const prefs = { ...base, quietHours: { ...base.quietHours, enabled: true } };
    expect(shouldNotifyWithPreferences('agent_approval_needed', prefs, LATE_NIGHT)).toBe(true);
  });

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

  it('does not suppress anything when the schedule covers no days', () => {
    const noDays = {
      ...base,
      quietHours: { ...base.quietHours, enabled: true, days: [] as TimeFocusWeekday[] },
    };
    expect(shouldNotifyWithPreferences('task_completed', noDays, LATE_NIGHT)).toBe(true);
  });
});

describe('notification preference defaults and migration', () => {
  const quietHours = {
    enabled: true,
    days: [1, 2, 3] as TimeFocusWeekday[],
    startTime: '21:00',
    endTime: '06:30',
    timezone: 'Europe/Berlin',
  };
  const vibrationEnabled = { critical: true, high: false, normal: true, low: false };

  it('defaults chat replies and tasks on and product off', () => {
    expect(DEFAULT_CATEGORY_ENABLED).toEqual({ chat_replies: true, tasks: true, product: false });
    expect(useNotificationPrefsStore.getState().categoryEnabled).toEqual(DEFAULT_CATEGORY_ENABLED);
  });

  it('persists at version 2 through the migration', () => {
    const options = useNotificationPrefsStore.persist.getOptions();
    expect(options.version).toBe(2);
    expect(options.migrate).toBeDefined();
  });

  it('maps the version 1 categories onto the new ones and keeps every other field', () => {
    const migrated = migrateNotificationPrefs(
      {
        categoryEnabled: { approvals: false, task_updates: true, errors: false, status: true },
        vibrationEnabled,
        quietHours,
        breakReminderMinutes: 45,
      },
      1,
    );
    expect(migrated).toEqual({
      categoryEnabled: { chat_replies: true, tasks: true, product: true },
      vibrationEnabled,
      quietHours,
      breakReminderMinutes: 45,
    });
  });

  it.each([
    [{ approvals: true, task_updates: false, errors: false, status: false }, true, false],
    [{ approvals: false, task_updates: false, errors: true, status: false }, true, false],
    [{ approvals: false, task_updates: false, errors: false, status: false }, false, false],
    [{ approvals: false, task_updates: true, errors: false, status: false }, true, true],
  ])('keeps tasks on when any old task lane was on (%o)', (legacy, tasks, chatReplies) => {
    const migrated = migrateNotificationPrefs({ categoryEnabled: legacy }, 1) as {
      categoryEnabled: Record<string, boolean>;
    };
    expect(migrated.categoryEnabled).toEqual({
      chat_replies: chatReplies,
      tasks,
      product: false,
    });
  });

  it.each([undefined, null, 'garbled', 7, ['approvals']])(
    'falls back to the defaults when the old category map is %p',
    (legacy) => {
      const migrated = migrateNotificationPrefs({ categoryEnabled: legacy, vibrationEnabled }, 1);
      expect(migrated).toEqual({
        categoryEnabled: DEFAULT_CATEGORY_ENABLED,
        vibrationEnabled,
      });
    },
  );

  it('uses the old default for an old flag that is missing or not a boolean', () => {
    const migrated = migrateNotificationPrefs(
      { categoryEnabled: { approvals: false, errors: false, task_updates: 'yes', status: 1 } },
      1,
    ) as { categoryEnabled: Record<string, boolean> };
    expect(migrated.categoryEnabled).toEqual({ chat_replies: true, tasks: true, product: false });

    const allMissing = migrateNotificationPrefs({ categoryEnabled: {} }, 1) as {
      categoryEnabled: Record<string, boolean>;
    };
    expect(allMissing.categoryEnabled).toEqual(DEFAULT_CATEGORY_ENABLED);
  });

  it('applies the quiet hours and category migrations together from version 0', () => {
    const migrated = migrateNotificationPrefs(
      {
        categoryEnabled: { approvals: true, task_updates: false, errors: true, status: false },
        quietHours: { enabled: true, startTime: '23:00', endTime: '07:00', timezone: 'UTC' },
      },
      0,
    );
    expect(migrated).toEqual({
      categoryEnabled: { chat_replies: false, tasks: true, product: false },
      quietHours: {
        enabled: true,
        days: EVERY_DAY,
        startTime: '23:00',
        endTime: '07:00',
        timezone: 'UTC',
      },
    });
  });

  it('leaves a version 2 state and non-object input untouched', () => {
    const current = { categoryEnabled: { chat_replies: false, tasks: true, product: true } };
    expect(migrateNotificationPrefs(current, 2)).toBe(current);
    expect(migrateNotificationPrefs(null, 1)).toBeNull();
  });
});
