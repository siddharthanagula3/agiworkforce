import { useChatStore } from '../stores/chatStore';

export function ConversationHeader() {
  const currentId = useChatStore((s) => s.activeConversationId);
  const conversation = useChatStore((s) => s.conversations.find((c) => c.id === currentId));

  if (!conversation) return null;

  return (
    <div className="flex items-center justify-between border-b border-[var(--chat-border)] px-4 py-2">
      <h2 className="text-sm font-medium truncate text-[var(--chat-fg)]">
        {conversation.title || 'New Conversation'}
      </h2>
    </div>
  );
}
