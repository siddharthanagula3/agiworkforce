import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useChatStore } from '@/stores/chatStore';
import { offlineQueue } from '@/services/offlineQueue';
import { hasActiveConversationSend, useChatExecutionStore } from '@/stores/chat/chatExecutionStore';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

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
const waitingForTurn = new Set<string>();
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
      if (!active || reconnectInFlight || offlineQueue.getQueueSize() === 0) return;
      reconnectInFlight = true;
      setIsReconnecting(true);

      try {
        await offlineQueue.processQueue(
          async (msg) => {
            launchReplayStarted = true;
            waitingForTurn.delete(msg.id);
            const account = msg.provenance.scope === 'cloud' ? captureCloudAccountEpoch() : null;
            let accepted = false;
            let busy = false;
            try {
              await sendMessage(msg.conversationId, msg.content, msg.model, undefined, {
                ...(msg.skillName ? { skillName: msg.skillName } : {}),
                ...(msg.replayIdentity ? { offlineReplayIdentity: msg.replayIdentity } : {}),
                onOfflineReplayBusy: () => {
                  busy = true;
                  waitingForTurn.add(msg.id);
                },
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
            if (busy) return 'conversation-busy';
            if (!accepted) throw new Error('The queued message was not accepted for sending.');
          },
          () => observedOnline,
        );
      } finally {
        reconnectInFlight = false;
        if (active) {
          setIsReconnecting(false);
          refreshQueueSize();
          if (waitingForTurn.size > 0) replayAfterReadinessChange();
        }
      }
    };
    const replayWhenReady = () => {
      if (
        !active ||
        !wasOnline ||
        !observedOnline ||
        reconnectInFlight ||
        offlineQueue.isProcessing
      )
        return;
      const entries = offlineQueue.getQueue();
      if (waitingForTurn.size > 0) {
        const queuedIds = new Set(entries.map((entry) => entry.id));
        for (const waiting of waitingForTurn) {
          if (!queuedIds.has(waiting)) waitingForTurn.delete(waiting);
        }
      }
      if (entries.length === 0) return;
      if (launchReplayStarted) {
        const mode = useChatAppModeStore.getState().appMode;
        const account = captureCloudAccountEpoch();
        const ready = entries.some(
          (entry) =>
            waitingForTurn.has(entry.id) &&
            entry.provenance.scope === mode &&
            (entry.provenance.scope === 'local' || entry.provenance.ownerId === account?.ownerId) &&
            !hasActiveConversationSend(entry.conversationId),
        );
        if (!ready) return;
      }
      void handleReconnect().catch((error) => {
        console.warn('[useNetworkStatus] Queue replay failed:', error);
      });
    };
    const replayAfterReadinessChange = () => {
      void Promise.resolve().then(replayWhenReady);
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
          replayWhenReady();
          return;
        }
        const online = observeNetwork(state, fetchVersion);
        wasOnline = online;
        replayWhenReady();
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
    const unsubscribeQueue = offlineQueue.subscribe(() => {
      refreshQueueSize();
      replayAfterReadinessChange();
    });
    const unsubscribeAccount = subscribeCloudAccountEpochChange(replayAfterReadinessChange);
    const unsubscribeMode = useChatAppModeStore.subscribe((state, previous) => {
      if (state.appMode !== previous.appMode) replayAfterReadinessChange();
    });
    const unsubscribeExecution = useChatExecutionStore.subscribe((state, previous) => {
      if (
        waitingForTurn.size > 0 &&
        state.streamingConversationIds !== previous.streamingConversationIds &&
        previous.streamingConversationIds.some((id) => !state.streamingConversationIds.includes(id))
      ) {
        replayAfterReadinessChange();
      }
    });
    const unsubscribeFailures = offlineQueue.onEntryFailed((entry) => {
      if (active) failOfflineMessage(entry.conversationId, entry.id);
    });

    return () => {
      active = false;
      unsubscribeNetwork();
      unsubscribeQueue();
      unsubscribeAccount();
      unsubscribeMode();
      unsubscribeExecution();
      unsubscribeFailures();
    };
  }, [sendMessage, resolveOfflineMessage, failOfflineMessage]);

  return { isOnline, isReconnecting, queueSize };
}
