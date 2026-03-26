/**
 * Desktop liveness polling service.
 *
 * Periodically queries the `surface_heartbeats` table for the desktop row
 * and updates `desktopStatusStore.isOnline` based on whether the heartbeat
 * is fresh (within 90 seconds of now).
 *
 * This complements the Realtime subscription in `dispatchRealtime.ts` —
 * polling catches cases where the Realtime channel reconnects after a gap
 * and the latest heartbeat UPDATE was missed.
 */

import { AppState } from 'react-native';
import { supabase } from './supabase';
import { useDesktopStatusStore } from '@/stores/desktopStatusStore';

/** How often to poll for desktop liveness (ms). */
const POLL_INTERVAL_MS = 30_000;

/** A heartbeat older than this is considered stale (ms). */
const STALE_THRESHOLD_MS = 90_000;

/**
 * Fetch the desktop heartbeat row and update the status store.
 */
async function checkDesktopHeartbeat(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return;

  try {
    // surface_heartbeats is not in the generated DB types yet — cast to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data: row } = await client
      .from('surface_heartbeats')
      .select('last_seen_at')
      .eq('user_id', userId)
      .eq('surface_id', 'desktop')
      .maybeSingle();

    if (!row || !row.last_seen_at) {
      useDesktopStatusStore.getState().setOnline(false);
      return;
    }

    const lastSeenAt = row.last_seen_at as string;
    const age = Date.now() - new Date(lastSeenAt).getTime();
    const isFresh = age < STALE_THRESHOLD_MS;

    useDesktopStatusStore.getState().setLastSeen(lastSeenAt);
    useDesktopStatusStore.getState().setOnline(isFresh);
  } catch {
    // Non-fatal — table may not be migrated in all environments
  }
}

/**
 * Start polling the desktop heartbeat.
 * Performs an initial check immediately, then repeats every 30 seconds.
 *
 * @returns Cleanup function — call when the companion screen unmounts.
 */
export function startDesktopStatusPolling(): () => void {
  void checkDesktopHeartbeat();

  let intervalId: ReturnType<typeof setInterval> | null = setInterval(() => {
    void checkDesktopHeartbeat();
  }, POLL_INTERVAL_MS);

  // Pause polling when app is backgrounded to save battery
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'background' && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    } else if (state === 'active' && intervalId === null) {
      void checkDesktopHeartbeat();
      intervalId = setInterval(() => {
        void checkDesktopHeartbeat();
      }, POLL_INTERVAL_MS);
    }
  });

  return () => {
    if (intervalId !== null) clearInterval(intervalId);
    appStateSubscription.remove();
  };
}
