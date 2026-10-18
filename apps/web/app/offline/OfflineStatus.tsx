'use client';

import type { CSSProperties } from 'react';
import { useOnlineStatus } from '@agiworkforce/unified-chat';
import { ButtonRow, Prose } from '@/features/marketing/components/system';

const centeredStackStyle: CSSProperties = { alignItems: 'center' };

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

const KEPT_WORK = 'Nothing you had open was lost, and unsent messages stay in the composer.';

export function OfflineSummary() {
  const online = useOnlineStatus();

  return (
    <Prose>
      {online === true ? KEPT_WORK : `AGI Workforce cannot reach the network. ${KEPT_WORK}`}
    </Prose>
  );
}

export function OfflineCaptivePortalHint() {
  const online = useOnlineStatus();

  if (online === true) return null;

  return (
    <Prose size="sm">
      A captive portal (hotel, airport, or office Wi-Fi that wants a sign-in first) looks identical
      to being offline. Open any other site to see whether it redirects you to a login page; a VPN
      or corporate proxy that blocks our domains produces the same result.
    </Prose>
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
