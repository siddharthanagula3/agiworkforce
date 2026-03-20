/**
 * Notification Preferences Store
 *
 * Persists per-type notification toggles, quiet hours, and vibration
 * preferences. Used by the companion push notification wiring and the
 * notification preferences screen.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import type { NotificationEventType } from '@/services/notifications';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse "HH:MM" into total minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr ?? '0', 10);
  const m = parseInt(mStr ?? '0', 10);
  return h * 60 + m;
}

/**
 * Returns true if the current local time falls within [startTime, endTime].
 * Handles overnight ranges (e.g., 22:00 - 08:00).
 */
function isInQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);

  if (startMin <= endMin) {
    // Same-day range: e.g. 08:00 – 20:00
    return currentMinutes >= startMin && currentMinutes < endMin;
  }
  // Overnight range: e.g. 22:00 – 08:00
  return currentMinutes >= startMin || currentMinutes < endMin;
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
        const category = getCategoryForType(type);

        // Category must be enabled
        if (!state.categoryEnabled[category]) return false;

        // Quiet hours: suppress non-critical notifications
        if (state.quietHours.enabled) {
          const isCritical =
            type === 'agent_failed' ||
            type === 'emergency_stop_triggered' ||
            type === 'agent_approval_needed' ||
            type === 'approval_pending_escalation';

          if (!isCritical && isInQuietHours(state.quietHours.startTime, state.quietHours.endTime)) {
            return false;
          }
        }

        return true;
      },
    }),
    {
      name: 'notification-prefs-store',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
