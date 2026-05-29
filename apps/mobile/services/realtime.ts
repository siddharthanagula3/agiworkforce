import { FEATURES } from '@/lib/v1FeatureFlags';

/**
 * Cross-surface realtime sync is not wired directly from Mobile v1.
 * When Cloud sync opens, Mobile must consume Clerk-authenticated Web/API
 * channels rather than subscribing to a database platform from the bundle.
 */

export async function subscribeToRealtime(): Promise<() => void> {
  if (!FEATURES.cloudChat) return () => {};
  console.warn('[Realtime] Cloud sync is disabled until the Web/API channel is available.');
  return () => {};
}

export function unsubscribeFromRealtime(): void {
  // No active mobile realtime channel in v1.
}
