import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import { getDateKeyInTimeZone, getQuietHoursWindowKey } from '@agiworkforce/types';

import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import { useFocusActivityStore } from './focusActivityStore';
import { useTimeFocusSync } from './useTimeFocusSync';

const ACTIVE_TICK_MS = 15_000;
const MAX_RECORDED_TICK_MS = 60_000;

function showReminder(title: string, message: string, onClose: () => void) {
  Alert.alert(title, message, [{ text: 'Continue in AGI', onPress: onClose }], {
    cancelable: true,
    onDismiss: onClose,
  });
}

export function TimeFocusReminder() {
  useTimeFocusSync();
  const quietHours = useNotificationPrefsStore((state) => state.quietHours);
  const breakReminderMinutes = useNotificationPrefsStore((state) => state.breakReminderMinutes);
  const showingRef = useRef(false);
  const release = useCallback(() => {
    showingRef.current = false;
  }, []);

  useEffect(() => {
    const checkQuietHours = (status: AppStateStatus) => {
      if (status !== 'active' || showingRef.current) return;
      const windowKey = getQuietHoursWindowKey(new Date(), quietHours);
      const focus = useFocusActivityStore.getState();
      if (!windowKey || focus.quietWindowAcknowledged === windowKey) return;
      showingRef.current = true;
      focus.acknowledgeQuietWindow(windowKey);
      showReminder(
        'Quiet hours are active',
        'You set this time aside. You can continue whenever you choose, this is a reminder, not a lock.',
        release,
      );
    };
    checkQuietHours(AppState.currentState);
    const subscription = AppState.addEventListener('change', checkQuietHours);
    return () => subscription.remove();
  }, [quietHours, release]);

  useEffect(() => {
    if (breakReminderMinutes === null) return;
    let lastTickAt = Date.now();

    const recordActiveTime = () => {
      const nowMs = Date.now();
      const elapsedMs = Math.max(0, Math.min(nowMs - lastTickAt, MAX_RECORDED_TICK_MS));
      lastTickAt = nowMs;
      if (AppState.currentState !== 'active' || elapsedMs === 0) return;
      const dateKey = getDateKeyInTimeZone(new Date(nowMs), quietHours.timezone);
      if (!dateKey) return;
      const focus = useFocusActivityStore.getState();
      const activeMs = focus.recordActive(dateKey, elapsedMs);
      if (
        showingRef.current ||
        activeMs < breakReminderMinutes * 60_000 ||
        useFocusActivityStore.getState().dismissedBreakMinutes === breakReminderMinutes
      ) {
        return;
      }
      showingRef.current = true;
      focus.dismissBreak(dateKey, breakReminderMinutes);
      showReminder(
        'Time for a break?',
        `You have spent about ${breakReminderMinutes} minutes in AGI today. Step away if that would help.`,
        release,
      );
    };

    const interval = setInterval(recordActiveTime, ACTIVE_TICK_MS);
    const subscription = AppState.addEventListener('change', () => {
      lastTickAt = Date.now();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [breakReminderMinutes, quietHours.timezone, release]);

  return null;
}
