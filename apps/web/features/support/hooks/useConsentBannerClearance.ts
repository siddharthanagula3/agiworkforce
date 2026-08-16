'use client';

import { useEffect, useState } from 'react';
import { COOKIE_CONSENT_UPDATED_EVENT, readCookiePreferences } from '@shared/lib/cookie-consent';

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
