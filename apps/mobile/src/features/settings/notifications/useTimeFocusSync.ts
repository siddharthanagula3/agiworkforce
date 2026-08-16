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
  error: string | null;
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

export function defaultsForTimezone(timezone: string): TimeFocusPreferences {
  return defaultTimeFocusPreferences(timezone);
}
