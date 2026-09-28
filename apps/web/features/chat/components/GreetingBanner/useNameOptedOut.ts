'use client';

import { useEffect, useState } from 'react';
import {
  PREFERENCE_NAMESPACE_SAVED_EVENT,
  fetchStoredPreferenceNamespace,
  type PreferenceNamespaceSavedDetail,
} from '@/app/settings/_lib/preferences-client';

const IDENTITY_NAMESPACE = 'general';

function clearsPreferredName(value: unknown): boolean {
  const preferredName = (value as { preferredName?: unknown } | null)?.preferredName;
  return typeof preferredName === 'string' && preferredName.trim() === '';
}

export function useNameOptedOut(): boolean {
  const [optedOut, setOptedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStoredPreferenceNamespace(IDENTITY_NAMESPACE)
      .then((stored) => {
        if (!cancelled) setOptedOut(clearsPreferredName(stored));
      })
      .catch(() => undefined);
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<PreferenceNamespaceSavedDetail>).detail;
      if (detail?.namespace !== IDENTITY_NAMESPACE) return;
      const saved = detail.value;
      if (saved && typeof saved === 'object' && 'preferredName' in saved) {
        setOptedOut(clearsPreferredName(saved));
      }
    };
    window.addEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, listener);
    return () => {
      cancelled = true;
      window.removeEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, listener);
    };
  }, []);

  return optedOut;
}
