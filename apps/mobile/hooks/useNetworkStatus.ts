import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useChatStore } from '@/stores/chatStore';
import { offlineQueue } from '@/services/offlineQueue';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

type ReachabilityState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

export interface NetworkStatus {
  isOnline: boolean;
  isReconnecting: boolean;
  queueSize: number;
}

let launchReplayStarted = false;
let observedOnline = false;
let networkObservationVersion = 0;
let nextNetworkObservationVersion = 0;

export function isReachableNetworkState(state: ReachabilityState): boolean {
  return state.isConnected === true && state.isInternetReachable === true;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

  const sendMessage = useChatStore((s) => s.sendMessage);
  const resolveOfflineMessage = useChatStore((s) => s.resolveOfflineMessage);
  const failOfflineMessage = useChatStore((s) => s.failOfflineMessage);

  useEffect(() => {
    let active = true;
    let wasOnline = false;
    let reconnectInFlight = false;
    setIsReconnecting(false);

    const refreshQueueSize = () => {
      if (active) setQueueSize(offlineQueue.getQueueSize());
    };
    const handleReconnect = async () => {
      if (!active || reconnectInFlight) return;
      if (offlineQueue.getQueueSize() > 0) launchReplayStarted = true;
      reconnectInFlight = true;
      setIsReconnecting(true);

      try {
        await offlineQueue.processQueue(
          async (msg) => {
            const account = msg.provenance.scope === 'cloud' ? captureCloudAccountEpoch() : null;
            let accepted = false;
            try {
              await sendMessage(msg.conversationId, msg.content, msg.model, undefined, {
                ...(msg.skillName ? { skillName: msg.skillName } : {}),
                onAccepted: () => {
                  accepted = true;
                  if (
                    offlineQueue.getQueue().includes(msg) &&
                    (msg.provenance.scope === 'local' || isCloudAccountEpochCurrent(account))
                  ) {
                    resolveOfflineMessage(msg.conversationId, msg.id);
                  }
                },
              });
            } catch (error) {
              if (!accepted) throw error;
              return;
            }
            if (!accepted) throw new Error('The queued message was not accepted for sending.');
          },
          () => observedOnline,
        );
      } finally {
        reconnectInFlight = false;
        if (active) {
          setIsReconnecting(false);
          refreshQueueSize();
        }
      }
    };
    const observeNetwork = (
      state: ReachabilityState,
      version = ++nextNetworkObservationVersion,
    ) => {
      const online = isReachableNetworkState(state);
      networkObservationVersion = version;
      observedOnline = online;
      setIsOnline(online);
      return online;
    };

    const fetchVersion = ++nextNetworkObservationVersion;
    NetInfo.fetch()
      .then((state) => {
        if (!active) return;
        if (networkObservationVersion > fetchVersion) {
          setIsOnline(observedOnline);
          wasOnline = observedOnline;
          return;
        }
        const online = observeNetwork(state, fetchVersion);
        wasOnline = online;
        if (online && !launchReplayStarted && offlineQueue.getQueueSize() > 0) {
          void handleReconnect().catch((error) => {
            console.warn('[useNetworkStatus] Launch queue replay failed:', error);
          });
        }
      })
      .catch((err) => {
        if (active) console.warn('[useNetworkStatus] Initial network fetch failed:', err);
      });

    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (!active) return;
      const online = observeNetwork(state);

      if (!wasOnline && online) {
        void handleReconnect().catch((error) => {
          console.warn('[useNetworkStatus] Offline queue reconnect failed:', error);
        });
      }

      wasOnline = online;
    });

    refreshQueueSize();
    const unsubscribeQueue = offlineQueue.subscribe(refreshQueueSize);
    const unsubscribeFailures = offlineQueue.onEntryFailed((entry) => {
      if (active) failOfflineMessage(entry.conversationId, entry.id);
    });

    return () => {
      active = false;
      unsubscribeNetwork();
      unsubscribeQueue();
      unsubscribeFailures();
    };
  }, [sendMessage, resolveOfflineMessage, failOfflineMessage]);

  return { isOnline, isReconnecting, queueSize };
}
