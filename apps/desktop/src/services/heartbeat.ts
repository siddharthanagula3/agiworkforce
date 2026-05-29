/**
 * Desktop Surface Heartbeat Service
 *
 * Cloud surface heartbeats are handled by the API gateway/device-link path.
 * The desktop app must not write directly to the cloud database from the
 * frontend. This service keeps the lifecycle hook in place and avoids network
 * side effects until the Clerk-authenticated heartbeat endpoint is wired.
 */

const HEARTBEAT_INTERVAL_MS = 60_000;

async function sendHeartbeat(_userId: string): Promise<void> {
  // Intentionally no-op: desktop cloud heartbeat requires a Clerk-authenticated
  // server endpoint, not client-side database access.
}

export function startDesktopHeartbeat(userId: string): () => void {
  void sendHeartbeat(userId);

  const intervalId = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    void sendHeartbeat(userId);
  }, HEARTBEAT_INTERVAL_MS);

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
