'use client';

/**
 * How far the launcher must lift off the bottom edge.
 *
 * Two existing components own the bottom of the viewport and both are
 * `fixed bottom-0 left-0 right-0 z-50`:
 *   - shared/components/CookieConsent.tsx (visible until a choice is stored)
 *   - shared/components/OfflineIndicator.tsx (visible while offline)
 *
 * The widget sits strictly below them (z-index 40/45) and lifts while the
 * consent banner is undecided, so a legally-required banner is never covered by
 * a support bubble. Consent state is read through the documented seam
 * (`readCookiePreferences` + `COOKIE_CONSENT_UPDATED_EVENT`) rather than by
 * touching that component.
 */

import { useEffect, useState } from 'react';
import { COOKIE_CONSENT_UPDATED_EVENT, readCookiePreferences } from '@shared/lib/cookie-consent';

/** Roughly the consent banner's height; only needs to clear it, not match it. */
const CONSENT_BANNER_CLEARANCE_PX = 148;

export function useConsentBannerClearance(): number {
  const [clearance, setClearance] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sync = () => {
      setClearance(readCookiePreferences() === null ? CONSENT_BANNER_CLEARANCE_PX : 0);
    };
    sync();

    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, sync);
    };
  }, []);

  return clearance;
}
