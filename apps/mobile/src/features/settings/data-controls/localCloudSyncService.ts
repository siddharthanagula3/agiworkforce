import { managedCloudConversationMessagesPath } from '@agiworkforce/cloud-contracts';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { api } from '@/services/api';
import { managedCloudChat } from '@/services/managedCloudChat';
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cloudConversationIdFor(localId: string): string {
  return UUID_PATTERN.test(localId) ? localId : uuidv7();
}

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
      const conversation = await managedCloudChat.createConversation({
        id: cloudConversationIdFor(conv.id),
        title: conv.title ?? 'Synced from Local Mode',
      });

      const localMessages = (messages[conv.id] ?? [])
        .filter((m) => !m.isStreaming && !m.isQueued)
        .slice(-MAX_MESSAGES_PER_CONVERSATION)
        .map(sanitiseMessageForCloud)
        .filter((m) => m.content.trim().length > 0);

      let savedCount = 0;
      if (localMessages.length > 0) {
        const { saved } = await api.post<{ saved: number }>(
          `${managedCloudConversationMessagesPath(conversation.id)}/bulk`,
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
