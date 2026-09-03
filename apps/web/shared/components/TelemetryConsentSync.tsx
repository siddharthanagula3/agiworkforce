'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { hasTelemetryConsent, setTelemetryConsentCache } from '@/lib/sentry-shared';

const NAMESPACE = 'privacy';

export function TelemetryConsentSync() {
  const { isLoaded, isSignedIn } = useAuth();

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
