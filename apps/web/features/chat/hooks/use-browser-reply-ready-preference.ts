'use client';

import { useEffect, useState } from 'react';
import {
  fetchPreferenceNamespace,
  PREFERENCE_NAMESPACE_SAVED_EVENT,
  type PreferenceNamespaceSavedDetail,
} from '@/app/settings/_lib/preferences-client';

const NOTIFICATIONS_NAMESPACE = 'notifications';
const DEFAULT_BROWSER_REPLY_READY = true;

function readBrowserReplyReady(value: unknown): boolean | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)['browserReplyReady'];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

export function useBrowserReplyReadyPreference(): boolean {
  const [enabled, setEnabled] = useState(DEFAULT_BROWSER_REPLY_READY);

  useEffect(() => {
    let cancelled = false;
    void fetchPreferenceNamespace<{ browserReplyReady: boolean }>(NOTIFICATIONS_NAMESPACE, {
      browserReplyReady: DEFAULT_BROWSER_REPLY_READY,
    })
      .then((value) => {
        if (!cancelled) setEnabled(value.browserReplyReady);
      })
      .catch(() => {
        // Non-fatal: preserve the documented default when preferences cannot
        // be read, while the Settings surface reports its own load error.
      });

    function handleSavedPreference(event: Event) {
      const detail = (event as CustomEvent<PreferenceNamespaceSavedDetail>).detail;
      if (detail?.namespace !== NOTIFICATIONS_NAMESPACE) return;
      const next = readBrowserReplyReady(detail.value);
      if (next !== undefined) setEnabled(next);
    }

    window.addEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, handleSavedPreference);
    return () => {
      cancelled = true;
      window.removeEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, handleSavedPreference);
    };
  }, []);

  return enabled;
}
