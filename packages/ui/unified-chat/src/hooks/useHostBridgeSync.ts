import { useEffect } from 'react';
import { type ChatHostBridge, normalizeHostConversation } from '../lib/hostBridge';
import { useChatStore } from '../stores/chatStore';

export function syncPackageStoreFromHost(hostBridge: ChatHostBridge | null | undefined): void {
  if (!hostBridge) return;

  const snapshot = hostBridge.getSnapshot();
  const store = useChatStore.getState();

  store.setConversations(snapshot.conversations.map(normalizeHostConversation));

  if (store.activeConversationId !== snapshot.activeConversationId) {
    store.setActiveConversation(snapshot.activeConversationId);
  }
}

export function useHostBridgeSync(hostBridge: ChatHostBridge | null | undefined): void {
  useEffect(() => {
    if (!hostBridge) return;

    syncPackageStoreFromHost(hostBridge);

    if (!hostBridge.subscribe) return;
    return hostBridge.subscribe(() => {
      syncPackageStoreFromHost(hostBridge);
    });
  }, [hostBridge]);
}
