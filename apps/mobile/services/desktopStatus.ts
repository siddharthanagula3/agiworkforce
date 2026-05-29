import { FEATURES } from '@/lib/v1FeatureFlags';

/**
 * Desktop liveness polling is disabled in Mobile v1. Future companion status
 * must come through a Clerk-authenticated Web/API endpoint, not direct mobile
 * database reads.
 */

export function startDesktopStatusPolling(): () => void {
  if (!FEATURES.dispatch && !FEATURES.companion) return () => {};
  console.warn('[DesktopStatus] Companion liveness polling is disabled for Mobile v1.');
  return () => {};
}
