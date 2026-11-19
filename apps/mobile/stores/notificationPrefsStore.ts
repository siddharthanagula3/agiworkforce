import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  QUIET_HOURS_EXEMPT_EVENT_TYPES,
  type NotificationEventType,
} from '@/services/notificationEventTypes';
import {
  isDateWithinQuietHours,
  type BreakReminderMinutes,
  type QuietHoursPreferences,
  type TimeFocusPreferences,
  type TimeFocusWeekday,
} from '@agiworkforce/types';

/**
 * The switches this device offers for its own pushes, like the push settings in
 * the ChatGPT and Claude apps. They group push event types; the account feed
 * files its rows under the shared NOTIFICATION_CATEGORIES instead.
 */
export type PushPreferenceGroup =
  | 'chat_replies'
  | 'tasks'
  | 'scheduled_tasks'
  | 'research'
  | 'code'
  | 'product_updates'
  | 'product'
  | 'usage_resets';

export const DEFAULT_CATEGORY_ENABLED: Readonly<Record<PushPreferenceGroup, boolean>> = {
  chat_replies: true,
  tasks: true,
  scheduled_tasks: true,
  research: true,
  code: true,
  product_updates: false,
  product: false,
  usage_resets: true,
};

/**
 * Groups split out of `tasks` whose notices only a newer server sends. Until
 * this device has received one, the group stays hidden and its notices follow
 * the `tasks` switch, so a switch never shows before anything can reach it.
 */
export type AnnouncedPushGroup = Extract<PushPreferenceGroup, 'research' | 'code'>;

const ANNOUNCED_GROUP_BY_TYPE: Readonly<
  Partial<Record<NotificationEventType, AnnouncedPushGroup>>
> = {
  research_completed: 'research',
  code_session_completed: 'code',
  code_session_failed: 'code',
  code_session_needs_input: 'code',
};

export function announcedGroupForType(type: unknown): AnnouncedPushGroup | null {
  return typeof type === 'string' &&
    Object.prototype.hasOwnProperty.call(ANNOUNCED_GROUP_BY_TYPE, type)
    ? (ANNOUNCED_GROUP_BY_TYPE[type as NotificationEventType] ?? null)
    : null;
}

const LEGACY_CATEGORY_DEFAULTS = {
  approvals: true,
  task_updates: true,
  errors: true,
  status: false,
} as const;

type LegacyPushPreferenceGroup = keyof typeof LEGACY_CATEGORY_DEFAULTS;

export type QuietHours = QuietHoursPreferences;

export const ALL_WEEKDAYS: readonly TimeFocusWeekday[] = [0, 1, 2, 3, 4, 5, 6];

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface NotificationPrefsState {
  categoryEnabled: Record<PushPreferenceGroup, boolean>;
  vibrationEnabled: Record<'critical' | 'high' | 'normal' | 'low', boolean>;
  quietHours: QuietHours;
  breakReminderMinutes: BreakReminderMinutes | null;
  announcedPushGroups: AnnouncedPushGroup[];

  setCategoryEnabled: (category: PushPreferenceGroup, enabled: boolean) => void;
  setVibrationEnabled: (priority: 'critical' | 'high' | 'normal' | 'low', enabled: boolean) => void;
  setQuietHours: (quietHours: Partial<QuietHours>) => void;
  setBreakReminderMinutes: (minutes: BreakReminderMinutes | null) => void;
  applyTimeFocusPreferences: (preferences: TimeFocusPreferences) => void;
  notePushTypeReceived: (type: unknown) => void;

  shouldNotify: (type: NotificationEventType) => boolean;
}

function currentAnnouncedPushGroups(): readonly AnnouncedPushGroup[] {
  return useNotificationPrefsStore.getState().announcedPushGroups ?? [];
}

