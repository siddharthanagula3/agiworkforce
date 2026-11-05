'use client';

import { useEffect } from 'react';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { usePreferenceOwner, usePreferenceView } from '@/features/settings/hooks/use-preference-owner';

import { readPrivacyPreferences } from '@/features/settings/services/privacy-preferences-client';
import { hasTelemetryConsent, setTelemetryConsentCache } from '@/lib/sentry-shared';

/**
 * Brings this device's telemetry-consent mirror in line with the account.
 *
 * This is deliberately product-runtime work. Public pages have no signed-in
 * account consent to read, and must not pay for an authenticated database read
 * from the root layout. A new signed-in device still starts fail-closed; when
 * this fetch confirms opt-in, the client initializer starts telemetry for the
 * current page without requiring a reload.
 *
 * Mounted at the app root so the mirror is corrected on first visit instead of
 * on first visit TO SETTINGS.
 *
 * Signed-in only: there is no account-side consent for a signed-out visitor to
 * mirror, and the endpoint could only answer 401.
 */
export function TelemetryConsentSync() {
  const owner = usePreferenceOwner();
  const capture = usePreferenceView(owner);

  useEffect(() => {
    const viewCurrent = capture();
    if (!owner || !viewCurrent()) return;
    const operation = createRequestAuthority(owner.session, viewCurrent);

    void readPrivacyPreferences(operation)
      .then(async ({ stored }) => {
        if (!operation.isCurrent() || typeof stored.shareTelemetry !== 'boolean') return;
        const hadConsent = hasTelemetryConsent();
        if (stored.shareTelemetry !== hadConsent) {
          setTelemetryConsentCache(stored.shareTelemetry);
        }
        if (stored.shareTelemetry && !hadConsent) {
          const { initializeSentryAfterConsent } = await import('@/lib/client/initialize-sentry-after-consent');
          if (operation.isCurrent()) initializeSentryAfterConsent();
        }
      })
      .catch(() => undefined)
      .finally(() => operation.retire());

    return () => operation.retire();
  }, [owner, capture]);

  return null;
}

export default TelemetryConsentSync;
