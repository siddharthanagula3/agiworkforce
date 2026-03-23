import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Share2, Pencil, FolderOpen, Archive, Download, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useChatStore } from '../stores/chatStore';
import { Button } from './ui/Button';

interface ConversationHeaderProps {
  onShare?: (id: string) => void;
}

export function ConversationHeader({ onShare }: ConversationHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const messages = useChatStore((s) =>
    currentConversationId ? (s.messages[currentConversationId] ?? []) : [],
  );
  const updateConversation = useChatStore((s) => s.updateConversation);
  const archiveConversation = useChatStore((s) => s.archiveConversation);
  const removeConversation = useChatStore((s) => s.removeConversation);

  const currentConversation = conversations.find((c) => c.id === currentConversationId) ?? null;

  // Sync rename input value when conversation changes
  useEffect(() => {
    if (currentConversation) {
      setRenameValue(currentConversation.title);
    }
  }, [currentConversation]);

  // Focus rename input when rename mode activates
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;

    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [dropdownOpen]);

  if (!currentConversation) {
    return null;
  }

  function handleRenameStart() {
    setDropdownOpen(false);
    setIsRenaming(true);
  }

  function handleRenameCommit() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== currentConversation?.title && currentConversationId) {
      updateConversation(currentConversationId, { title: trimmed });
    } else {
      setRenameValue(currentConversation?.title ?? '');
    }
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleRenameCommit();
    } else if (e.key === 'Escape') {
      setRenameValue(currentConversation?.title ?? '');
      setIsRenaming(false);
    }
  }

  function handleArchive() {
    setDropdownOpen(false);
    if (currentConversationId) {
      archiveConversation(currentConversationId);
    }
  }

  function handleDelete() {
    setDropdownOpen(false);
    if (currentConversationId) {
      removeConversation(currentConversationId);
    }
  }

  function handleShare() {
    if (currentConversationId) {
      onShare?.(currentConversationId);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-12 items-center justify-between border-b border-[var(--chat-border)] px-4 shrink-0">
      {/* Center: title + dropdown trigger */}
      <div className="flex flex-1 items-center justify-center">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameCommit}
            onKeyDown={handleRenameKeyDown}
            className={cn(
              'rounded-[var(--chat-radius-sm)] bg-[var(--chat-surface-overlay)] px-2 py-0.5',
              'text-sm font-medium text-[var(--chat-text-primary)] outline-none',
              'ring-1 ring-[var(--chat-accent-secondary)]',
              'w-64 text-center',
            )}
          />
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className={cn(
                'flex items-center gap-1 rounded-[var(--chat-radius-sm)] px-2 py-1',
                'text-sm font-medium text-[var(--chat-text-primary)] transition-colors',
                'hover:bg-[var(--chat-surface-hover)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
              )}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
            >
              <span className="max-w-[320px] truncate">{currentConversation.title}</span>
              <ChevronDown
                size={14}
                className={cn(
                  'shrink-0 text-[var(--chat-text-muted)] transition-transform duration-150',
                  dropdownOpen && 'rotate-180',
                )}
              />
            </button>

            {dropdownOpen && (
              <div
                role="menu"
                className={cn(
                  'absolute left-1/2 top-full mt-1 -translate-x-1/2 z-50',
                  'min-w-[180px] rounded-[var(--chat-radius-md)] p-1',
                  'bg-[var(--chat-surface-elevated)] shadow-lg',
                  'border border-[var(--chat-border)]',
                  'animate-in fade-in-0 zoom-in-95',
                )}
              >
                <DropdownItem
                  icon={<Pencil size={13} />}
                  label="Rename"
                  onClick={handleRenameStart}
                />
                <DropdownItem
                  icon={<FolderOpen size={13} />}
                  label="Move to project"
                  onClick={() => setDropdownOpen(false)}
                />
                <DropdownItem
                  icon={<Archive size={13} />}
                  label="Archive"
                  onClick={handleArchive}
                />
                <DropdownItem
                  icon={<Download size={13} />}
                  label="Export"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="my-1 h-px bg-[var(--chat-border)]" role="separator" />
                <DropdownItem
                  icon={<Trash2 size={13} />}
                  label="Delete"
                  onClick={handleDelete}
                  destructive
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Share button — only when there are messages */}
      <div className="flex items-center">
        {hasMessages && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Share conversation"
            onClick={handleShare}
            className="text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
          >
            <Share2 size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

interface DropdownItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

function DropdownItem({ icon, label, onClick, destructive = false }: DropdownItemProps) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-[var(--chat-radius-sm)] px-2 py-1.5',
        'text-sm outline-none transition-colors',
        destructive
          ? 'text-[var(--chat-destructive)] hover:bg-[var(--chat-destructive)]/10'
          : 'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
      )}
    >
      <span
        className={cn(
          'shrink-0',
          destructive ? 'text-[var(--chat-destructive)]' : 'text-[var(--chat-text-muted)]',
        )}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}
