/**
 * Notification Preferences Store
 *
 * Persists per-type notification toggles, quiet hours, and vibration
 * preferences. Used by the companion push notification wiring and the
 * notification preferences screen.
 */
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Which logical categories map to notification types that have an actual
 * Mobile/companion delivery contract. `task_updates` is the persisted key for
 * the user-facing Work Updates group and is retained for backwards-compatible
 * hydration.
 */
export type NotificationCategory = 'approvals' | 'task_updates' | 'errors' | 'status';

/**
 * Quiet hours use the shared cross-surface shape so a schedule set on web and
 * one set on mobile are the same object, evaluated by the same code. Mobile
 * previously stored only `{enabled, startTime, endTime}` and evaluated with the
 * day-blind `isMinuteWithinQuietHours`, so a weekends-only schedule saved on
 * web would have silenced mobile every day of the week.
 */
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
  /** Per-category toggles */
  categoryEnabled: Record<NotificationCategory, boolean>;
  /** Vibration per priority level */
  vibrationEnabled: Record<'critical' | 'high' | 'normal' | 'low', boolean>;
  /** Quiet hours configuration */
  quietHours: QuietHours;
  /** How often to nudge for a break, or null for never. Shared with web. */
  breakReminderMinutes: BreakReminderMinutes | null;

  setCategoryEnabled: (category: NotificationCategory, enabled: boolean) => void;
  setVibrationEnabled: (priority: 'critical' | 'high' | 'normal' | 'low', enabled: boolean) => void;
  setQuietHours: (quietHours: Partial<QuietHours>) => void;
  setBreakReminderMinutes: (minutes: BreakReminderMinutes | null) => void;
  /** Replace the shared time-and-focus slice wholesale (used when syncing from the account). */
  applyTimeFocusPreferences: (preferences: TimeFocusPreferences) => void;

  /** Returns true if the given event type should fire a notification right now */
  shouldNotify: (type: NotificationEventType) => boolean;
}

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

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

/** Uses the shared clock-window evaluator so native and Web boundaries cannot drift. */
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

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
      /**
       * v0 quiet hours had no `days` and no `timezone`, and were evaluated every
       * day. The shared shape treats an empty `days` list as "disabled", so
       * migrating a v0 schedule to `days: []` would silently switch quiet hours
       * OFF for anyone who had them on. Every day is the faithful reading of a
       * v0 schedule.
       */
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
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[notificationPrefsStore] Hydration failed:', error);
      },
    },
  ),
);

// FIX (audit 2026-05-20, §17): use the shared rehydrate helper.
// Audit 2026-06-13: align the rehydrate log label with the persisted MMKV key
// ('notification-prefs-store') so debug logs reference the actual storage key.
rehydrateWhenMmkvReady(useNotificationPrefsStore, 'notification-prefs-store');
