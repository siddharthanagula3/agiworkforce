'use client';

import { useEffect, useState } from 'react';
import { ButtonRow } from '@/features/marketing/components/system';

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
    <div className="agi-ds-stack" data-gap="tight" role="status" aria-live="polite">
      <p className="agi-ds-prose" data-size="sm">
        {online === null
          ? 'Checking your connection…'
          : online
            ? 'Your connection is back. Retry to pick up where you left off.'
            : 'Still no connection. This page updates on its own when the network returns.'}
      </p>
      <ButtonRow>
        <button
          type="button"
          className="agi-ds-btn"
          data-variant="primary"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </ButtonRow>
    </div>
  );
}
