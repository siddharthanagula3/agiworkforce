import { api } from '@/services/api';
import { isHistoryVisibleConversation } from '@/src/features/chat/utils/conversationMode';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import { contextFenceTag } from '@agiworkforce/context';
import {
  formatPastChatContext as formatFencedPastChatContext,
  pastChatQueryTerms,
  selectRelevantPastChatExcerpts,
  type PastChatExcerpt,
} from '@agiworkforce/utils';

const MAX_CACHED_CANDIDATES = 1_000;

interface ServerSearchRow {
  type: 'session' | 'message';
  sessionId: string;
  sessionTitle?: string;
  messageId?: string;
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  createdAt?: string;
}

export { selectRelevantPastChatExcerpts };
export type { PastChatExcerpt };

export function formatPastChatContext(excerpts: readonly PastChatExcerpt[]): string | null {
  return formatFencedPastChatContext(excerpts, { fenceTag: contextFenceTag('past_chat') });
}

function messageText(message: ChatMessage): string {
  return typeof message.content === 'string' ? message.content.trim() : '';
}

function cachedCandidates(
  conversations: readonly ConversationSummary[],
  messages: Readonly<Record<string, ChatMessage[]>>,
  currentConversationId: string | null,
): PastChatExcerpt[] {
  const titles = new Map(
    conversations.map((conversation) => [conversation.id, conversation.title]),
  );
  const hidden = new Set(
    conversations
      .filter((conversation) => !isHistoryVisibleConversation(conversation))
      .map((conversation) => conversation.id),
  );
  const candidates: PastChatExcerpt[] = [];

  for (const [conversationId, conversationMessages] of Object.entries(messages)) {
    if (conversationId === currentConversationId || hidden.has(conversationId)) continue;
    for (const message of conversationMessages) {
      if (message.role !== 'user' && message.role !== 'assistant') continue;
      const content = messageText(message);
      if (!content) continue;
      candidates.push({
        conversationId,
        messageId: message.id,
        title: titles.get(conversationId) ?? 'Untitled Chat',
        role: message.role,
        content,
        createdAt: message.createdAt,
      });
      if (candidates.length >= MAX_CACHED_CANDIDATES) return candidates;
    }
  }
  return candidates;
}

async function searchCloudHistory(
  query: string,
  currentConversationId: string | null,
): Promise<PastChatExcerpt[]> {
  const [term] = pastChatQueryTerms(query);
  if (!term) return [];

  try {
    const data = await api.get<{ results?: ServerSearchRow[] }>(
      `/api/search?q=${encodeURIComponent(term)}&limit=50`,
    );
    return (data.results ?? []).flatMap((row): PastChatExcerpt[] => {
      if (
        row.type !== 'message' ||
        row.sessionId === currentConversationId ||
        (row.role !== 'user' && row.role !== 'assistant') ||
        !row.messageId ||
        !row.content?.trim()
      ) {
        return [];
      }
      return [
        {
          conversationId: row.sessionId,
          messageId: row.messageId,
          title: row.sessionTitle?.trim() || 'Untitled Chat',
          role: row.role,
          content: row.content.trim(),
          createdAt: row.createdAt ?? '',
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function retrievePastChatContext(params: {
  executionMode: 'local' | 'cloud';
  query: string;
  currentConversationId: string | null;
  enabled: boolean;
}): Promise<string | null> {
  if (!params.enabled) return null;

  if (params.executionMode === 'local') {
    const state = useChatMessageStore.getState();
    return formatPastChatContext(
      selectRelevantPastChatExcerpts(
        cachedCandidates(state.conversations, state.messages, params.currentConversationId),
        params.query,
      ),
    );
  }

  const state = useChatCloudMessageStore.getState();
  const cached = cachedCandidates(
    state.conversations,
    state.messages,
    params.currentConversationId,
  );
  const remote = await searchCloudHistory(params.query, params.currentConversationId);
  return formatPastChatContext(
    selectRelevantPastChatExcerpts([...remote, ...cached], params.query),
  );
}
