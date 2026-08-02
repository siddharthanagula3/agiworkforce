'use client';

// SIX-25: the only place `GoogleAnalytics` may be mounted.
//
// Before this existed, app/layout.tsx rendered `<GoogleAnalytics/>` whenever
// NEXT_PUBLIC_GA_TRACKING_ID was set, so gtag.js loaded and configured the
// measurement id for every visitor with no consent check — while /cookies
// published "Analytics is opt-in" and the finished CookieConsent banner was
// mounted nowhere.
//
// Renders nothing until `isAnalyticsAllowed` says yes:
//  - server render and first client render agree on "nothing" (localStorage is
//    not readable during SSR, so anything else would hydrate-mismatch);
//  - the stored decision is read in an effect;
//  - `cookie-consent-updated` re-evaluates it live, so opting in loads GA
//    without a reload and opting back out unmounts the scripts.
//
// Unmounting does not retroactively unload an already-executed gtag.js, so
// withdrawal takes full effect on the next page load. That is a limitation of
// the tag, not a silent failure: nothing further is configured by this app and
// no new page_view is sent after unmount.

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
    // Another tab changing the decision must apply here too.
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!allowed) return null;

  return <GoogleAnalytics trackingId={trackingId} nonce={nonce} />;
}
