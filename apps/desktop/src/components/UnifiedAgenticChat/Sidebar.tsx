import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Calendar,
  Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, type ConversationSummary } from '../../stores/unifiedChatStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { UserProfile } from '../Layout/UserProfile';

interface SidebarProps {
  className?: string;
  onOpenSettings?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type TemporalGroup = 'today' | 'yesterday' | 'thisWeek' | 'last7Days' | 'last30Days' | 'older';

const TEMPORAL_LABELS: Record<TemporalGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  last7Days: 'Last 7 Days',
  last30Days: 'Last 30 Days',
  older: 'Older',
};

// Helper function to get temporal group
function getTemporalGroup(date: Date): TemporalGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay()); // Start of week (Sunday)
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const conversationDate = new Date(date);

  if (conversationDate >= today) {
    return 'today';
  } else if (conversationDate >= yesterday && conversationDate < today) {
    return 'yesterday';
  } else if (conversationDate >= thisWeekStart && conversationDate < yesterday) {
    return 'thisWeek';
  } else if (conversationDate >= sevenDaysAgo) {
    return 'last7Days';
  } else if (conversationDate >= thirtyDaysAgo) {
    return 'last30Days';
  } else {
    return 'older';
  }
}

export function Sidebar({
  className,
  onOpenSettings,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const {
    conversations,
    activeConversationId,
    createConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    togglePinnedConversation,
  } = useUnifiedChatStore();
  const ensureActiveConversation = useUnifiedChatStore((state) => state.ensureActiveConversation);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    ensureActiveConversation();
  }, [ensureActiveConversation]);

  // Filter conversations based on search
  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conv) => {
      const haystack = `${conv.title ?? ''} ${conv.lastMessage ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, searchQuery]);

  // Group by pinned
  const pinned = useMemo(
    () => filtered.filter((conv) => conv.pinned).sort(sortByUpdated),
    [filtered],
  );

  // Group by temporal sections
  const temporalGroups = useMemo(() => {
    const unpinned = filtered.filter((conv) => !conv.pinned);
    const groups: Record<TemporalGroup, ConversationSummary[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      last7Days: [],
      last30Days: [],
      older: [],
    };

    unpinned.forEach((conv) => {
      if (conv.updatedAt) {
        const group = getTemporalGroup(conv.updatedAt);
        groups[group].push(conv);
      } else {
        // If no updatedAt, put in older
        groups.older.push(conv);
      }
    });

    // Sort each group by updated date
    Object.keys(groups).forEach((key) => {
      groups[key as TemporalGroup].sort(sortByUpdated);
    });

    return groups;
  }, [filtered]);

  const handleNewChat = useCallback(async () => {
    const id = await createConversation('New chat');
    selectConversation(id);
  }, [createConversation, selectConversation]);

  const handleSelect = useCallback(
    (id: string) => {
      selectConversation(id);
    },
    [selectConversation],
  );

  const handleRename = useCallback(
    async (id: string) => {
      const trimmed = editingTitle.trim();
      if (trimmed) {
        renameConversation(id, trimmed);
      }
      setEditingId(null);
    },
    [editingTitle, renameConversation],
  );

  const renderConversation = useCallback(
    (conversation: ConversationSummary) => {
      const isActive = conversation.id === activeConversationId;
      const isEditing = conversation.id === editingId;
      const title = conversation.title?.trim() || 'Untitled chat';
      const subtitle = conversation.lastMessage?.trim() || 'No activity yet';

      // Format relative time
      const relativeTime = conversation.updatedAt ? formatRelativeTime(conversation.updatedAt) : '';

      return (
        <div
          key={conversation.id}
          className={cn(
            'group flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition-all',
            isActive
              ? 'bg-gradient-to-r from-teal/20 to-transparent border-l-2 border-teal'
              : 'hover:bg-white/5 border-l-2 border-transparent',
          )}
        >
          <button
            type="button"
            className="flex-1 text-left"
            onClick={() => handleSelect(conversation.id)}
            aria-label={`Open conversation: ${title}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {isEditing ? (
              <input
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                onBlur={() => handleRename(conversation.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleRename(conversation.id);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditingId(null);
                  }
                }}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/50"
                aria-label="Edit conversation title"
                autoFocus
              />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-semibold text-zinc-100">{title}</div>
                  {conversation.pinned && <Pin className="h-3 w-3 shrink-0 text-teal" />}
                </div>
                {!collapsed && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                    <Clock className="h-3 w-3" />
                    <span>{relativeTime}</span>
                    {conversation.lastMessage && <span>• {subtitle}</span>}
                  </div>
                )}
              </>
            )}
          </button>
          <div
            className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
            role="group"
            aria-label="Conversation actions"
          >
            <button
              type="button"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title={conversation.pinned ? 'Unpin' : 'Pin'}
              aria-label={conversation.pinned ? `Unpin ${title}` : `Pin ${title}`}
              aria-pressed={conversation.pinned}
              onClick={() => togglePinnedConversation(conversation.id)}
            >
              {conversation.pinned ? (
                <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Delete"
              aria-label={`Delete ${title}`}
              onClick={() => deleteConversation(conversation.id)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      );
    },
    [
      activeConversationId,
      collapsed,
      deleteConversation,
      editingId,
      editingTitle,
      handleSelect,
      handleRename,
      togglePinnedConversation,
    ],
  );

  return (
    <aside
      className={cn(
        'flex h-full w-[320px] flex-col border-r border-zinc-800 bg-zinc-950/95 backdrop-blur-xl transition-all duration-200',
        collapsed && 'w-[72px]',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <button
          type="button"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
          )}
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        {!collapsed && (
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              'h-9 w-9 rounded-lg',
              'bg-terra-cotta text-white hover:bg-terra-cotta/90',
              'shadow-lg shadow-terra-cotta/20',
            )}
            onClick={handleNewChat}
            title="New chat"
            aria-label="Create new chat conversation"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        {!collapsed && (
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              aria-hidden="true"
            />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={cn(
                'w-full rounded-lg border-zinc-800 bg-zinc-900 pl-10 text-sm',
                'placeholder:text-zinc-500',
                'focus:border-teal focus:ring-teal/20',
              )}
              role="searchbox"
              aria-label="Search conversations"
            />
          </div>
        )}
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1 px-2">
        {/* Pinned Section */}
        {!collapsed && pinned.length > 0 && (
          <TemporalSection title="Pinned" icon={Pin}>
            {pinned.map((conversation) => renderConversation(conversation))}
          </TemporalSection>
        )}

        {/* Temporal Sections */}
        {!collapsed &&
          (
            [
              'today',
              'yesterday',
              'thisWeek',
              'last7Days',
              'last30Days',
              'older',
            ] as TemporalGroup[]
          ).map((groupKey) => {
            const convs = temporalGroups[groupKey];
            if (convs.length === 0) return null;

            return (
              <TemporalSection key={groupKey} title={TEMPORAL_LABELS[groupKey]} icon={Calendar}>
                {convs.map((conversation) => renderConversation(conversation))}
              </TemporalSection>
            );
          })}

        {/* Empty State */}
        {!collapsed &&
          pinned.length === 0 &&
          Object.values(temporalGroups).every((g) => g.length === 0) && (
            <EmptyState onNewChat={handleNewChat} />
          )}
      </ScrollArea>

      {/* User Profile */}
      <div className="border-t border-zinc-800 px-4 py-3">
        <UserProfile
          name="Siddhartha Nagula"
          email="siddhartha@agiworkforce.com"
          onSettingsClick={onOpenSettings}
          onBillingClick={onOpenSettings}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}

