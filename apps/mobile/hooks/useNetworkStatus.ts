/**
 * useNetworkStatus — tracks device connectivity and drives the offline queue.
 *
 * On mount it fetches the current network state synchronously (via NetInfo.fetch)
 * then subscribes to change events. When the device transitions from offline to
 * online the hook triggers offlineQueue.processQueue() so any queued messages
 * are retried automatically.
 *
 * Before retrying each queued message the hook removes the queued placeholder
 * pair (empty assistant message + its user message) from the conversation so
 * the fresh sendMessage call doesn't create duplicates in the chat list.
 *
 * Returned shape:
 *   isOnline       — true when the device has an active connection
 *   isReconnecting — true during the window between going back online and the
 *                    queue finishing processing (drives the "Reconnecting…" UI)
 *   queueSize      — number of messages currently waiting to be retried
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useChatStore } from '@/stores/chatStore';
import { offlineQueue } from '@/services/offlineQueue';

type ReachabilityState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

export interface NetworkStatus {
  isOnline: boolean;
  isReconnecting: boolean;
  queueSize: number;
}

export function isReachableNetworkState(state: ReachabilityState): boolean {
  return state.isConnected === true && state.isInternetReachable === true;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

  // Stable reference to avoid stale closure in the NetInfo listener
  const wasOnlineRef = useRef(false);
  const reconnectInFlightRef = useRef(false);

  // Pull actions out of the store for queue retry
  const sendMessage = useChatStore((s) => s.sendMessage);
  const clearQueuedPlaceholders = useChatStore((s) => s.clearQueuedPlaceholders);

  /** Refresh the queue-size display after each enqueue / dequeue. */
  const refreshQueueSize = useCallback(() => {
    setQueueSize(offlineQueue.getQueueSize());
  }, []);

  const handleReconnect = useCallback(async () => {
    if (reconnectInFlightRef.current) return;
    reconnectInFlightRef.current = true;
    setIsReconnecting(true);

    try {
      await offlineQueue.processQueue(async (msg) => {
        // Remove the empty queued placeholder before re-sending so the
        // fresh user + assistant pair created by sendMessage is not a duplicate.
        clearQueuedPlaceholders(msg.conversationId);
        await sendMessage(msg.conversationId, msg.content, msg.model);
      });
    } finally {
      reconnectInFlightRef.current = false;
      setIsReconnecting(false);
      refreshQueueSize();
    }
  }, [sendMessage, clearQueuedPlaceholders, refreshQueueSize]);

  useEffect(() => {
    // Fetch initial state so the badge renders correctly on mount
    NetInfo.fetch()
      .then((state) => {
        const online = isReachableNetworkState(state);
        setIsOnline(online);
        wasOnlineRef.current = online;
      })
      .catch((err) => {
        console.warn('[useNetworkStatus] Initial network fetch failed:', err);
      });

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = isReachableNetworkState(state);
      setIsOnline(online);

      if (!wasOnlineRef.current && online) {
        // Device just came back online — drain the offline queue
        void handleReconnect().catch((error) => {
          console.warn('[useNetworkStatus] Offline queue reconnect failed:', error);
        });
      }

      wasOnlineRef.current = online;
    });

    return unsubscribe;
  }, [handleReconnect]);

  // Keep queueSize in sync whenever the component re-renders (cheap O(1) call)
  useEffect(() => {
    setQueueSize(offlineQueue.getQueueSize());
  }, []);

  return { isOnline, isReconnecting, queueSize };
}
