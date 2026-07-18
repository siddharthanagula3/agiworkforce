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
import { isMinuteWithinQuietHours } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which logical categories map to which notification types */
export type NotificationCategory = 'approvals' | 'task_updates' | 'errors' | 'status';

export interface QuietHours {
  enabled: boolean;
  /** 24-hour format "HH:MM" */
  startTime: string;
  /** 24-hour format "HH:MM" */
  endTime: string;
}

export interface NotificationPrefsState {
  /** Per-category toggles */
  categoryEnabled: Record<NotificationCategory, boolean>;
  /** Vibration per priority level */
  vibrationEnabled: Record<'critical' | 'high' | 'normal' | 'low', boolean>;
  /** Quiet hours configuration */
  quietHours: QuietHours;

  setCategoryEnabled: (category: NotificationCategory, enabled: boolean) => void;
  setVibrationEnabled: (priority: 'critical' | 'high' | 'normal' | 'low', enabled: boolean) => void;
  setQuietHours: (quietHours: Partial<QuietHours>) => void;

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
  minuteOfDay: number,
): boolean {
  const category = getCategoryForType(type);
  if (!preferences.categoryEnabled[category]) return false;

  const isCritical =
    type === 'agent_failed' ||
    type === 'emergency_stop_triggered' ||
    type === 'agent_approval_needed' ||
    type === 'approval_pending_escalation';
  if (
    preferences.quietHours.enabled &&
    !isCritical &&
    isMinuteWithinQuietHours(
      minuteOfDay,
      preferences.quietHours.startTime,
      preferences.quietHours.endTime,
    )
  ) {
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
        startTime: '22:00',
        endTime: '08:00',
      },

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

      shouldNotify: (type: NotificationEventType): boolean => {
        const state = get();
        const now = new Date();
        return shouldNotifyWithPreferences(type, state, now.getHours() * 60 + now.getMinutes());
      },
    }),
    {
      name: 'notification-prefs-store',
      storage: createJSONStorage(() => mmkvStorage),
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
