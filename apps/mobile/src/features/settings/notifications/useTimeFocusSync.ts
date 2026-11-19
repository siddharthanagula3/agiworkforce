import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TIME_FOCUS_PREFERENCES_NAMESPACE,
  normalizeTimeFocusPreferences,
  type TimeFocusPreferences,
} from '@agiworkforce/types';

import { fetchPreferenceNamespace, savePreferenceNamespace } from '@/services/preferences';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';

export type TimeFocusSyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

interface TimeFocusSync {
  status: TimeFocusSyncStatus;
  error: string | null;
  push: () => void;
}

interface TimeFocusOwner {
  account: CloudAccountEpoch;
  controller: AbortController;
  readController: AbortController;
  pendingSave: ReturnType<typeof setTimeout> | null;
}

let settlingSave: { ownerId: string; done: Promise<void> } | null = null;

function ownerIsCurrent(owner: TimeFocusOwner): boolean {
  const auth = useAuthStore.getState();
  return (
    !owner.controller.signal.aborted &&
    isCloudAccountEpochCurrent(owner.account) &&
    auth.isClerkLoaded &&
    auth.isClerkSignedIn &&
    auth.clerkUserId === owner.account.ownerId &&
    useChatAppModeStore.getState().appMode === 'cloud'
  );
}

export function useTimeFocusSync(): TimeFocusSync {
  const applyTimeFocusPreferences = useNotificationPrefsStore(
    (state) => state.applyTimeFocusPreferences,
  );
  const [status, setStatus] = useState<TimeFocusSyncStatus>('local');
  const [error, setError] = useState<string | null>(null);
  const ownerRef = useRef<TimeFocusOwner | null>(null);

  const send = useCallback((owner: TimeFocusOwner, announce: boolean) => {
    const { quietHours, breakReminderMinutes } = useNotificationPrefsStore.getState();
    const preferences: TimeFocusPreferences = normalizeTimeFocusPreferences(
      { quietHours, breakReminderMinutes },
      quietHours.timezone,
    );

    if (announce) {
      setStatus('saving');
      setError(null);
    }
    const saving = savePreferenceNamespace(TIME_FOCUS_PREFERENCES_NAMESPACE, preferences, {
      accountEpoch: owner.account,
      signal: owner.controller.signal,
    });
    const done = saving.then(
      () => undefined,
      () => undefined,
    );
    const record = { ownerId: owner.account.ownerId, done };
    settlingSave = record;
    void done.then(() => {
      if (settlingSave === record) settlingSave = null;
    });
    void saving
      .then(() => {
        if (ownerRef.current !== owner || !ownerIsCurrent(owner)) return;
        setStatus('synced');
      })
      .catch(() => {
        if (ownerRef.current !== owner || !ownerIsCurrent(owner)) return;
        setStatus('error');
        setError('Could not save time and focus settings. Check your connection and try again.');
      });
  }, []);

  useEffect(() => {
    const retire = (closing: boolean) => {
      const owner = ownerRef.current;
      ownerRef.current = null;
      if (!owner) return;
      owner.readController.abort();
      const flush = closing && owner.pendingSave !== null && ownerIsCurrent(owner);
      if (!closing) owner.controller.abort();
      if (owner.pendingSave !== null) clearTimeout(owner.pendingSave);
      owner.pendingSave = null;
      if (flush) send(owner, false);
    };
    const renew = () => {
      retire(false);
      setError(null);
      const account = captureCloudAccountEpoch();
      const owner: TimeFocusOwner | null = account
        ? {
            account,
            controller: new AbortController(),
            readController: new AbortController(),
            pendingSave: null,
          }
        : null;
      if (!owner || !ownerIsCurrent(owner)) {
        setStatus('local');
        return;
      }
      ownerRef.current = owner;
      setStatus('loading');
      void (async () => {
        try {
          if (settlingSave?.ownerId === owner.account.ownerId) await settlingSave.done;
          if (owner.readController.signal.aborted) return;
          const stored = await fetchPreferenceNamespace(TIME_FOCUS_PREFERENCES_NAMESPACE, {
            accountEpoch: owner.account,
            signal: owner.readController.signal,
          });
          if (ownerRef.current !== owner || !ownerIsCurrent(owner)) return;
          const { quietHours } = useNotificationPrefsStore.getState();
          applyTimeFocusPreferences(normalizeTimeFocusPreferences(stored, quietHours.timezone));
          setStatus('synced');
        } catch {
          if (ownerRef.current !== owner || !ownerIsCurrent(owner)) return;
          setStatus('error');
          setError('Could not load time and focus settings. Check your connection and try again.');
        }
      })();
    };
    // Observe transitions synchronously, including leave-and-return within one React batch.
    const stopAccount = subscribeCloudAccountEpochChange(renew);
    const stopAuth = useAuthStore.subscribe((next, previous) => {
      if (
        next.clerkUserId !== previous.clerkUserId ||
        next.isClerkSignedIn !== previous.isClerkSignedIn ||
        next.isClerkLoaded !== previous.isClerkLoaded
      ) {
        renew();
      }
    });
    const stopMode = useChatAppModeStore.subscribe((next, previous) => {
      if (next.appMode !== previous.appMode) renew();
    });
    renew();
    return () => {
      stopAccount();
      stopAuth();
      stopMode();
      retire(true);
    };
  }, [applyTimeFocusPreferences, send]);

  const push = useCallback(() => {
    const owner = ownerRef.current;
    if (!owner || !ownerIsCurrent(owner)) return;
    if (owner.pendingSave !== null) clearTimeout(owner.pendingSave);

    const timer = setTimeout(() => {
      if (owner.pendingSave !== timer || ownerRef.current !== owner || !ownerIsCurrent(owner)) {
        return;
      }
      owner.pendingSave = null;
      send(owner, true);
    }, 600);
    owner.pendingSave = timer;
  }, [send]);

  return { status, error, push };
}
