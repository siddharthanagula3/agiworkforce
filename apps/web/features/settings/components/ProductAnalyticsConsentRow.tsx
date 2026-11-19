'use client';

import {
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  readProductAnalyticsConsent,
} from '@agiworkforce/types';

import { applyAnalyticsConsentLocally } from '@shared/lib/cookie-consent';

import { AccountConsentRow } from './AccountConsentRow';

export function ProductAnalyticsConsentRow() {
  return (
    <AccountConsentRow
      purpose={PRODUCT_ANALYTICS_CONSENT_PURPOSE}
      label="Product analytics"
      description="Page views and usage events tied to your account. Never your messages, code or files."
      loadingLabel="Loading your product analytics choice"
      unavailableLabel="Your product analytics choice could not be loaded."
      readGranted={readProductAnalyticsConsent}
      onSaved={applyAnalyticsConsentLocally}
      onWithdrawalRequested={() => applyAnalyticsConsentLocally(false)}
    />
  );
}
