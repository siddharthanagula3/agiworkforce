import type { ChatMessage, ConversationSummary } from '@/types/chat';

export interface ConversationMessageState {
  conversations: ConversationSummary[];
  messages: Record<string, ChatMessage[]>;
}

export interface ConversationMessageStore {
  getState: () => ConversationMessageState;
  setState: (
    update:
      | Partial<ConversationMessageState>
      | ((state: ConversationMessageState) => Partial<ConversationMessageState>),
  ) => void;
}

function getLocalStore(): ConversationMessageStore {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatMessageStore } =
    require('@/stores/chat/chatMessageStore') as typeof import('@/stores/chat/chatMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatMessageStore as unknown as ConversationMessageStore;
}

function getCloudStore(): ConversationMessageStore {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatCloudMessageStore } =
    require('@/stores/chat/chatCloudMessageStore') as typeof import('@/stores/chat/chatCloudMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatCloudMessageStore as unknown as ConversationMessageStore;
}

/**
 * Resolve the single physical repository that owns a conversation.
 * Conversation records determine ownership; stale message-only residue cannot
 * steal a Cloud conversation back into Local storage.
 */
export function getConversationMessageStore(
  conversationId: string,
): ConversationMessageStore {
  const localStore = getLocalStore();
  if (
    localStore
      .getState()
      .conversations.some((conversation) => conversation.id === conversationId)
  ) {
    return localStore;
  }

  const cloudStore = getCloudStore();
  if (
    cloudStore
      .getState()
      .conversations.some((conversation) => conversation.id === conversationId)
  ) {
    return cloudStore;
  }

  // Compatibility for orphaned pre-separation local drafts. All newly created
  // conversations have an owner record before any message action runs.
  return localStore;
}
