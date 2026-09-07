'use client';

import { useEffect, useState } from 'react';

import { GoogleAnalytics, setGoogleAnalyticsCollection } from './GoogleAnalytics';
import {
  COOKIE_CONSENT_UPDATED_EVENT,
  isAnalyticsAllowed,
  readCookiePreferences,
} from '@shared/lib/cookie-consent';

interface AnalyticsConsentGateProps {
  trackingId: string;
  nonce?: string;
}

export function AnalyticsConsentGate({ trackingId, nonce }: AnalyticsConsentGateProps) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    // Unmounting the tags does not unload a gtag.js that already ran, so the
    // measurement id's own collection switch is what stops the next event.
    const sync = () => {
      const nextAllowed = isAnalyticsAllowed(readCookiePreferences());
      setGoogleAnalyticsCollection(trackingId, nextAllowed);
      setAllowed(nextAllowed);
    };
    sync();

    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [trackingId]);

  if (!allowed) return null;

  return <GoogleAnalytics trackingId={trackingId} nonce={nonce} />;
}
