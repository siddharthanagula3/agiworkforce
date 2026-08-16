
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

  const wasOnlineRef = useRef(false);
  const reconnectInFlightRef = useRef(false);

  const sendMessage = useChatStore((s) => s.sendMessage);
  const resolveOfflineMessage = useChatStore((s) => s.resolveOfflineMessage);

  const refreshQueueSize = useCallback(() => {
    setQueueSize(offlineQueue.getQueueSize());
  }, []);

  const handleReconnect = useCallback(async () => {
    if (reconnectInFlightRef.current) return;
    reconnectInFlightRef.current = true;
    setIsReconnecting(true);

    try {
      await offlineQueue.processQueue(async (msg) => {
        resolveOfflineMessage(msg.conversationId, msg.id);
        await sendMessage(msg.conversationId, msg.content, msg.model);
      });
    } finally {
      reconnectInFlightRef.current = false;
      setIsReconnecting(false);
      refreshQueueSize();
    }
  }, [sendMessage, resolveOfflineMessage, refreshQueueSize]);

  useEffect(() => {
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
        void handleReconnect().catch((error) => {
          console.warn('[useNetworkStatus] Offline queue reconnect failed:', error);
        });
      }

      wasOnlineRef.current = online;
    });

    return unsubscribe;
  }, [handleReconnect]);

  useEffect(() => {
    setQueueSize(offlineQueue.getQueueSize());
    return offlineQueue.subscribe(() => {
      setQueueSize(offlineQueue.getQueueSize());
    });
  }, []);

  return { isOnline, isReconnecting, queueSize };
}
