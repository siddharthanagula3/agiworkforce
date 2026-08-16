import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { NotificationEventType } from '@/services/notifications';
import {
  isDateWithinQuietHours,
  type BreakReminderMinutes,
  type QuietHoursPreferences,
  type TimeFocusPreferences,
  type TimeFocusWeekday,
} from '@agiworkforce/types';

export type NotificationCategory = 'approvals' | 'task_updates' | 'errors' | 'status';

export type QuietHours = QuietHoursPreferences;

export const ALL_WEEKDAYS: readonly TimeFocusWeekday[] = [0, 1, 2, 3, 4, 5, 6];

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface NotificationPrefsState {
  categoryEnabled: Record<NotificationCategory, boolean>;
  vibrationEnabled: Record<'critical' | 'high' | 'normal' | 'low', boolean>;
  quietHours: QuietHours;
  breakReminderMinutes: BreakReminderMinutes | null;

  setCategoryEnabled: (category: NotificationCategory, enabled: boolean) => void;
  setVibrationEnabled: (priority: 'critical' | 'high' | 'normal' | 'low', enabled: boolean) => void;
  setQuietHours: (quietHours: Partial<QuietHours>) => void;
  setBreakReminderMinutes: (minutes: BreakReminderMinutes | null) => void;
  applyTimeFocusPreferences: (preferences: TimeFocusPreferences) => void;

  shouldNotify: (type: NotificationEventType) => boolean;
}

export function getCategoryForType(type: NotificationEventType): NotificationCategory {
  switch (type) {
    case 'agent_approval_needed':
    case 'approval_pending_escalation':
      return 'approvals';
    case 'task_completed':
    case 'agent_paused':
    case 'schedule_triggered':
    case 'companion_connected':
    case 'chat_message':
      return 'task_updates';
    case 'agent_failed':
    case 'emergency_stop_triggered':
      return 'errors';
    case 'status_update':
    case 'heartbeat_info':
      return 'status';
    default:
      return 'task_updates';
  }
}

export function shouldNotifyWithPreferences(
  type: NotificationEventType,
  preferences: Pick<NotificationPrefsState, 'categoryEnabled' | 'quietHours'>,
  now: Date,
): boolean {
  const category = getCategoryForType(type);
  if (!preferences.categoryEnabled[category]) return false;

  const isCritical =
    type === 'agent_failed' ||
    type === 'emergency_stop_triggered' ||
    type === 'agent_approval_needed' ||
    type === 'approval_pending_escalation';
  if (!isCritical && isDateWithinQuietHours(now, preferences.quietHours)) {
    return false;
  }

  return true;
}

export const useNotificationPrefsStore = create<NotificationPrefsState>()(
  persist(
    (set, get) => ({
      categoryEnabled: {
        approvals: true,
        task_updates: true,
        errors: true,
        status: false,
      },
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
      version: 1,
      migrate: (persisted, version) => {
        if (version >= 1 || persisted === null || typeof persisted !== 'object') return persisted;
        const state = persisted as { quietHours?: Partial<QuietHours> };
        const quiet = state.quietHours;
        if (!quiet) return persisted;
        return {
          ...state,
          quietHours: {
            enabled: quiet.enabled === true,
            days: Array.isArray(quiet.days) && quiet.days.length > 0 ? quiet.days : ALL_WEEKDAYS,
            startTime: quiet.startTime ?? '22:00',
            endTime: quiet.endTime ?? '08:00',
            timezone: quiet.timezone ?? deviceTimezone(),
          },
        };
      },
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[notificationPrefsStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useNotificationPrefsStore, 'notification-prefs-store');
