'use client';

import { useEffect, useState } from 'react';
import {
  fetchOwnedPreferenceNamespace,
  PREFERENCE_NAMESPACE_SAVED_EVENT,
  type PreferenceNamespaceSavedDetail,
  type PreferenceOwner,
} from '@/app/settings/_lib/preferences-client';
import {
  usePreferenceOwner,
  usePreferenceView,
} from '@/features/settings/hooks/use-preference-owner';
import { NOTIFICATION_DEFAULTS } from '@/features/settings/lib/notification-preferences';

const NOTIFICATIONS_NAMESPACE = 'notifications';
const DEFAULT_BROWSER_REPLY_READY = NOTIFICATION_DEFAULTS.browserReplyReady;

function readBrowserReplyReady(value: unknown): boolean | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)['browserReplyReady'];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

export function useBrowserReplyReadyPreference(): boolean {
  const owner = usePreferenceOwner();
  const capture = usePreferenceView(owner);
  const [view, setView] = useState<{ owner: PreferenceOwner; enabled: boolean } | null>(null);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    let revision = 0;
    const readRevision = revision;
    const viewCurrent = capture();
    const current = () => !cancelled && viewCurrent();
    void fetchOwnedPreferenceNamespace<{ browserReplyReady: boolean }>(
      owner,
      NOTIFICATIONS_NAMESPACE,
    )
      .then((value) => {
        if (current() && revision === readRevision) {
          setView({ owner, enabled: readBrowserReplyReady(value) ?? DEFAULT_BROWSER_REPLY_READY });
        }
      })
      .catch(() => {
        // Non-fatal: preserve the documented default when preferences cannot
        // be read, while the Settings surface reports its own load error.
      });

    const handleSavedPreference = (event: Event) => {
      const detail = (event as CustomEvent<PreferenceNamespaceSavedDetail>).detail;
      if (!current() || detail?.namespace !== NOTIFICATIONS_NAMESPACE) return;
      const next = readBrowserReplyReady(detail.value);
      if (next !== undefined) {
        revision += 1;
        setView({ owner, enabled: next });
      }
    };

    window.addEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, handleSavedPreference);
    return () => {
      cancelled = true;
      window.removeEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, handleSavedPreference);
    };
  }, [owner, capture]);

  return owner?.isCurrent() && view?.owner === owner ? view.enabled : DEFAULT_BROWSER_REPLY_READY;
}
