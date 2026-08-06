/**
 * Keeps the Tasks nav badge current for Managed Cloud sessions.
 *
 * Cloud agent runs are durable — they continue with Desktop closed — so the
 * only way the nav can tell you a run is waiting is to ask. This polls on
 * mount, whenever the window regains focus (the moment a returning user is
 * most likely to be out of date), and on a slow interval as a backstop.
 *
 * Local and signed-out sessions never poll and the count is cleared, so a
 * badge from a previous cloud session cannot survive a mode switch.
 */
import { useEffect } from 'react';
import { useUnifiedAuthStore, selectHasCloudAccountSession } from '../../stores/auth';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import { useCloudTaskBadgeStore } from '../../stores/cloudTaskBadgeStore';

/** Slow enough to be invisible on the wire, fast enough to matter on return. */
const POLL_INTERVAL_MS = 60_000;

export function useCloudTaskBadge(): { needsUserCount: number } {
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const hasCloudSession = useUnifiedAuthStore(selectHasCloudAccountSession);
  const needsUserCount = useCloudTaskBadgeStore((state) => state.needsUserCount);
  // The account epoch changes on sign-in/sign-out/account switch; re-running on
  // it means a new account never inherits the previous one's count.
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
