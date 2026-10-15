import { invoke } from '../../lib/tauri-mock';
import { resolveDesktopChatOwnerId, uuidToDbId } from '../../stores/chat/chatStore';

export function localConversationId(conversationId: string | undefined): number | null {
  if (!conversationId) return null;
  const dbId = uuidToDbId(conversationId);
  return typeof dbId === 'number' && dbId > 0 ? dbId : null;
}

export function getConversationInstructions(conversationId: number): Promise<string> {
  return invoke<string>('chat_get_conversation_instructions', {
    conversationId,
    userId: resolveDesktopChatOwnerId(),
  });
}

export function setConversationInstructions(
  conversationId: number,
  instructions: string,
): Promise<void> {
  return invoke<void>('chat_set_conversation_instructions', {
    conversationId,
    userId: resolveDesktopChatOwnerId(),
    instructions,
  });
}
