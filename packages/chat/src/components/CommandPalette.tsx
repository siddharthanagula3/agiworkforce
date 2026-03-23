import { useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { Plus, Settings, Search, Moon, MessageSquare, FolderOpen, Zap, Plug } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';
import { generateId } from '../lib/utils';
import type { Conversation } from '../lib/types';

// ─── Command item definitions ─────────────────────────────────────────────────

interface CommandItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}

// ─── Main CommandPalette component ────────────────────────────────────────────

export function CommandPalette() {
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const openSettings = useUIStore((s) => s.openSettings);
  const toggleSearchModal = useUIStore((s) => s.toggleSearchModal);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const themeMode = useUIStore((s) => s.themeMode);
  const setThemeMode = useUIStore((s) => s.setThemeMode);

  const addConversation = useChatStore((s) => s.addConversation);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);

  const close = useCallback(() => {
    if (commandPaletteOpen) toggleCommandPalette();
  }, [commandPaletteOpen, toggleCommandPalette]);

  const handleNewChat = useCallback(() => {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: generateId(),
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      messageCount: 0,
      archived: false,
    };
    addConversation(conv);
    setCurrentConversation(conv.id);
    setActiveView('chat');
    close();
  }, [addConversation, setCurrentConversation, setActiveView, close]);

  const handleSettings = useCallback(() => {
    openSettings();
    close();
  }, [openSettings, close]);

  const handleSearch = useCallback(() => {
    toggleSearchModal();
    close();
  }, [toggleSearchModal, close]);

  const handleToggleDark = useCallback(() => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
    close();
  }, [themeMode, setThemeMode, close]);

  const handleGoTo = useCallback(
    (view: 'chat' | 'projects' | 'skills' | 'connectors') => {
      setActiveView(view);
      close();
    },
    [setActiveView, close],
  );

  const commands: CommandItem[] = [
    {
      id: 'new-chat',
      icon: <Plus size={15} />,
      label: 'New chat',
      shortcut: '⇧⌘O',
      onSelect: handleNewChat,
    },
    {
      id: 'settings',
      icon: <Settings size={15} />,
      label: 'Settings',
      shortcut: '⌘,',
      onSelect: handleSettings,
    },
    {
      id: 'search',
      icon: <Search size={15} />,
      label: 'Search',
      shortcut: '⌘F',
      onSelect: handleSearch,
    },
    {
      id: 'toggle-dark',
      icon: <Moon size={15} />,
      label: themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      shortcut: '⌘D',
      onSelect: handleToggleDark,
    },
    {
      id: 'go-chats',
      icon: <MessageSquare size={15} />,
      label: 'Go to Chats',
      onSelect: () => handleGoTo('chat'),
    },
    {
      id: 'go-projects',
      icon: <FolderOpen size={15} />,
      label: 'Go to Projects',
      onSelect: () => handleGoTo('projects'),
    },
    {
      id: 'go-skills',
      icon: <Zap size={15} />,
      label: 'Go to Skills',
      onSelect: () => handleGoTo('skills'),
    },
    {
      id: 'go-connectors',
      icon: <Plug size={15} />,
      label: 'Go to Connectors',
      onSelect: () => handleGoTo('connectors'),
    },
  ];

  // Escape closes the palette (cmdk handles this natively, but we also listen
  // at capture phase to prevent bubbling to other Escape handlers)
  useEffect(() => {
    if (!commandPaletteOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [commandPaletteOpen, close]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      {/* Command box */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg overflow-hidden rounded-xl',
          'bg-[var(--chat-surface-base)] border border-[var(--chat-border)]',
          'shadow-xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="flex flex-col"
          // Let cmdk manage keyboard navigation
          loop
        >
          {/* Search input */}
          <div className="flex items-center gap-2.5 border-b border-[var(--chat-border)] px-3.5 py-3">
            <Search
              size={15}
              className="shrink-0 text-[var(--chat-text-muted)]"
              aria-hidden="true"
            />
            <Command.Input
              placeholder="Type a command..."
              className={cn(
                'flex-1 bg-transparent text-sm text-[var(--chat-text-primary)]',
                'placeholder:text-[var(--chat-text-muted)]',
                'focus:outline-none',
              )}
              autoFocus
            />
          </div>

          {/* Results list */}
          <Command.List className="max-h-72 overflow-y-auto py-1.5">
            <Command.Empty className="px-4 py-6 text-center text-sm text-[var(--chat-text-muted)]">
              No commands found.
            </Command.Empty>

            {commands.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={cmd.label}
                onSelect={cmd.onSelect}
                className={cn(
                  'group flex cursor-pointer items-center gap-3 px-3.5 py-2 text-sm',
                  'text-[var(--chat-text-primary)] transition-colors',
                  'data-[selected=true]:bg-[var(--chat-surface-hover)]',
                  'aria-selected:bg-[var(--chat-surface-hover)]',
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--chat-radius-sm)] bg-[var(--chat-surface-elevated)] text-[var(--chat-text-secondary)]">
                  {cmd.icon}
                </span>
                <span className="flex-1">{cmd.label}</span>
                {cmd.shortcut && (
                  <kbd className="shrink-0 rounded-[var(--chat-radius-sm)] bg-[var(--chat-surface-elevated)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--chat-text-muted)]">
                    {cmd.shortcut}
                  </kbd>
                )}
              </Command.Item>
            ))}
          </Command.List>

          {/* Footer hint */}
          <div className="border-t border-[var(--chat-border)] px-3.5 py-2">
            <p className="text-[11px] text-[var(--chat-text-muted)]">
              <kbd className="rounded bg-[var(--chat-surface-elevated)] px-1 py-0.5 font-mono">
                ↑↓
              </kbd>{' '}
              navigate{'  '}
              <kbd className="rounded bg-[var(--chat-surface-elevated)] px-1 py-0.5 font-mono">
                ↵
              </kbd>{' '}
              select{'  '}
              <kbd className="rounded bg-[var(--chat-surface-elevated)] px-1 py-0.5 font-mono">
                esc
              </kbd>{' '}
              close
            </p>
          </div>
        </Command>
      </div>
    </div>
  );
}
