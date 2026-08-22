'use client';

import { useEffect } from 'react';

import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { hasTelemetryConsent, setTelemetryConsentCache } from '@/lib/sentry-shared';

const NAMESPACE = 'privacy';

/**
 * Brings this device's telemetry-consent mirror in line with the account.
 *
 * Consent lives in two places: the synced `privacy` settings namespace, and a
 * localStorage mirror that `instrumentation-client.ts` reads. Sentry
 * initialises before React mounts, so the mirror is the only thing it can
 * consult — and until now only the Settings screen ever wrote it. A user who
 * turned telemetry off on one device and never opened Settings on a second
 * still had Sentry initialising there.
 *
 * Mounted at the app root so the mirror is corrected on first visit instead of
 * on first visit TO SETTINGS.
 *
 * KNOWN LIMIT, deliberately not papered over: Sentry has already initialised by
 * the time this runs, so a correction takes effect from the next load. Closing
 * that gap needs the consent rendered into the document server-side, before any
 * client code runs. Tracked as WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01.
 */
export function TelemetryConsentSync() {
  useEffect(() => {
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
  }, []);

  return null;
}

export default TelemetryConsentSync;
