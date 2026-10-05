'use client';

import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { useRefusedByGlobalPrivacyControl } from '@/lib/hooks/useRefusedByGlobalPrivacyControl';

import { AccountConsentRow } from './AccountConsentRow';

function readProductUpdatesConsent(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const consents = (body as { consents?: unknown }).consents;
  if (!Array.isArray(consents)) return false;
  return consents.some(
    (record: unknown) =>
      typeof record === 'object' &&
      record !== null &&
      (record as { purpose?: unknown }).purpose === PRODUCT_UPDATES_CONSENT_PURPOSE.id &&
      (record as { granted?: unknown }).granted === true,
  );
}

export function ProductUpdatesConsentRow() {
  const grantBlockedBySignal = useRefusedByGlobalPrivacyControl(PRODUCT_UPDATES_CONSENT_PURPOSE.id);

  return (
    <AccountConsentRow
      purpose={PRODUCT_UPDATES_CONSENT_PURPOSE.id}
      label={PRODUCT_UPDATES_CONSENT_PURPOSE.label}
      description={PRODUCT_UPDATES_CONSENT_PURPOSE.description}
      loadingLabel="Loading your product updates choice"
      unavailableLabel="Your product updates choice could not be loaded."
      readGranted={readProductUpdatesConsent}
      grantBlockedBySignal={grantBlockedBySignal}
    />
  );
}
