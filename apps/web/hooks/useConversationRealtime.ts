'use client';

/**
 * useConversationRealtime (no-op stub)
 *
 * Supabase Realtime subscriptions for cross-surface conversation sync have
 * been removed. This hook returns a stable disconnected state. Real-time
 * features will be re-implemented with a different provider or polling.
 */

/**
 * Connection state reported to consumers.
 * - `connected` — realtime channel is subscribed and receiving events
 * - `disconnected` — channel is closed
 * - `reconnecting` — channel errored, attempting automatic reconnect
 */
export type RealtimeConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export function useConversationRealtime(): {
  connectionState: RealtimeConnectionState;
} {
  // Supabase Realtime has been removed. Always report disconnected so callers
  // can fall back to polling or other sync strategies.
  return { connectionState: 'disconnected' };
}
