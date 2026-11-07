'use client';

import { useEffect, useState } from 'react';
import { isDesktopHost } from '@/features/desktop-host/lib/host';
import { isWebPushSupported, readBrowserNotificationPermission } from '../lib/web-push-client';

type PermissionState = NotificationPermission | 'checking' | 'unsupported' | 'desktop';

const PERMISSION_COPY: Record<PermissionState, { label: string; detail: string }> = {
  checking: { label: 'Checking', detail: 'Checking this browser’s notification support.' },
  default: {
    label: 'Not allowed yet',
    detail: 'Browser alerts need notification permission for this site.',
  },
  denied: {
    label: 'Blocked',
    detail: 'Allow notifications for this site in your browser settings to receive alerts here.',
  },
  granted: {
    label: 'Allowed',
    detail: 'Permission is allowed. Browser push also needs an active registration.',
  },
  unsupported: { label: 'Unavailable', detail: 'This browser cannot display notifications.' },
  desktop: {
    label: 'System settings',
    detail: 'The desktop app uses your operating system’s notification settings.',
  },
};

export function BrowserNotificationStatus({ id }: { id: string }) {
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [pushSupported, setPushSupported] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setPermission(
        isDesktopHost() ? 'desktop' : (readBrowserNotificationPermission() ?? 'unsupported'),
      );
      setPushSupported(isWebPushSupported());
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const copy = PERMISSION_COPY[permission];
  return (
    <div
      id={id}
      role="note"
      aria-label="Browser delivery status"
      aria-live="polite"
      className="rounded-md border border-[var(--settings-border)] p-3 text-xs text-[var(--text-3)]"
    >
      <p className="m-0 font-medium text-[var(--text-1)]">Browser delivery: {copy.label}</p>
      <p className="mb-0 mt-1">{copy.detail}</p>
      {permission === 'granted' && !pushSupported ? (
        <p className="mb-0 mt-1">
          Browser push is unavailable here; Reply ready can still use browser popups.
        </p>
      ) : null}
      <p className="mb-0 mt-1">
        Applies to Reply ready, browser Usage alerts and Agent run updates. Saved channels are kept;
        email and mobile delivery are separate.
      </p>
    </div>
  );
}
