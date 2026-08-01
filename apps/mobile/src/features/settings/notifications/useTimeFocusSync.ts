/**
 * Keeps mobile quiet hours and break reminders in step with the account.
 *
 * Web stores both under the shared `time-focus` preference namespace, and the
 * contract in @agiworkforce/types documents itself as the evaluator for
 * "browser and native notification consumers" — but mobile never read or wrote
 * the namespace. A schedule set on web did nothing here, and vice versa.
 *
 * TRUST BOUNDARY: this is an ACCOUNT setting, so it only syncs in Cloud Mode.
 * In Local Mode the device-local store stays authoritative and nothing is sent.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TIME_FOCUS_PREFERENCES_NAMESPACE,
  defaultTimeFocusPreferences,
  normalizeTimeFocusPreferences,
  type TimeFocusPreferences,
} from '@agiworkforce/types';

import { fetchPreferenceNamespace, savePreferenceNamespace } from '@/services/preferences';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';

export type TimeFocusSyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

interface TimeFocusSync {
  status: TimeFocusSyncStatus;
  /** Present only when a load or save failed. */
  error: string | null;
  /**
   * Push the current local slice to the account. A no-op outside Cloud Mode, so
   * callers can invoke it unconditionally after any edit.
   */
  push: () => void;
}

export function useTimeFocusSync(): TimeFocusSync {
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const applyTimeFocusPreferences = useNotificationPrefsStore(
    (state) => state.applyTimeFocusPreferences,
  );

  const isCloud = appMode === 'cloud' && isClerkSignedIn;
  const [status, setStatus] = useState<TimeFocusSyncStatus>(isCloud ? 'loading' : 'local');
  const [error, setError] = useState<string | null>(null);
  // A save scheduled while an earlier one is still in flight replaces it rather
  // than queueing, so rapid toggling sends one final state instead of a burst.
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isCloud) {
      setStatus('local');
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);

    void (async () => {
      try {
        const stored = await fetchPreferenceNamespace(TIME_FOCUS_PREFERENCES_NAMESPACE);
        if (cancelled) return;
        const { quietHours } = useNotificationPrefsStore.getState();
        // The account is authoritative in Cloud Mode, but a never-configured
        // namespace must not wipe a schedule the user set on this device — so
        // the device timezone is the fallback and normalize decides the rest.
        applyTimeFocusPreferences(normalizeTimeFocusPreferences(stored, quietHours.timezone));
        setStatus('synced');
      } catch (caught) {
        if (cancelled) return;
        setStatus('error');
        setError(caught instanceof Error ? caught.message : 'Could not load time and focus.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyTimeFocusPreferences, isCloud]);

  useEffect(() => {
    return () => {
      if (pendingSave.current) clearTimeout(pendingSave.current);
    };
  }, []);

  const push = useCallback(() => {
    if (!isCloud) return;
    if (pendingSave.current) clearTimeout(pendingSave.current);

    pendingSave.current = setTimeout(() => {
      pendingSave.current = null;
      const { quietHours, breakReminderMinutes } = useNotificationPrefsStore.getState();
      const preferences: TimeFocusPreferences = normalizeTimeFocusPreferences(
        { quietHours, breakReminderMinutes },
        quietHours.timezone,
      );

      setStatus('saving');
      setError(null);
      void savePreferenceNamespace(TIME_FOCUS_PREFERENCES_NAMESPACE, preferences)
        .then(() => setStatus('synced'))
        .catch((caught: unknown) => {
          setStatus('error');
          setError(caught instanceof Error ? caught.message : 'Could not save time and focus.');
        });
    }, 600);
  }, [isCloud]);

  return { status, error, push };
}

/** Exposed for callers that need the account default without importing the contract. */
export function defaultsForTimezone(timezone: string): TimeFocusPreferences {
  return defaultTimeFocusPreferences(timezone);
}
