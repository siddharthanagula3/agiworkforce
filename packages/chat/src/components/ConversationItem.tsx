import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Pin, Pencil, FolderOpen, Archive, Download, Trash2 } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn, formatRelativeTime, truncate } from '../lib/utils';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import type { Conversation } from '../lib/types';

interface ConversationItemProps {
  conversation: Conversation;
  collapsed?: boolean;
}

export function ConversationItem({ conversation, collapsed = false }: ConversationItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const removeConversation = useChatStore((s) => s.removeConversation);
  const archiveConversation = useChatStore((s) => s.archiveConversation);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const isActive = currentConversationId === conversation.id;

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  function handleClick() {
    setCurrentConversation(conversation.id);
    setActiveView('chat');
  }

  function handleRenameCommit() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== conversation.title) {
      updateConversation(conversation.id, { title: trimmed });
    } else {
      setRenameValue(conversation.title);
    }
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleRenameCommit();
    } else if (e.key === 'Escape') {
      setRenameValue(conversation.title);
      setIsRenaming(false);
    }
  }

  function handleDelete() {
    removeConversation(conversation.id);
  }

  function handleArchive() {
    archiveConversation(conversation.id);
  }

  if (collapsed) {
    return (
      <button
        onClick={handleClick}
        title={conversation.title}
        className={cn(
          'flex w-full items-center justify-center rounded-[var(--chat-radius-md)] p-2 transition-colors',
          isActive
            ? 'bg-[var(--chat-accent-primary)]/12 text-[var(--chat-accent-primary)]'
            : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
        )}
      >
        <span className="text-xs font-medium">{conversation.title.slice(0, 2).toUpperCase()}</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'group relative flex w-full items-start gap-2 rounded-[var(--chat-radius-md)] px-2 py-1.5 transition-colors cursor-pointer',
        isActive ? 'bg-[var(--chat-accent-primary)]/12' : 'hover:bg-[var(--chat-surface-hover)]',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={isRenaming ? undefined : handleClick}
    >
      {/* Pin indicator */}
      {conversation.pinned && (
        <Pin
          size={10}
          className="mt-1 shrink-0 text-[var(--chat-accent-primary)] rotate-45"
          aria-label="Pinned"
        />
      )}

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameCommit}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full rounded bg-[var(--chat-surface-overlay)] px-1 py-0.5',
              'text-sm text-[var(--chat-text-primary)] outline-none',
              'ring-1 ring-[var(--chat-accent-secondary)]',
            )}
          />
        ) : (
          <p
            className={cn(
              'truncate text-sm leading-snug',
              isActive
                ? 'text-[var(--chat-text-primary)] font-medium'
                : 'text-[var(--chat-text-primary)]',
            )}
          >
            {truncate(conversation.title, 36)}
          </p>
        )}
        {!isRenaming && (
          <p className="mt-0.5 text-[11px] text-[var(--chat-text-muted)]">
            {formatRelativeTime(conversation.updatedAt)}
          </p>
        )}
      </div>

      {/* Three-dot menu — only on hover */}
      {isHovered && !isRenaming && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'shrink-0 rounded p-0.5 transition-colors',
                'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-overlay)]',
              )}
              aria-label="Conversation options"
            >
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="right"
              align="start"
              sideOffset={4}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'z-50 min-w-[160px] rounded-[var(--chat-radius-md)] p-1',
                'bg-[var(--chat-surface-elevated)] shadow-lg',
                'border border-[var(--chat-border)]',
                'animate-in fade-in-0 zoom-in-95',
              )}
            >
              <DropdownMenu.Item
                onSelect={() => setIsRenaming(true)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-[var(--chat-radius-sm)] px-2 py-1.5',
                  'text-sm text-[var(--chat-text-primary)] outline-none',
                  'hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)]',
                )}
              >
                <Pencil size={13} className="text-[var(--chat-text-muted)]" />
                Rename
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={() => {
                  // placeholder — project move requires project selector
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-[var(--chat-radius-sm)] px-2 py-1.5',
                  'text-sm text-[var(--chat-text-primary)] outline-none',
                  'hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)]',
                )}
              >
                <FolderOpen size={13} className="text-[var(--chat-text-muted)]" />
                Move to project
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={handleArchive}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-[var(--chat-radius-sm)] px-2 py-1.5',
                  'text-sm text-[var(--chat-text-primary)] outline-none',
                  'hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)]',
                )}
              >
                <Archive size={13} className="text-[var(--chat-text-muted)]" />
                Archive
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={() => {
                  // placeholder — export requires runtime-specific handler
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-[var(--chat-radius-sm)] px-2 py-1.5',
                  'text-sm text-[var(--chat-text-primary)] outline-none',
                  'hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)]',
                )}
              >
                <Download size={13} className="text-[var(--chat-text-muted)]" />
                Export
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="my-1 h-px bg-[var(--chat-border)]" />

              <DropdownMenu.Item
                onSelect={handleDelete}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-[var(--chat-radius-sm)] px-2 py-1.5',
                  'text-sm text-[var(--chat-destructive)] outline-none',
                  'hover:bg-[var(--chat-destructive)]/10 focus:bg-[var(--chat-destructive)]/10',
                )}
              >
                <Trash2 size={13} />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}
