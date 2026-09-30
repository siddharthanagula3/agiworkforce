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
export type PushPreferenceGroup = 'chat_replies' | 'tasks' | 'product';

export const DEFAULT_CATEGORY_ENABLED: Readonly<Record<PushPreferenceGroup, boolean>> = {
  chat_replies: true,
  tasks: true,
  product: false,
};

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

  setCategoryEnabled: (category: PushPreferenceGroup, enabled: boolean) => void;
  setVibrationEnabled: (priority: 'critical' | 'high' | 'normal' | 'low', enabled: boolean) => void;
  setQuietHours: (quietHours: Partial<QuietHours>) => void;
  setBreakReminderMinutes: (minutes: BreakReminderMinutes | null) => void;
  applyTimeFocusPreferences: (preferences: TimeFocusPreferences) => void;

  shouldNotify: (type: NotificationEventType) => boolean;
}

export function getCategoryForType(type: NotificationEventType): PushPreferenceGroup {
  switch (type) {
    case 'chat_message':
      return 'chat_replies';
    case 'agent_approval_needed':
    case 'approval_pending_escalation':
    case 'task_completed':
    case 'agent_failed':
    case 'emergency_stop_triggered':
    case 'agent_paused':
    case 'schedule_run':
    case 'schedule_triggered':
    case 'companion_connected':
      return 'tasks';
    case 'status_update':
    case 'heartbeat_info':
      return 'product';
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
  return {
    chat_replies: flag('task_updates'),
    tasks: flag('approvals') || flag('task_updates') || flag('errors'),
    product: flag('status'),
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
  return state;
}

export function shouldNotifyWithPreferences(
  type: NotificationEventType,
  preferences: Pick<NotificationPrefsState, 'categoryEnabled' | 'quietHours'>,
  now: Date,
): boolean {
  const category = getCategoryForType(type);
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

      shouldNotify: (type: NotificationEventType): boolean => {
        return shouldNotifyWithPreferences(type, get(), new Date());
      },
    }),
    {
      name: 'notification-prefs-store',
      storage: createJSONStorage(() => mmkvStorage),
      version: 2,
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
