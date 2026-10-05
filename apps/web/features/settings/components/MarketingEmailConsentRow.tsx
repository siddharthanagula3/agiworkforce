'use client';

import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { useRefusedByGlobalPrivacyControl } from '@/lib/hooks/useRefusedByGlobalPrivacyControl';

import { AccountConsentRow } from './AccountConsentRow';

function readMarketingEmailConsent(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const consents = (body as { consents?: unknown }).consents;
  if (!Array.isArray(consents)) return false;
  return consents.some(
    (record: unknown) =>
      typeof record === 'object' &&
      record !== null &&
      (record as { purpose?: unknown }).purpose === MARKETING_EMAIL_CONSENT_PURPOSE.id &&
      (record as { granted?: unknown }).granted === true,
  );
}

export function MarketingEmailConsentRow() {
  const grantBlockedBySignal = useRefusedByGlobalPrivacyControl(MARKETING_EMAIL_CONSENT_PURPOSE.id);

  return (
    <AccountConsentRow
      purpose={MARKETING_EMAIL_CONSENT_PURPOSE.id}
      label={MARKETING_EMAIL_CONSENT_PURPOSE.label}
      description={MARKETING_EMAIL_CONSENT_PURPOSE.description}
      loadingLabel="Loading your marketing email choice"
      unavailableLabel="Your marketing email choice could not be loaded."
      readGranted={readMarketingEmailConsent}
      grantBlockedBySignal={grantBlockedBySignal}
    />
  );
}
