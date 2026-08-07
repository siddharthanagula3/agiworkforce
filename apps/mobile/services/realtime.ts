import { FEATURES } from '@/lib/v1FeatureFlags';

/**
 * Cross-surface realtime sync is not wired directly from Mobile v1.
 * When Cloud sync opens, Mobile must consume Clerk-authenticated Web/API
 * channels rather than subscribing to a database platform from the bundle.
 */

// This is a known, tracked gap rather than a fault, and subscribeToRealtime is
// called on every sign-in and foreground. Warning each time buried genuine
// warnings, so report it once per session at debug level.
let hasReportedDisabledChannel = false;

export async function subscribeToRealtime(): Promise<() => void> {
  if (!FEATURES.cloudChat) return () => {};
  if (!hasReportedDisabledChannel) {
    hasReportedDisabledChannel = true;
    console.debug('[Realtime] Cloud sync is disabled until the Web/API channel is available.');
  }
  return () => {};
}

export function unsubscribeFromRealtime(): void {
  // No active mobile realtime channel in v1.
}
