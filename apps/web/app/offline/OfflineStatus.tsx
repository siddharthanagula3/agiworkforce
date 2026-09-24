'use client';

import type { CSSProperties } from 'react';
import { useOnlineStatus } from '@agiworkforce/unified-chat';
import { ButtonRow } from '@/features/marketing/components/system';

const centeredStackStyle: CSSProperties = { alignItems: 'center' };

/**
 * Reports the live connection state rather than a static "you are offline",
 * because by the time someone reads this page the network has often already
 * come back, and a stale message sends them looking for a fault that is no
 * longer there.
 */
export function OfflineHeading() {
  const online = useOnlineStatus();

  return (
    <h1 className="agi-ds-h1">
      {online === null
        ? 'Checking your connection.'
        : online
          ? 'You’re back online.'
          : 'You’re offline.'}
    </h1>
  );
}

export function OfflineStatus() {
  const online = useOnlineStatus();

  return (
    <div
      className="agi-ds-stack"
      data-gap="tight"
      role="status"
      aria-live="polite"
      style={centeredStackStyle}
    >
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
