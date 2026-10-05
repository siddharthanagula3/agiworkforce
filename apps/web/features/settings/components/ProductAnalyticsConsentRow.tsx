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
      description="Page views on this site and product usage events from every AGI app, such as a stopped response or an accepted edit, recorded against your account. Never your messages, code or files. A workspace administrator can turn this off for every member."
      loadingLabel="Loading your product analytics choice"
      unavailableLabel="Your product analytics choice could not be loaded."
      readGranted={readProductAnalyticsConsent}
      onSaved={applyAnalyticsConsentLocally}
    />
  );
}
