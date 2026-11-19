import { getConversationMessageStore } from '@/stores/chat/conversationRepository';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ConversationSummary } from '@/types/chat';
import type { UploadChatContext } from './uploadAttachment';

export function isConversationTemporary(
  conversation: Pick<ConversationSummary, 'temporary'> | undefined,
): boolean {
  return conversation
    ? conversation.temporary === true
    : useSettingsStore.getState().isTemporaryChat;
}

export function resolveUploadContext(conversationId: string | undefined): UploadChatContext {
  const conversation = conversationId
    ? getConversationMessageStore(conversationId)
        .getState()
        .conversations.find((c) => c.id === conversationId)
    : undefined;
  return {
    ...(conversationId ? { conversationId } : {}),
    temporary: isConversationTemporary(conversation),
  };
}
