'use client';

import { useEffect } from 'react';
import { useSession } from '@/lib/identity/client';

import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { hasTelemetryConsent, setTelemetryConsentCache } from '@/lib/sentry-shared';

const NAMESPACE = 'privacy';

/**
 * Brings this device's telemetry-consent mirror in line with the account.
 *
 * The pre-mount Sentry init decision (instrumentation-client.ts) no longer
 * depends on this: the root layout renders the account's real consent onto
 * <html>, read there before hydration, which is what closed
 * WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01 for a brand-new device's first
 * paint. This component is the remaining defence-in-depth layer, it corrects
 * the localStorage mirror that later hasTelemetryConsent() reads (setUser,
 * event scrubbing) consult for the rest of the session, covering the case
 * where the server-rendered read itself failed closed (DB hiccup) but the
 * account's real answer is reachable a moment later through the ordinary,
 * retried settings fetch.
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
        // Only write on a genuine difference: setting it every load would churn
        // localStorage on every navigation for no change.
        if (stored.shareTelemetry !== hasTelemetryConsent()) {
          setTelemetryConsentCache(stored.shareTelemetry);
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
