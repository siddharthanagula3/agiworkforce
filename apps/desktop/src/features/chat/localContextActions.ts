import { toast } from 'sonner';

import { invoke } from '../../lib/tauri-mock';
import { resolveDesktopChatOwnerId, useChatStore, uuidToDbId } from '../../stores/chat/chatStore';
import { useModelStore } from '../../stores/modelStore';

interface ContextUsage {
  tokensUsed: number;
  contextWindow: number;
}

interface ContextCompactionResponse {
  messages_compacted: number;
  message: string;
}

function localConversationId(conversationId: string): number | null {
  const dbId = uuidToDbId(conversationId);
  return typeof dbId === 'number' && dbId > 0 ? dbId : null;
}

export async function fetchLocalContextUsage(conversationId: string): Promise<ContextUsage | null> {
  const dbId = localConversationId(conversationId);
  if (dbId === null) return null;
  const selectedModel = useModelStore.getState().selectedModel;
  return invoke<ContextUsage | null>('chat_get_context_usage', {
    conversationId: dbId,
    userId: resolveDesktopChatOwnerId(),
    model: selectedModel && selectedModel !== 'auto' ? selectedModel : undefined,
  });
}

/**
 * `reloadTranscript` reads the conversation again the way opening it does, so
 * the summary and the messages it replaced show as such at once.
 */
export async function compactLocalConversation(
  conversationId: string,
  focus?: string,
  reloadTranscript?: (conversationId: string) => Promise<void>,
): Promise<void> {
  const dbId = localConversationId(conversationId);
  if (dbId === null) {
    throw new Error('Send a message in this chat before compacting it.');
  }
  const userId = resolveDesktopChatOwnerId();
  const result = await invoke<ContextCompactionResponse>('chat_compact_context', {
    conversationId: dbId,
    focus,
    userId,
  });
  if (result.messages_compacted > 0) {
    await useChatStore.getState().loadConversationMessages(conversationId, userId);
    await reloadTranscript?.(conversationId);
  }
  toast.success(result.message);
}
