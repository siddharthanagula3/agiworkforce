import { useCallback, useMemo } from 'react';
import {
  PanelLeft,
  Plus,
  Search,
  Palette,
  MessageSquare,
  FolderOpen,
  Zap,
  Plug,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSidebar } from '../hooks/useSidebar';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import { ScrollArea } from './ui/ScrollArea';
import { Tooltip } from './ui/Tooltip';
import { ConversationItem } from './ConversationItem';
import { UserProfile } from './UserProfile';
import { generateId, getTemporalGroup } from '../lib/utils';
import type { Conversation } from '../lib/types';
import { tokens } from '../lib/tokens';

// Group ordering for the recents list
const GROUP_ORDER = ['Pinned', 'Today', 'Yesterday', 'This Week', 'This Month', 'Older'];

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  action: () => void;
}

export function Sidebar() {
  const { collapsed, width, toggleSidebar } = useSidebar();

  const addConversation = useChatStore((s) => s.addConversation);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const conversations = useChatStore((s) => s.conversations);
  const searchQuery = useChatStore((s) => s.searchQuery);

  const setActiveView = useUIStore((s) => s.setActiveView);
  const activeView = useUIStore((s) => s.activeView);
  const toggleSearchModal = useUIStore((s) => s.toggleSearchModal);

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
  }, [addConversation, setCurrentConversation, setActiveView]);

  const navItems: NavItem[] = [
    {
      id: 'new-chat',
      icon: <Plus size={16} />,
      label: 'New Chat',
      shortcut: '⇧⌘O',
      action: handleNewChat,
    },
    {
      id: 'search',
      icon: <Search size={16} />,
      label: 'Search',
      action: toggleSearchModal,
    },
    {
      id: 'customize',
      icon: <Palette size={16} />,
      label: 'Customize',
      action: () =>
        window.dispatchEvent(
          new CustomEvent('chat:action', { detail: { type: 'open-settings', tab: 'mcp-skills' } }),
        ),
    },
    {
      id: 'chats',
      icon: <MessageSquare size={16} />,
      label: 'Chats',
      action: () => setActiveView('chat'),
    },
    {
      id: 'projects',
      icon: <FolderOpen size={16} />,
      label: 'Projects',
      action: () => setActiveView('projects'),
    },
    {
      id: 'skills',
      icon: <Zap size={16} />,
      label: 'Skills',
      action: () =>
        window.dispatchEvent(
          new CustomEvent('chat:action', { detail: { type: 'open-settings', tab: 'mcp-skills' } }),
        ),
    },
    {
      id: 'connectors',
      icon: <Plug size={16} />,
      label: 'Connectors',
      action: () =>
        window.dispatchEvent(
          new CustomEvent('chat:action', {
            detail: { type: 'open-settings', tab: 'connectors' },
          }),
        ),
    },
  ];

  // Map nav item id to activeView to determine active state
  const viewToNavId: Record<string, string> = {
    chat: 'chats',
    projects: 'projects',
    'project-detail': 'projects',
    skills: 'skills',
    connectors: 'connectors',
    customize: 'customize',
  };
  const activeNavId = viewToNavId[activeView] ?? '';

  const groupedConversations = useMemo(() => {
    const filtered = searchQuery
      ? conversations.filter(
          (c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()) && !c.archived,
        )
      : conversations.filter((c) => !c.archived);

    const pinned = filtered.filter((c) => c.pinned);
    const unpinned = filtered.filter((c) => !c.pinned);
    const groups: Record<string, Conversation[]> = {};
    if (pinned.length > 0) groups['Pinned'] = pinned;
    for (const conv of unpinned) {
      const group = getTemporalGroup(conv.updatedAt);
      if (!groups[group]) groups[group] = [];
      groups[group]!.push(conv);
    }
    return groups;
  }, [conversations, searchQuery]);

  const orderedGroups = GROUP_ORDER.filter((g) => groupedConversations[g]?.length);

  return (
    <aside
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        transition: `width ${tokens.sidebar.animationMs}ms ease-out, min-width ${tokens.sidebar.animationMs}ms ease-out`,
      }}
      className="flex h-full flex-col bg-[var(--chat-surface-base)] border-r border-[var(--chat-border)] overflow-hidden"
    >
      {/* Toggle button row */}
      <div
        className={cn(
          'flex shrink-0 items-center px-2 pt-3 pb-1',
          collapsed ? 'justify-center' : 'justify-start',
        )}
      >
        <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
          <button
            onClick={toggleSidebar}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[var(--chat-radius-md)] transition-colors',
              'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeft size={16} />
          </button>
        </Tooltip>
      </div>

      {/* Nav items */}
      <nav className="shrink-0 px-2 pb-2" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = item.id === activeNavId;
          const button = (
            <button
              key={item.id}
              onClick={item.action}
              className={cn(
                'flex w-full items-center rounded-[var(--chat-radius-md)] transition-colors',
                collapsed ? 'h-8 justify-center px-0' : 'h-8 gap-2 px-2',
                isActive
                  ? 'bg-[var(--chat-accent-primary)]/12 text-[var(--chat-accent-primary)]'
                  : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && (
                <>
                  <span
                    className="flex-1 text-left text-sm font-medium transition-opacity duration-100"
                    style={{ opacity: collapsed ? 0 : 1 }}
                  >
                    {item.label}
                  </span>
                  {item.shortcut && (
                    <span className="text-[11px] text-[var(--chat-text-muted)]">
                      {item.shortcut}
                    </span>
                  )}
                </>
              )}
            </button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.id} content={item.label} side="right">
                {button}
              </Tooltip>
            );
          }
          return button;
        })}
      </nav>

      {/* Divider */}
      {!collapsed && <div className="mx-2 mb-1 h-px bg-[var(--chat-border)]" />}

      {/* Recents section */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 pb-2">
          {!collapsed && orderedGroups.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-[var(--chat-text-muted)]">
              No conversations yet
            </p>
          )}

          {!collapsed && orderedGroups.length > 0 && (
            <>
              {orderedGroups.map((group) => (
                <div key={group} className="mb-1">
                  <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--chat-text-muted)]">
                    {group}
                  </p>
                  {groupedConversations[group]!.map((conv) => (
                    <ConversationItem key={conv.id} conversation={conv} collapsed={false} />
                  ))}
                </div>
              ))}
            </>
          )}

          {collapsed && orderedGroups.length > 0 && (
            <>
              {orderedGroups.map((group) =>
                groupedConversations[group]!.map((conv) => (
                  <ConversationItem key={conv.id} conversation={conv} collapsed={true} />
                )),
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* User Profile — pinned to bottom */}
      <div className={cn('shrink-0 border-t border-[var(--chat-border)] px-2 py-2')}>
        <UserProfile collapsed={collapsed} />
      </div>
    </aside>
  );
}
