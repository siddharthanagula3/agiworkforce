import { ChevronLeft, ChevronRight, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, type ConversationSummary } from '../../stores/unifiedChatStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { UserProfile } from './UserProfile';

interface SidebarProps {
  className?: string;
  onOpenSettings?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conv) => {
      const haystack = `${conv.title ?? ''} ${conv.lastMessage ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, searchQuery]);

  const pinned = useMemo(
    () => filtered.filter((conv) => conv.pinned).sort(sortByUpdated),
    [filtered],
  );
  const recents = useMemo(
    () => filtered.filter((conv) => !conv.pinned).sort(sortByUpdated),
    [filtered],
  );

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

      return (
        <div
          key={conversation.id}
          className={cn(
            'sidebar-item group flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left transition-all',
            isActive ? 'active bg-white/10 text-white' : 'hover:bg-white/5',
          )}
        >
          <button
            type="button"
            className="flex-1 text-left"
            onClick={() => void handleSelect(conversation.id)}
          >
            {isEditing ? (
              <input
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                onBlur={() => void handleRename(conversation.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleRename(conversation.id);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditingId(null);
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            ) : (
              <>
                <span className="truncate text-sm font-semibold text-slate-200">{title}</span>
              </>
            )}
          </button>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="rounded-md p-1 text-slate-400 hover:bg-white/10"
              title={conversation.pinned ? 'Unpin' : 'Pin'}
              onClick={() => togglePinnedConversation(conversation.id)}
            >
              {conversation.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-slate-400 hover:bg-white/10"
              title="Rename"
              onClick={() => {
                setEditingId(conversation.id);
                setEditingTitle(title);
              }}
            >
              <Search className="h-4 w-4 rotate-90" />
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-slate-400 hover:bg-white/10"
              title="Delete"
              onClick={() => deleteConversation(conversation.id)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    },
    [
      activeConversationId,
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
        'flex h-full flex-col border-r border-white/10 glass-card transition-all duration-400',
        collapsed ? 'sidebar-collapsed' : 'sidebar-expanded',
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/10 bg-gradient-to-r from-teal-500/5 to-transparent">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl glass-hover text-white transition"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
        {!collapsed && (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 btn-premium text-white"
            onClick={() => void handleNewChat()}
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="px-3 pb-3">
        {!collapsed && (
          <Input
            placeholder="Search chats"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full"
          />
        )}
      </div>

      <ScrollArea className="flex-1 px-1">
        {!collapsed && pinned.length > 0 && (
          <Section title="Pinned">
            {pinned.map((conversation) => renderConversation(conversation))}
          </Section>
        )}
        <Section title={collapsed ? '' : 'Recent'}>
          {recents.length === 0 ? (
            <EmptyState onNewChat={handleNewChat} collapsed={collapsed} />
          ) : (
            recents.map((conversation) => renderConversation(conversation))
          )}
        </Section>
      </ScrollArea>

      <div className="border-t border-white/10 px-3 py-3">
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

const Section = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div className="px-2 pb-3">
    {title ? (
      <div className="mb-2 px-1 text-xs uppercase tracking-wide text-slate-400">{title}</div>
    ) : null}
    <div className="space-y-1">{children}</div>
  </div>
);

const EmptyState = ({ onNewChat, collapsed }: { onNewChat: () => void; collapsed: boolean }) => (
  <div className="rounded-xl border border-white/5 bg-black/20 p-4 text-sm text-slate-400">
    <div className="mb-2 font-medium text-white">No conversations yet</div>
    {!collapsed && (
      <p className="text-slate-400">
        Start a new chat to create a workspace, organize tasks, and collaborate with the agent.
      </p>
    )}
    <div className="mt-3">
      <Button className="w-full justify-center gap-2" onClick={onNewChat}>
        <Plus className="h-4 w-4" />
        <span>New chat</span>
      </Button>
    </div>
  </div>
);

function sortByUpdated(a: ConversationSummary, b: ConversationSummary) {
  return (b.updatedAt?.valueOf?.() ?? 0) - (a.updatedAt?.valueOf?.() ?? 0);
}
