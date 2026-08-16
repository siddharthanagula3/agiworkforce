'use client';

import { useEffect, useState } from 'react';

import { GoogleAnalytics } from './GoogleAnalytics';
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
    const sync = () => setAllowed(isAnalyticsAllowed(readCookiePreferences()));
    sync();

    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!allowed) return null;

  return <GoogleAnalytics trackingId={trackingId} nonce={nonce} />;
}
