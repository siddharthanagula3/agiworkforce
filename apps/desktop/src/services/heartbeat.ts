
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
