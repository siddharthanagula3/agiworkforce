import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { clearDraft } from '@/src/features/chat/draftStore';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';

export function countLocalChats(): number {
  return useChatMessageStore
    .getState()
    .conversations.filter((conversation) => executionModeForConversation(conversation) === 'local')
    .length;
}

export async function deleteAllLocalChats(): Promise<number> {
  const store = useChatMessageStore.getState();
  const ids = store.conversations
    .filter((conversation) => executionModeForConversation(conversation) === 'local')
    .map((conversation) => conversation.id);
  for (const id of ids) {
    await useChatMessageStore.getState().deleteConversation(id);
    clearDraft(id, { scope: 'local' });
  }
  return ids.length;
}
