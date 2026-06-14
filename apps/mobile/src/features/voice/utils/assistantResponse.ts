import type { ChatMessage } from '@/types/chat';

export function createMessageIdSet(messages: ChatMessage[] | undefined): Set<string> {
  return new Set((messages ?? []).map((message) => message.id));
}

export function findNewAssistantResponse(
  messages: ChatMessage[] | undefined,
  previousMessageIds: Set<string>,
): string | null {
  const nextAssistant = [...(messages ?? [])].reverse().find((message) => {
    if (previousMessageIds.has(message.id)) return false;
    if (message.role !== 'assistant') return false;
    if (message.isStreaming) return false;
    return message.content.trim().length > 0;
  });

  return nextAssistant?.content.trim() ?? null;
}