export function getCategoryForType(
  type: NotificationEventType,
  announced: readonly AnnouncedPushGroup[] = currentAnnouncedPushGroups(),
): PushPreferenceGroup {
  const split = announcedGroupForType(type);
  if (split) return announced.includes(split) ? split : 'tasks';
  switch (type) {
    case 'chat_message':
      return 'chat_replies';
    case 'agent_approval_needed':
    case 'approval_pending_escalation':
    case 'task_completed':
    case 'agent_failed':
    case 'emergency_stop_triggered':
    case 'agent_paused':
    case 'companion_connected':
      return 'tasks';
    case 'schedule_run':
    case 'schedule_triggered':
      return 'scheduled_tasks';
    case 'product_update':
      return 'product_updates';
    case 'status_update':
    case 'heartbeat_info':
      return 'product';
    case 'usage_limit_reset':
      return 'usage_resets';
    default:
      return 'tasks';
  }
}

export function migrateLegacyCategoryEnabled(
  legacy: unknown,
): Record<PushPreferenceGroup, boolean> {
  if (legacy === null || typeof legacy !== 'object' || Array.isArray(legacy)) {
    return { ...DEFAULT_CATEGORY_ENABLED };
  }
  const source = legacy as Partial<Record<LegacyPushPreferenceGroup, unknown>>;
  const flag = (key: LegacyPushPreferenceGroup): boolean => {
    const value = source[key];
    return typeof value === 'boolean' ? value : LEGACY_CATEGORY_DEFAULTS[key];
  };
  const tasks = flag('approvals') || flag('task_updates') || flag('errors');
  return {
    chat_replies: flag('task_updates'),
    tasks,
    scheduled_tasks: tasks,
    research: tasks,
    code: tasks,
    product_updates: DEFAULT_CATEGORY_ENABLED.product_updates,
    product: flag('status'),
    usage_resets: DEFAULT_CATEGORY_ENABLED.usage_resets,
  };
}

export function addSeparatedPushGroups(current: unknown): Record<PushPreferenceGroup, boolean> {
  if (current === null || typeof current !== 'object' || Array.isArray(current)) {
    return { ...DEFAULT_CATEGORY_ENABLED };
  }
  const source = current as Partial<Record<PushPreferenceGroup, unknown>>;
  const flag = (key: PushPreferenceGroup): boolean => {
    const value = source[key];
    return typeof value === 'boolean' ? value : DEFAULT_CATEGORY_ENABLED[key];
  };
  return {
    chat_replies: flag('chat_replies'),
    tasks: flag('tasks'),
    scheduled_tasks:
      typeof source.scheduled_tasks === 'boolean' ? source.scheduled_tasks : flag('tasks'),
    research: flag('tasks'),
    code: flag('tasks'),
    product_updates: flag('product_updates'),
    product: flag('product'),
    usage_resets: flag('usage_resets'),
  };
}

export function addResearchAndCodeGroups(current: unknown): Record<PushPreferenceGroup, boolean> {
  const groups = addSeparatedPushGroups(current);
  const source =
    current !== null && typeof current === 'object' && !Array.isArray(current)
      ? (current as Partial<Record<PushPreferenceGroup, unknown>>)
      : {};
  return {
    ...groups,
    research: typeof source.research === 'boolean' ? source.research : groups.tasks,
    code: typeof source.code === 'boolean' ? source.code : groups.tasks,
  };
}

function migrateQuietHours(quiet: Partial<QuietHours>): QuietHours {
  return {
    enabled: quiet.enabled === true,
    days: Array.isArray(quiet.days) && quiet.days.length > 0 ? quiet.days : ALL_WEEKDAYS,
    startTime: quiet.startTime ?? '22:00',
    endTime: quiet.endTime ?? '08:00',
    timezone: quiet.timezone ?? deviceTimezone(),
  };
}

