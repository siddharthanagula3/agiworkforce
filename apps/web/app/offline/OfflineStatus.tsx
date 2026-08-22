'use client';

import { useEffect, useState } from 'react';

/**
 * Reports the live connection state rather than a static "you are offline",
 * because by the time someone reads this page the network has often already
 * come back, and a stale message sends them looking for a fault that is no
 * longer there.
 */
export function OfflineStatus() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <div className="agi-device-auth-note" role="status" aria-live="polite">
      {online === null
        ? 'Checking your connection…'
        : online
          ? 'Your connection is back. Retry to pick up where you left off.'
          : 'Still no connection. This page updates on its own when the network returns.'}
      <button
        type="button"
        className="agi-cta-primary agi-device-auth-submit"
        onClick={() => window.location.reload()}
      >
        Retry
      </button>
    </div>
  );
}
