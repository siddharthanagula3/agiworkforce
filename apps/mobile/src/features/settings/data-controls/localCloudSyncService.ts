
import { api } from '@/services/api';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import type { ConversationSummary, ChatMessage } from '@/types/chat';

export interface LocalCloudSyncResult {
  conversationsSynced: number;
  messagesSynced: number;
  errors: string[];
}

const MAX_CONVERSATIONS_TO_SYNC = 50;
const MAX_MESSAGES_PER_CONVERSATION = 100;

function sanitiseMessageForCloud(message: ChatMessage): Omit<ChatMessage, 'attachments'> {
  const { attachments: _attachments, ...safeMessage } = message;
  return safeMessage;
}

export async function syncLocalConversationsToCloud(): Promise<LocalCloudSyncResult> {
  const { conversations, messages } = useChatMessageStore.getState();

  const localConversations: ConversationSummary[] = conversations
    .filter((c) => executionModeForConversation(c) === 'local')
    .slice(0, MAX_CONVERSATIONS_TO_SYNC);

  const result: LocalCloudSyncResult = {
    conversationsSynced: 0,
    messagesSynced: 0,
    errors: [],
  };

  for (const conv of localConversations) {
    try {
      const { conversation } = await api.post<{ conversation: { id: string } }>(
        '/api/chat/conversations',
        {
          title: conv.title ?? 'Synced from Local Mode',
          metadata: { syncedFromLocal: true, localId: conv.id },
        },
      );

      const localMessages = (messages[conv.id] ?? [])
        .filter((m) => !m.isStreaming && !m.isQueued)
        .slice(-MAX_MESSAGES_PER_CONVERSATION)
        .map(sanitiseMessageForCloud)
        .filter((m) => m.content.trim().length > 0);

      let savedCount = 0;
      if (localMessages.length > 0) {
        const { saved } = await api.post<{ saved: number }>(
          `/api/chat/conversations/${conversation.id}/messages/bulk`,
          {
            messages: localMessages.map((m) => ({
              role: m.role,
              content: m.content,
              model: m.model,
            })),
          },
        );
        savedCount = saved;
      }

      if (savedCount < localMessages.length) {
        throw new Error(`Server accepted ${savedCount}/${localMessages.length} messages`);
      }

      result.conversationsSynced += 1;
      result.messagesSynced += savedCount;
    } catch (err) {
      const label = conv.title ?? conv.id;
      result.errors.push(
        `Could not sync "${label}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