interface TemporalSectionProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}

const TemporalSection = ({ title, icon: Icon, children }: TemporalSectionProps) => (
  <div className="mb-4 px-2">
    <div className="mb-2 flex items-center gap-2 px-1">
      <Icon className="h-3.5 w-3.5 text-zinc-500" />
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
    </div>
    <div className="space-y-0.5">{children}</div>
  </div>
);

const EmptyState = ({ onNewChat }: { onNewChat: () => void }) => (
  <div className="mx-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
    <div className="mb-3 flex justify-center">
      <div className="rounded-full bg-teal/10 p-3">
        <Plus className="h-6 w-6 text-teal" />
      </div>
    </div>
    <div className="mb-2 text-sm font-semibold text-zinc-200">No conversations yet</div>
    <p className="mb-4 text-xs text-zinc-500">
      Start a new chat to begin your agentic workspace journey.
    </p>
    <Button
      className={cn(
        'w-full justify-center gap-2 rounded-lg',
        'bg-teal text-white hover:bg-teal/90',
        'shadow-lg shadow-teal/20',
      )}
      onClick={onNewChat}
    >
      <Plus className="h-4 w-4" />
      <span>New Chat</span>
    </Button>
  </div>
);

function sortByUpdated(a: ConversationSummary, b: ConversationSummary) {
  return (b.updatedAt?.valueOf?.() ?? 0) - (a.updatedAt?.valueOf?.() ?? 0);
}

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // Format as date for older items
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
