import { FEATURES } from '@/lib/v1FeatureFlags';

/**
 * Dispatch realtime updates stay disabled on Mobile v1 until the companion
 * channel is available through the Web/API contract. The mobile bundle must
 * not subscribe directly to a database platform.
 */

export async function subscribeToDispatch(): Promise<() => void> {
  if (!FEATURES.dispatch) return () => {};
  console.warn('[DispatchRealtime] Dispatch realtime is disabled for Mobile v1.');
  return () => {};
}

export function unsubscribeFromDispatch(): void {
  // No active mobile dispatch realtime channel in v1.
}
