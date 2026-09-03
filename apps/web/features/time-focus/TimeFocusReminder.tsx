'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@agiworkforce/ui';
import {
  BREAK_REMINDER_MINUTES,
  TIME_FOCUS_PREFERENCES_NAMESPACE,
  defaultTimeFocusPreferences,
  getDateKeyInTimeZone,
  getQuietHoursWindowKey,
  normalizeTimeFocusPreferences,
  type BreakReminderMinutes,
  type TimeFocusPreferences,
} from '@agiworkforce/types';
import { Coffee, Moon } from 'lucide-react';
import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';

const ACTIVITY_STORAGE_PREFIX = 'agi:time-focus:activity:v1:';
const QUIET_DISMISSAL_PREFIX = 'agi:time-focus:quiet:v1:';
const DEFAULT_ACTIVE_TICK_MS = 15_000;
const MAX_RECORDED_TICK_MS = 60_000;
const MAX_DAILY_ACTIVE_MS = 24 * 60 * 60_000;

export interface FocusActivity {
  dateKey: string;
  activeMs: number;
  dismissedBreakMinutes: BreakReminderMinutes | null;
}

type ReminderKind = 'quiet-hours' | 'break';

export function focusActivityStorageKey(userId: string): string {
  return `${ACTIVITY_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function emptyFocusActivity(dateKey: string): FocusActivity {
  return { dateKey, activeMs: 0, dismissedBreakMinutes: null };
}

export function readFocusActivity(
  storage: Pick<Storage, 'getItem'>,
  userId: string,
  dateKey: string,
): FocusActivity {
  try {
    const raw = storage.getItem(focusActivityStorageKey(userId));
    if (!raw) return emptyFocusActivity(dateKey);
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return emptyFocusActivity(dateKey);
    }
    const record = value as Record<string, unknown>;
    if (record['dateKey'] !== dateKey) return emptyFocusActivity(dateKey);
    const activeMs = record['activeMs'];
    const dismissed = record['dismissedBreakMinutes'];
    return {
      dateKey,
      activeMs:
        typeof activeMs === 'number' && Number.isFinite(activeMs) && activeMs >= 0
          ? Math.min(activeMs, MAX_DAILY_ACTIVE_MS)
          : 0,
      dismissedBreakMinutes: BREAK_REMINDER_MINUTES.includes(dismissed as BreakReminderMinutes)
        ? (dismissed as BreakReminderMinutes)
        : null,
    };
  } catch {
    return emptyFocusActivity(dateKey);
  }
}

function writeFocusActivity(
  storage: Pick<Storage, 'setItem'>,
  userId: string,
  value: FocusActivity,
) {
  try {
    storage.setItem(focusActivityStorageKey(userId), JSON.stringify(value));
  } catch {
    // Browser privacy/storage restrictions should disable the reminder, never chat.
  }
}

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function quietDismissalKey(userId: string, windowKey: string): string {
  return `${QUIET_DISMISSAL_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(windowKey)}`;
}

export interface TimeFocusReminderProps {
  userId: string | null | undefined;
  onLeave: () => void;
  activeTickMs?: number;
}

export function TimeFocusReminder({
  userId,
  onLeave,
  activeTickMs = DEFAULT_ACTIVE_TICK_MS,
}: TimeFocusReminderProps) {
  const [preferences, setPreferences] = useState<TimeFocusPreferences | null>(null);
  const [reminder, setReminder] = useState<ReminderKind | null>(null);
  const reminderRef = useRef<ReminderKind | null>(null);
  const quietWindowKeyRef = useRef<string | null>(null);

  useEffect(() => {
    reminderRef.current = reminder;
  }, [reminder]);

  useEffect(() => {
    if (!userId) {
      setPreferences(null);
      setReminder(null);
      return;
    }
    let cancelled = false;
    const timezone = browserTimezone();
    const defaults = defaultTimeFocusPreferences(timezone);
    fetchPreferenceNamespace<TimeFocusPreferences>(TIME_FOCUS_PREFERENCES_NAMESPACE, defaults)
      .then((value) => {
        if (!cancelled) setPreferences(normalizeTimeFocusPreferences(value, timezone));
      })
      .catch(() => {
        if (!cancelled) setPreferences(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!preferences || !userId) return;
    const windowKey = getQuietHoursWindowKey(new Date(), preferences.quietHours);
    quietWindowKeyRef.current = windowKey;
    if (!windowKey) return;
    try {
      if (sessionStorage.getItem(quietDismissalKey(userId, windowKey)) === '1') return;
    } catch {
      // Session storage unavailable: still show the nudge once for this mount.
    }
    setReminder('quiet-hours');
  }, [preferences, userId]);

  useEffect(() => {
    if (!preferences || !userId) return;
    const thresholdMinutes = preferences.breakReminderMinutes;
    if (thresholdMinutes === null) return;
    const tickMs = Math.max(1_000, Math.min(activeTickMs, MAX_RECORDED_TICK_MS));
    let lastTickAt = Date.now();

    const resetTickOrigin = () => {
      lastTickAt = Date.now();
    };
    const recordVisibleTime = () => {
      const nowMs = Date.now();
      const elapsedMs = Math.max(0, Math.min(nowMs - lastTickAt, MAX_RECORDED_TICK_MS));
      lastTickAt = nowMs;
      if (document.visibilityState !== 'visible' || elapsedMs === 0) return;
      const dateKey = getDateKeyInTimeZone(new Date(nowMs), preferences.quietHours.timezone);
      if (!dateKey) return;
      const current = readFocusActivity(localStorage, userId, dateKey);
      const next: FocusActivity = {
        ...current,
        activeMs: Math.min(MAX_DAILY_ACTIVE_MS, current.activeMs + elapsedMs),
      };
      writeFocusActivity(localStorage, userId, next);
      if (
        reminderRef.current === null &&
        next.activeMs >= thresholdMinutes * 60_000 &&
        next.dismissedBreakMinutes !== thresholdMinutes
      ) {
        setReminder('break');
      }
    };

    const interval = window.setInterval(recordVisibleTime, tickMs);
    document.addEventListener('visibilitychange', resetTickOrigin);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resetTickOrigin);
    };
  }, [activeTickMs, preferences, userId]);

  const continueInAgi = useCallback(() => {
    if (!preferences || !userId || !reminderRef.current) return;
    if (reminderRef.current === 'quiet-hours' && quietWindowKeyRef.current) {
      try {
        sessionStorage.setItem(quietDismissalKey(userId, quietWindowKeyRef.current), '1');
      } catch {
        // The current mount still closes even when session storage is unavailable.
      }
    }
    if (reminderRef.current === 'break' && preferences.breakReminderMinutes !== null) {
      const dateKey = getDateKeyInTimeZone(new Date(), preferences.quietHours.timezone);
      if (dateKey) {
        const current = readFocusActivity(localStorage, userId, dateKey);
        writeFocusActivity(localStorage, userId, {
          ...current,
          dismissedBreakMinutes: preferences.breakReminderMinutes,
        });
      }
    }
    reminderRef.current = null;
    setReminder(null);
  }, [preferences, userId]);

  const leaveForLater = useCallback(() => {
    continueInAgi();
    onLeave();
  }, [continueInAgi, onLeave]);

  const isQuietHours = reminder === 'quiet-hours';
  return (
    <AlertDialog open={reminder !== null} onOpenChange={(open) => !open && continueInAgi()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {isQuietHours ? (
              <Moon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Coffee className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <AlertDialogTitle>
            {isQuietHours ? 'Quiet hours are active' : 'Time for a break?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isQuietHours
              ? 'You set this time aside. You can continue whenever you choose, this is a reminder, not a lock.'
              : `You have spent about ${preferences?.breakReminderMinutes ?? 0} minutes in AGI today. Step away if that would help.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={leaveForLater}>Come back later</AlertDialogCancel>
          <AlertDialogAction onClick={continueInAgi}>Continue in AGI</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
