import { syncNow } from '@/services/cloudSyncEngine';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import type { ProductLinkHistory } from './productLinks';

export const accountChatHistory: ProductLinkHistory = {
  hasConversation: (id) =>
    useChatCloudMessageStore
      .getState()
      .conversations.some((conversation) => conversation.id === id),
  sync: syncNow,
};
