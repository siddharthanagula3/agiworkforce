/**
 * Desktop Surface Heartbeat Service
 *
 * Upserts to `surface_heartbeats` with surface='desktop' on mount and every 60 s
 * while the app is active. Automatically stops when the document is hidden or
 * the cleanup function is called (app close / component unmount).
 *
 * The caller (App.tsx) calls startDesktopHeartbeat() once after auth resolves
 * and receives a cleanup function to call on unmount.
 */

import { getSupabase } from '../lib/supabase';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

async function sendHeartbeat(userId: string): Promise<void> {
  try {
    const supabase = getSupabase();
    const untypedClient = supabase as unknown as import('@supabase/supabase-js').SupabaseClient;

    // Skip if user has no active Supabase session (avoids 401 network errors).
    // Desktop uses device-link OAuth — Supabase JS session may not exist.
    const { data: sessionData } = await untypedClient.auth.getSession();
    if (!sessionData?.session?.access_token) return;

    await untypedClient.from('surface_heartbeats').upsert(
      {
        user_id: userId,
        surface_id: 'desktop',
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,surface_id' },
    );
  } catch {
    // Non-fatal — silently ignore
  }
}

/**
 * Start sending periodic heartbeats for the desktop surface.
 *
 * @param userId - Authenticated Supabase user ID
 * @returns Cleanup function — call this when the component unmounts or user signs out
 */
export function startDesktopHeartbeat(userId: string): () => void {
  // Send immediately on start
  void sendHeartbeat(userId);

  const intervalId = setInterval(() => {
    // Pause while the tab/window is hidden (app is backgrounded on macOS)
    if (document.visibilityState === 'hidden') return;
    void sendHeartbeat(userId);
  }, HEARTBEAT_INTERVAL_MS);

  // Also resume immediately when the document becomes visible again
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void sendHeartbeat(userId);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
