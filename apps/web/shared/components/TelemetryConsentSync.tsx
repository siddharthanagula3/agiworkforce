'use client';

import { useEffect } from 'react';
import { useSession } from '@/lib/identity/client';

import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { hasTelemetryConsent, setTelemetryConsentCache } from '@/lib/sentry-shared';

const NAMESPACE = 'privacy';

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
 * Signed-in only. There is no account-side consent for a signed-out visitor to
 * mirror, so firing this on the public marketing pages fetched an authenticated
 * endpoint that could only ever answer 401, twice per visit under StrictMode.
 * and printed those failures to the console of every anonymous visitor.
 */
export function TelemetryConsentSync() {
  const { isLoaded, isSignedIn } = useSession();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    void fetchPreferenceNamespace<{ shareTelemetry?: boolean }>(NAMESPACE, {})
      .then((stored) => {
        if (cancelled || typeof stored.shareTelemetry !== 'boolean') return;
        const hadConsent = hasTelemetryConsent();
        // Only write on a genuine difference: setting it every load would churn
        // localStorage on every navigation for no change.
        if (stored.shareTelemetry !== hadConsent) {
          setTelemetryConsentCache(stored.shareTelemetry);
        }
        if (stored.shareTelemetry && !hadConsent) {
          void import('@/lib/client/initialize-sentry-after-consent')
            .then(({ initializeSentryAfterConsent }) => initializeSentryAfterConsent())
            .catch(() => undefined);
        }
      })
      .catch(() => {
        // Signed out, offline, or the endpoint is unavailable. Leaving the
        // mirror alone is the safe outcome: it already holds this device's last
        // known answer, and guessing would be worse than being stale.
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return null;
}

export default TelemetryConsentSync;
