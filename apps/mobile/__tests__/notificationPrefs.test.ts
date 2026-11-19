import {
  DEFAULT_CATEGORY_ENABLED,
  getCategoryForType,
  migrateLegacyCategoryEnabled,
  migrateNotificationPrefs,
  shouldNotifyWithPreferences,
  useNotificationPrefsStore,
  type NotificationPrefsState,
} from '@/stores/notificationPrefsStore';
import { NOTIFICATION_EVENT_TYPES } from '@/services/notificationEventTypes';
import type { TimeFocusWeekday } from '@agiworkforce/types';

const EVERY_DAY: readonly TimeFocusWeekday[] = [0, 1, 2, 3, 4, 5, 6];

const base: Pick<NotificationPrefsState, 'categoryEnabled' | 'quietHours'> = {
  categoryEnabled: {
    chat_replies: true,
    tasks: true,
    scheduled_tasks: true,
    research: true,
    code: true,
    product_updates: true,
    product: true,
    usage_resets: true,
  },
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
  it('files every supported event under its own switch', () => {
    expect(getCategoryForType('chat_message')).toBe('chat_replies');
    expect(getCategoryForType('task_completed')).toBe('tasks');
    expect(getCategoryForType('agent_paused')).toBe('tasks');
    expect(getCategoryForType('schedule_run')).toBe('scheduled_tasks');
    expect(getCategoryForType('schedule_triggered')).toBe('scheduled_tasks');
    expect(getCategoryForType('product_update')).toBe('product_updates');
    expect(getCategoryForType('agent_approval_needed')).toBe('tasks');
    expect(getCategoryForType('agent_failed')).toBe('tasks');
    expect(getCategoryForType('status_update')).toBe('product');
    expect(getCategoryForType('heartbeat_info')).toBe('product');
    expect(getCategoryForType('usage_limit_reset')).toBe('usage_resets');
    for (const type of NOTIFICATION_EVENT_TYPES) {
      expect(Object.keys(DEFAULT_CATEGORY_ENABLED)).toContain(getCategoryForType(type));
    }
  });

  it('follows only the usage limit reset switch for a reset reminder', () => {
    const tasksOff = { ...base, categoryEnabled: { ...base.categoryEnabled, tasks: false } };
    expect(shouldNotifyWithPreferences('usage_limit_reset', tasksOff, NOON)).toBe(true);
    const resetsOff = {
      ...base,
      categoryEnabled: { ...base.categoryEnabled, usage_resets: false },
    };
    expect(shouldNotifyWithPreferences('usage_limit_reset', resetsOff, NOON)).toBe(false);
    expect(shouldNotifyWithPreferences('task_completed', resetsOff, NOON)).toBe(true);
  });

  it('keeps chat replies separate from task updates', () => {
    const prefs = { ...base, categoryEnabled: { ...base.categoryEnabled, chat_replies: false } };
    expect(shouldNotifyWithPreferences('chat_message', prefs, NOON)).toBe(false);
    expect(shouldNotifyWithPreferences('task_completed', prefs, NOON)).toBe(true);
  });

  it('mutes scheduled runs alone, leaving approvals and task results on', () => {
    const prefs = { ...base, categoryEnabled: { ...base.categoryEnabled, scheduled_tasks: false } };
    expect(shouldNotifyWithPreferences('schedule_run', prefs, NOON)).toBe(false);
    expect(shouldNotifyWithPreferences('schedule_triggered', prefs, NOON)).toBe(false);
    expect(shouldNotifyWithPreferences('agent_approval_needed', prefs, NOON)).toBe(true);
    expect(shouldNotifyWithPreferences('task_completed', prefs, NOON)).toBe(true);
  });

  it('keeps product updates separate from service status', () => {
    const prefs = { ...base, categoryEnabled: { ...base.categoryEnabled, product_updates: false } };
    expect(shouldNotifyWithPreferences('product_update', prefs, NOON)).toBe(false);
    expect(shouldNotifyWithPreferences('status_update', prefs, NOON)).toBe(true);
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

  it('defaults chat replies, tasks and scheduled tasks on, product updates and status off', () => {
    expect(DEFAULT_CATEGORY_ENABLED).toEqual({
      chat_replies: true,
      tasks: true,
      scheduled_tasks: true,
      research: true,
      code: true,
      product_updates: false,
      product: false,
      usage_resets: true,
    });
    expect(useNotificationPrefsStore.getState().categoryEnabled).toEqual(DEFAULT_CATEGORY_ENABLED);
  });

  it('persists at version 5 through the migration', () => {
    const options = useNotificationPrefsStore.persist.getOptions();
    expect(options.version).toBe(5);
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
      categoryEnabled: {
        chat_replies: true,
        tasks: true,
        scheduled_tasks: true,
        research: true,
        code: true,
        product_updates: false,
        product: true,
        usage_resets: true,
      },
      vibrationEnabled,
      quietHours,
      breakReminderMinutes: 45,
      announcedPushGroups: [],
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
      scheduled_tasks: tasks,
      research: tasks,
      code: tasks,
      product_updates: false,
      product: false,
      usage_resets: true,
    });
  });

  it.each([undefined, null, 'garbled', 7, ['approvals']])(
    'falls back to the defaults when the old category map is %p',
    (legacy) => {
      const migrated = migrateNotificationPrefs({ categoryEnabled: legacy, vibrationEnabled }, 1);
      expect(migrated).toEqual({
        categoryEnabled: DEFAULT_CATEGORY_ENABLED,
        vibrationEnabled,
        announcedPushGroups: [],
      });
    },
  );

  it('uses the old default for an old flag that is missing or not a boolean', () => {
    const migrated = migrateNotificationPrefs(
      { categoryEnabled: { approvals: false, errors: false, task_updates: 'yes', status: 1 } },
      1,
    ) as { categoryEnabled: Record<string, boolean> };
    expect(migrated.categoryEnabled).toEqual(DEFAULT_CATEGORY_ENABLED);

    const allMissing = migrateNotificationPrefs({ categoryEnabled: {} }, 1) as {
      categoryEnabled: Record<string, boolean>;
    };
    expect(allMissing.categoryEnabled).toEqual(DEFAULT_CATEGORY_ENABLED);
  });

  it.each([true, false])(
    'gives every current switch a value when only the version 1 map is migrated (tasks %p)',
    (tasks) => {
      const migrated = migrateLegacyCategoryEnabled({
        approvals: tasks,
        task_updates: tasks,
        errors: tasks,
        status: false,
      });
      expect(Object.keys(migrated).sort()).toEqual(Object.keys(DEFAULT_CATEGORY_ENABLED).sort());
      expect(migrated.research).toBe(tasks);
      expect(migrated.code).toBe(tasks);
    },
  );

  it('applies the quiet hours and category migrations together from version 0', () => {
    const migrated = migrateNotificationPrefs(
      {
        categoryEnabled: { approvals: true, task_updates: false, errors: true, status: false },
        quietHours: { enabled: true, startTime: '23:00', endTime: '07:00', timezone: 'UTC' },
      },
      0,
    );
    expect(migrated).toEqual({
      categoryEnabled: {
        chat_replies: false,
        tasks: true,
        scheduled_tasks: true,
        research: true,
        code: true,
        product_updates: false,
        product: false,
        usage_resets: true,
      },
      quietHours: {
        enabled: true,
        days: EVERY_DAY,
        startTime: '23:00',
        endTime: '07:00',
        timezone: 'UTC',
      },
      announcedPushGroups: [],
    });
  });

  it.each([true, false])(
    'starts scheduled tasks from the task and approval switch (%p) when moving to version 3',
    (tasks) => {
      const migrated = migrateNotificationPrefs(
        {
          categoryEnabled: { chat_replies: false, tasks, product: true },
          vibrationEnabled,
          quietHours,
        },
        2,
      );
      expect(migrated).toEqual({
        categoryEnabled: {
          chat_replies: false,
          tasks,
          scheduled_tasks: tasks,
          research: tasks,
          code: tasks,
          product_updates: false,
          product: true,
          usage_resets: true,
        },
        vibrationEnabled,
        quietHours,
        announcedPushGroups: [],
      });
    },
  );

  it('falls back to the defaults when the version 2 category map is unreadable', () => {
    const migrated = migrateNotificationPrefs({ categoryEnabled: 'garbled' }, 2) as {
      categoryEnabled: Record<string, boolean>;
    };
    expect(migrated.categoryEnabled).toEqual(DEFAULT_CATEGORY_ENABLED);
  });

  it.each([true, false])(
    'adds usage limit resets, on, to a version 3 map and keeps every switch (%p)',
    (flag) => {
      const categoryEnabled = {
        chat_replies: flag,
        tasks: !flag,
        scheduled_tasks: flag,
        product_updates: !flag,
        product: flag,
      };
      const migrated = migrateNotificationPrefs({ categoryEnabled, quietHours }, 3);
      expect(migrated).toEqual({
        categoryEnabled: { ...categoryEnabled, research: !flag, code: !flag, usage_resets: true },
        quietHours,
        announcedPushGroups: [],
      });
    },
  );

  it.each([true, false])(
    'starts research and AGI Code from the task and approval switch (%p) when moving to version 5',
    (tasks) => {
      const categoryEnabled = {
        chat_replies: !tasks,
        tasks,
        scheduled_tasks: !tasks,
        product_updates: tasks,
        product: !tasks,
        usage_resets: !tasks,
      };
      const migrated = migrateNotificationPrefs(
        { categoryEnabled, quietHours, vibrationEnabled, breakReminderMinutes: 30 },
        4,
      );
      expect(migrated).toEqual({
        categoryEnabled: { ...categoryEnabled, research: tasks, code: tasks },
        quietHours,
        vibrationEnabled,
        breakReminderMinutes: 30,
        announcedPushGroups: [],
      });
    },
  );

  it('leaves a version 5 state and non-object input untouched', () => {
    const current = { categoryEnabled: { ...DEFAULT_CATEGORY_ENABLED, chat_replies: false } };
    expect(migrateNotificationPrefs(current, 5)).toBe(current);
    expect(migrateNotificationPrefs(null, 1)).toBeNull();
  });
});

