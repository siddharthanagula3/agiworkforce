import { useEffect } from 'react';
import { useUnifiedAuthStore, selectHasCloudAccountSession } from '../../stores/auth';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import { useCloudTaskBadgeStore } from '../../stores/cloudTaskBadgeStore';

const POLL_INTERVAL_MS = 60_000;

export function useCloudTaskBadge(): { needsUserCount: number } {
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const hasCloudSession = useUnifiedAuthStore(selectHasCloudAccountSession);
  const needsUserCount = useCloudTaskBadgeStore((state) => state.needsUserCount);
  const cloudSessionEpoch = useUnifiedAuthStore((state) => state.cloudSessionEpoch);

  useEffect(() => {
    const { refresh, reset } = useCloudTaskBadgeStore.getState();

    if (privacyMode !== 'managed' || !hasCloudSession) {
      reset();
      return;
    }

    let cancelled = false;
    const poll = () => {
      if (!cancelled) void refresh();
    };

    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    window.addEventListener('focus', poll);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', poll);
    };
  }, [privacyMode, hasCloudSession, cloudSessionEpoch]);

  return { needsUserCount };
}
