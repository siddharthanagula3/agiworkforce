/**
 * One-time Local→Cloud sync — the ONLY permitted Local↔Cloud data crossing.
 *
 * HARD RULE (founder 2026-06-14):
 *   - Local mode is always fully local.
 *   - Cloud mode is always fully cloud.
 *   - ZERO automatic/background sync between them.
 *   - This function is the single authorised crossing, and it MUST only be
 *     called after explicit user consent (see DataControlsScreen).
 *
 * What is copied: conversation titles + message text only. Local file
 * attachments (URIs, blobs) and on-device memory facts are NOT transferred —
 * they are device-local data that the user has not consented to send to cloud.
 *
 * The sync is:
 *   - One-time: does not run again automatically.
 *   - Additive: does not delete existing cloud conversations.
 *   - Non-destructive: local conversations remain local after sync.
 *   - Bounded: maximum 50 conversations, 100 messages per conversation.
 */

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

/**
 * Strip attachment URLs/URIs from a message before sending to cloud.
 * Only the text content crosses the boundary.
 */
function sanitiseMessageForCloud(message: ChatMessage): Omit<ChatMessage, 'attachments'> {
  const { attachments: _attachments, ...safeMessage } = message;
  return safeMessage;
}

/**
 * Perform one-time explicit sync of local conversation text to AGI Cloud.
 * Must only be called after the user has confirmed in the UI.
 */
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
      // Create the conversation on the cloud backend.
      const { conversation } = await api.post<{ conversation: { id: string } }>(
        '/api/chat/conversations',
        {
          title: conv.title ?? 'Synced from Local Mode',
          // Signal that this came from a local sync, not a live cloud session.
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

      // Only report success once the server has actually accepted the
      // messages: a partial save (saved < sent) is still a sync error.
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