export function migrateNotificationPrefs(persisted: unknown, version: number): unknown {
  if (persisted === null || typeof persisted !== 'object') return persisted;
  let state = persisted as Record<string, unknown>;
  if (version < 1) {
    const quiet = state['quietHours'];
    if (quiet !== null && typeof quiet === 'object') {
      state = { ...state, quietHours: migrateQuietHours(quiet as Partial<QuietHours>) };
    }
  }
  if (version < 2) {
    state = { ...state, categoryEnabled: migrateLegacyCategoryEnabled(state['categoryEnabled']) };
  }
  if (version < 4) {
    state = { ...state, categoryEnabled: addSeparatedPushGroups(state['categoryEnabled']) };
  }
  if (version < 5) {
    state = {
      ...state,
      categoryEnabled: addResearchAndCodeGroups(state['categoryEnabled']),
      announcedPushGroups: [],
    };
  }
  return state;
}

export function shouldNotifyWithPreferences(
  type: NotificationEventType,
  preferences: Pick<NotificationPrefsState, 'categoryEnabled' | 'quietHours'> &
    Partial<Pick<NotificationPrefsState, 'announcedPushGroups'>>,
  now: Date,
): boolean {
  const category = getCategoryForType(type, preferences.announcedPushGroups ?? []);
  if (!preferences.categoryEnabled[category]) return false;

  if (
    !QUIET_HOURS_EXEMPT_EVENT_TYPES.includes(type) &&
    isDateWithinQuietHours(now, preferences.quietHours)
  ) {
    return false;
  }

  return true;
}

export const useNotificationPrefsStore = create<NotificationPrefsState>()(
  persist(
    (set, get) => ({
      categoryEnabled: { ...DEFAULT_CATEGORY_ENABLED },
      vibrationEnabled: {
        critical: true,
        high: true,
        normal: false,
        low: false,
      },
      quietHours: {
        enabled: false,
        days: ALL_WEEKDAYS,
        startTime: '22:00',
        endTime: '08:00',
        timezone: deviceTimezone(),
      },
      breakReminderMinutes: null,
      announcedPushGroups: [],

      setCategoryEnabled: (category, enabled) => {
        set((state) => ({
          categoryEnabled: { ...state.categoryEnabled, [category]: enabled },
        }));
      },

      setVibrationEnabled: (priority, enabled) => {
        set((state) => ({
          vibrationEnabled: { ...state.vibrationEnabled, [priority]: enabled },
        }));
      },

      setQuietHours: (updates) => {
        set((state) => ({
          quietHours: { ...state.quietHours, ...updates },
        }));
      },

      setBreakReminderMinutes: (minutes) => {
        set({ breakReminderMinutes: minutes });
      },

      applyTimeFocusPreferences: (preferences) => {
        set({
          quietHours: preferences.quietHours,
          breakReminderMinutes: preferences.breakReminderMinutes,
        });
      },

      notePushTypeReceived: (type) => {
        const group = announcedGroupForType(type);
        if (!group) return;
        const announce = () =>
          set((state) =>
            state.announcedPushGroups.includes(group)
              ? state
              : {
                  announcedPushGroups: [...state.announcedPushGroups, group],
                  categoryEnabled: {
                    ...state.categoryEnabled,
                    [group]: state.categoryEnabled.tasks,
                  },
                },
          );
        const { persist: storage } = useNotificationPrefsStore;
        if (storage.hasHydrated()) {
          announce();
          return;
        }
        const unsubscribe = storage.onFinishHydration(() => {
          unsubscribe();
          announce();
        });
      },

      shouldNotify: (type: NotificationEventType): boolean => {
        if (
          !useNotificationPrefsStore.persist.hasHydrated() &&
          !QUIET_HOURS_EXEMPT_EVENT_TYPES.includes(type)
        ) {
          return false;
        }
        return shouldNotifyWithPreferences(type, get(), new Date());
      },
    }),
    {
      name: 'notification-prefs-store',
      storage: createJSONStorage(() => mmkvStorage),
      version: 5,
      migrate: (persisted, version) =>
        migrateNotificationPrefs(persisted, version) as NotificationPrefsState,
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[notificationPrefsStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useNotificationPrefsStore, 'notification-prefs-store');
