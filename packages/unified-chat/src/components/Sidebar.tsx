import { useCallback, useMemo, useState } from 'react';
import {
  Code,
  FolderOpen,
  LayoutGrid,
  MessageSquare,
  Search,
  Settings,
  Sparkles,
  SquarePen,
} from 'lucide-react';
import { PLAN_LABEL, isFreePlan } from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { useHostBridge } from '../lib/hostBridge';
import { syncPackageStoreFromHost } from '../hooks/useHostBridgeSync';
import { useSidebar } from '../hooks/useSidebar';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import { useTierStore, selectTier } from '../stores/tierStore';
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
  const { collapsed, toggleSidebar: _toggleSidebar } = useSidebar();
  const hostBridge = useHostBridge();
  // Hover-expand: rail is collapsed by default; hovering expands to 260px without toggling store
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const isExpanded = !collapsed || hoverExpanded;
  const width = isExpanded ? tokens.spacing.sidebarWidth : tokens.spacing.sidebarCollapsedWidth;

  const addConversation = useChatStore((s) => s.addConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const conversations = useChatStore((s) => s.conversations);
  const searchQuery = useChatStore((s) => s.searchQuery);

  const setActiveView = useUIStore((s) => s.setActiveView);
  const activeView = useUIStore((s) => s.activeView);
  const toggleSearchModal = useUIStore((s) => s.toggleSearchModal);

  const handleNewChat = useCallback(() => {
    if (hostBridge?.createConversation) {
      hostBridge.createConversation('New Chat');
      syncPackageStoreFromHost(hostBridge);
      setActiveView('chat');
      return;
    }

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
    setActiveConversation(conv.id);
    setActiveView('chat');
  }, [addConversation, hostBridge, setActiveConversation, setActiveView]);

  const navItems: NavItem[] = [
    {
      id: 'new-chat',
      icon: <SquarePen size={18} strokeWidth={1.75} />,
      label: 'New Chat',
      shortcut: '⇧⌘O',
      action: handleNewChat,
    },
    {
      id: 'search',
      icon: <Search size={18} strokeWidth={1.75} />,
      label: 'Search',
      action: toggleSearchModal,
    },
    {
      id: 'customize',
      icon: <LayoutGrid size={18} strokeWidth={1.75} />,
      label: 'Customize',
      action: () =>
        window.dispatchEvent(
          new CustomEvent('chat:action', { detail: { type: 'open-settings', tab: 'mcp-skills' } }),
        ),
    },
    {
      id: 'chats',
      icon: <MessageSquare size={18} strokeWidth={1.75} />,
      label: 'Chats',
      action: () => setActiveView('chat'),
    },
    {
      id: 'projects',
      icon: <FolderOpen size={18} strokeWidth={1.75} />,
      label: 'Projects',
      action: () => setActiveView('projects'),
    },
    {
      id: 'skills',
      icon: <Sparkles size={18} strokeWidth={1.75} />,
      label: 'Skills',
      action: () =>
        window.dispatchEvent(
          new CustomEvent('chat:action', { detail: { type: 'open-settings', tab: 'mcp-skills' } }),
        ),
    },
    {
      id: 'code',
      icon: <Code size={18} strokeWidth={1.75} />,
      label: 'Code',
      action: () =>
        window.dispatchEvent(
          new CustomEvent('chat:action', { detail: { type: 'open-settings', tab: 'code' } }),
        ),
    },
    {
      id: 'settings',
      icon: <Settings size={18} strokeWidth={1.75} />,
      label: 'Settings',
      action: () =>
        window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'open-settings' } })),
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
    code: 'code',
    settings: 'settings',
  };
  const activeNavId = viewToNavId[activeView] ?? '';

  // Tier/upgrade pill
  const tier = useTierStore(selectTier);
  const showUpgradePill = isFreePlan(tier);
  const planLabel = PLAN_LABEL[tier];

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
      onMouseEnter={() => collapsed && setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        transition: `width ${tokens.sidebar.animationMs}ms ease-out, min-width ${tokens.sidebar.animationMs}ms ease-out`,
      }}
      className="flex h-full flex-col bg-[var(--chat-surface-base)] border-r border-[var(--chat-border)] overflow-hidden"
    >
      {/* Top padding — 12px per spec */}
      <div className="pt-3" />

      {/* Nav items — 32×32 icon buttons, 8px gap, 6px hover background per spec §6.1 */}
      <nav className="shrink-0 px-2 pb-2 flex flex-col gap-0.5" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = item.id === activeNavId;
          const button = (
            <button
              key={item.id}
              onClick={item.action}
              className={cn(
                'flex w-full items-center rounded-md transition-colors duration-100',
                !isExpanded ? 'h-8 w-8 justify-center mx-auto' : 'h-8 gap-2 px-2',
                isActive
                  ? 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-primary)]'
                  : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {isExpanded && (
                <>
                  <span className="flex-1 text-left text-sm">{item.label}</span>
                  {item.shortcut && (
                    <span className="text-[11px] text-[var(--chat-text-muted)]">
                      {item.shortcut}
                    </span>
                  )}
                </>
              )}
            </button>
          );

          if (!isExpanded) {
            return (
              <Tooltip key={item.id} content={item.label} side="right">
                {button}
              </Tooltip>
            );
          }
          return <div key={item.id}>{button}</div>;
        })}
      </nav>

      {/* Divider */}
      {isExpanded && <div className="mx-2 mb-1 h-px bg-[var(--chat-border)]" />}

      {/* Recents section */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 pb-2">
          {isExpanded && orderedGroups.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-[var(--chat-text-muted)]">
              No conversations yet
            </p>
          )}

          {isExpanded && orderedGroups.length > 0 && (
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

          {!isExpanded && orderedGroups.length > 0 && (
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

      {/* Free-plan upgrade pill — bottom of expanded sidebar per spec §6.4 */}
      {isExpanded && showUpgradePill && (
        <div className="shrink-0 px-3 pb-2">
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-hover)] px-3 py-1 text-xs text-[var(--chat-text-secondary)]">
            <span>{planLabel} plan</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('chat:action', {
                    detail: { type: 'open-settings', tab: 'billing' },
                  }),
                )
              }
              className="font-medium text-[var(--chat-accent-primary)] hover:underline underline-offset-2 transition-colors"
            >
              Upgrade
            </button>
          </div>
        </div>
      )}

      {/* User Profile — pinned to bottom */}
      <div className="shrink-0 border-t border-[var(--chat-border)] px-2 py-2">
        <UserProfile collapsed={!isExpanded} />
      </div>
    </aside>
  );
}
