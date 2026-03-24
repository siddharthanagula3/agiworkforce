import { useChatStore } from '../stores/chatStore';
import type { Conversation } from '../lib/types';
import { cn } from '../lib/utils';
import { Tooltip } from './ui/Tooltip';

export interface ConversationItemProps {
  conversation: Conversation;
  /** When true the sidebar is collapsed — show only the icon / initial. */
  collapsed?: boolean;
}

export function ConversationItem({ conversation, collapsed = false }: ConversationItemProps) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const isActive = activeConversationId === conversation.id;
  const initial = (conversation.title.trim()[0] ?? 'C').toUpperCase();

  const button = (
    <button
      type="button"
      onClick={() => setActiveConversation(conversation.id)}
      className={cn(
        'flex w-full items-center rounded-[var(--chat-radius-md)] transition-colors',
        collapsed ? 'h-8 justify-center px-0' : 'h-8 gap-2 px-2',
        isActive
          ? 'bg-[var(--chat-accent-primary)]/12 text-[var(--chat-accent-primary)]'
          : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      {collapsed ? (
        <span className="text-xs font-medium">{initial}</span>
      ) : (
        <span className="flex-1 truncate text-left text-sm">
          {conversation.title || 'New Conversation'}
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip content={conversation.title || 'New Conversation'} side="right">
        {button}
      </Tooltip>
    );
  }

  return button;
}