describe('research and AGI Code notices', () => {
  const SPLIT_TYPES = [
    ['research_completed', 'research'],
    ['code_session_completed', 'code'],
    ['code_session_failed', 'code'],
    ['code_session_needs_input', 'code'],
  ] as const;

  beforeEach(async () => {
    await useNotificationPrefsStore.persist.rehydrate();
    useNotificationPrefsStore.setState({
      categoryEnabled: { ...DEFAULT_CATEGORY_ENABLED },
      announcedPushGroups: [],
    });
  });

  it.each(SPLIT_TYPES)(
    'files %s under task and approval updates until this device has received one',
    (type, group) => {
      expect(getCategoryForType(type, [])).toBe('tasks');
      expect(getCategoryForType(type, [group])).toBe(group);
      const tasksOff = { ...base, categoryEnabled: { ...base.categoryEnabled, tasks: false } };
      expect(shouldNotifyWithPreferences(type, tasksOff, NOON)).toBe(false);
      expect(
        shouldNotifyWithPreferences(type, { ...tasksOff, announcedPushGroups: [group] }, NOON),
      ).toBe(true);
    },
  );

  it('lets a device mute research alone once research notices have arrived', () => {
    const researchOff = {
      ...base,
      categoryEnabled: { ...base.categoryEnabled, research: false },
      announcedPushGroups: ['research' as const],
    };
    expect(shouldNotifyWithPreferences('research_completed', researchOff, NOON)).toBe(false);
    expect(shouldNotifyWithPreferences('task_completed', researchOff, NOON)).toBe(true);
    expect(shouldNotifyWithPreferences('code_session_completed', researchOff, NOON)).toBe(true);
  });

  it('keeps a coding session that needs you or failed audible inside quiet hours', () => {
    const quiet = {
      ...base,
      quietHours: { ...base.quietHours, enabled: true },
      announcedPushGroups: ['research' as const, 'code' as const],
    };
    expect(shouldNotifyWithPreferences('code_session_needs_input', quiet, LATE_NIGHT)).toBe(true);
    expect(shouldNotifyWithPreferences('code_session_failed', quiet, LATE_NIGHT)).toBe(true);
    expect(shouldNotifyWithPreferences('code_session_completed', quiet, LATE_NIGHT)).toBe(false);
    expect(shouldNotifyWithPreferences('research_completed', quiet, LATE_NIGHT)).toBe(false);
  });

  it.each([true, false])(
    'shows a group once its first notice arrives, starting from the task switch (%p)',
    (tasks) => {
      useNotificationPrefsStore.setState({
        categoryEnabled: { ...DEFAULT_CATEGORY_ENABLED, tasks, research: !tasks, code: !tasks },
      });

      useNotificationPrefsStore.getState().notePushTypeReceived('code_session_needs_input');

      const state = useNotificationPrefsStore.getState();
      expect(state.announcedPushGroups).toEqual(['code']);
      expect(state.categoryEnabled.code).toBe(tasks);
      expect(state.categoryEnabled.research).toBe(!tasks);
    },
  );

  it('keeps the switch a person already set when a later notice of the same group arrives', () => {
    const store = useNotificationPrefsStore.getState();
    store.notePushTypeReceived('research_completed');
    useNotificationPrefsStore.getState().setCategoryEnabled('research', false);

    useNotificationPrefsStore.getState().notePushTypeReceived('research_completed');

    expect(useNotificationPrefsStore.getState().announcedPushGroups).toEqual(['research']);
    expect(useNotificationPrefsStore.getState().categoryEnabled.research).toBe(false);
  });

  it.each(['task_completed', 'chat_message', 'some_future_type', undefined, 42])(
    'shows no new group for %p',
    (type) => {
      useNotificationPrefsStore.getState().notePushTypeReceived(type);
      expect(useNotificationPrefsStore.getState().announcedPushGroups).toEqual([]);
    },
  );
});
