import { useCallback, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FolderPlus,
  Pin,
  PinOff,
  Plus,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationUI } from '../../types/chat';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';

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
    selectConversation,
    createConversation,
    renameConversation,
    togglePinnedConversation,
  } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const matchingConversations = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const haystack =
        `${conversation.title ?? ''} ${conversation.lastMessage ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, searchQuery]);

  const projects = useMemo(
    () => matchingConversations.filter((conversation) => Boolean(conversation.pinned)),
    [matchingConversations],
  );
  const recents = useMemo(
    () => matchingConversations.filter((conversation) => !conversation.pinned),
    [matchingConversations],
  );

  const handleNewChat = useCallback(async () => {
    const id = await createConversation('New chat');
    await selectConversation(id);
  }, [createConversation, selectConversation]);

  const handleNewProjectChat = useCallback(async () => {
    const id = await createConversation('Untitled project');
    await togglePinnedConversation(id);
    await selectConversation(id);
    setEditingId(id);
    setEditingTitle('Untitled project');
  }, [createConversation, selectConversation, togglePinnedConversation]);

  const handleSelectConversation = useCallback(
    async (id: number) => {
      await selectConversation(id);
    },
    [selectConversation],
  );

  const handleRename = useCallback(async () => {
    if (editingId === null) return;
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    await renameConversation(editingId, trimmed);
    setEditingId(null);
  }, [editingId, editingTitle, renameConversation]);

  const renderConversation = useCallback(
    (conversation: ConversationUI, showPinActions: boolean) => {
      const isActive = conversation.id === activeConversationId;
      const isEditing = conversation.id === editingId;
      const title = conversation.title?.trim() || 'Untitled chat';
      const subtitle = conversation.lastMessage?.trim() || 'No activity yet';

      return (
        <div
          key={conversation.id}
          className={cn(
            'group flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left transition-all',
            isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5',
          )}
        >
          <button
            type="button"
            className="flex-1 text-left"
            onClick={() => void handleSelectConversation(conversation.id)}
          >
            {isEditing ? (
              <input
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                onBlur={() => void handleRename()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleRename();
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
                <div className="truncate text-sm font-medium">{title}</div>
                {!collapsed && <div className="truncate text-xs text-slate-400">{subtitle}</div>}
              </>
            )}
          </button>
          {showPinActions && (
            <button
              type="button"
              className={cn(
                'opacity-0 transition-opacity group-hover:opacity-100',
                collapsed && 'opacity-100',
              )}
              title={conversation.pinned ? 'Unpin' : 'Pin'}
              onClick={() => void togglePinnedConversation(conversation.id)}
            >
              {conversation.pinned ? (
                <PinOff className="h-4 w-4 text-slate-400" />
              ) : (
                <Pin className="h-4 w-4 text-slate-400" />
              )}
            </button>
          )}
          {!isEditing && !collapsed && (
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-white"
              onClick={() => {
                setEditingId(conversation.id);
                setEditingTitle(title);
              }}
            >
              Rename
            </button>
          )}
        </div>
      );
    },
    [
      activeConversationId,
      collapsed,
      editingId,
      editingTitle,
      handleRename,
      handleSelectConversation,
      togglePinnedConversation,
    ],
  );

  return (
    <aside
      className={cn(
        'relative flex h-full w-80 flex-col border-r border-white/10 bg-gradient-to-b from-[#0b0d13] via-[#0a0c12] to-[#05060b] text-slate-200 transition-all duration-300',
        collapsed && 'w-[96px]',
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-base font-semibold">
            AGI
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold text-white">AGI Workforce</p>
              <p className="text-xs text-slate-400">Ready</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="h-8 w-8 text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={() => onToggleCollapse?.()}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <div className="px-4 py-5 space-y-4">
        <Button
          className={cn(
            'w-full justify-center bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30',
            collapsed && 'justify-center px-0',
          )}
          onClick={() => void handleNewChat()}
        >
          <Plus className="mr-2 h-4 w-4" />
          {!collapsed && <span>New chat</span>}
        </Button>
        {!collapsed && (
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search conversations"
                className="h-10 bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-500 pl-9"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">Ctrl+K to open command palette</p>
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-3 pt-4 text-slate-400">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-2xl border border-white/10 hover:text-white"
              title="New chat"
              onClick={() => void handleNewChat()}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-2xl border border-white/10 hover:text-white"
              title="New project chat"
              onClick={() => void handleNewProjectChat()}
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-2xl border border-white/10 hover:text-white"
              title="Search"
              onClick={() => setSearchQuery('')}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full px-4">
            <div className="space-y-6 pb-6">
              <section>
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                  <span>Projects</span>
                  {!collapsed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-slate-500 hover:text-white"
                      onClick={() => void handleNewProjectChat()}
                    >
                      New project chat
                    </Button>
                  )}
                </div>
                {projects.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {collapsed ? 'No pins' : 'Pin important chats to keep them here.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {projects.map((conversation) => renderConversation(conversation, true))}
                  </div>
                )}
                {!collapsed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full justify-center gap-2 rounded-2xl border border-dashed border-white/15 text-slate-400 hover:text-white"
                    onClick={() => void handleNewProjectChat()}
                  >
                    <Plus className="h-4 w-4" />
                    Add project
                  </Button>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                  <span>Recents</span>
                  {!collapsed && recents.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-slate-500 hover:text-white"
                      onClick={() => setSearchQuery('')}
                    >
                      Clear search
                    </Button>
                  )}
                </div>
                {recents.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {collapsed ? 'No chats' : 'No conversations match your search.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recents
                      .slice(0, collapsed ? 6 : 24)
                      .map((conversation) => renderConversation(conversation, true))}
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="border-t border-white/10 px-3 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/10',
                collapsed && 'justify-center',
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20">
                <CircleUserRound className="h-5 w-5 text-white" />
              </div>
              {!collapsed && (
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">Account</p>
                  <p className="text-xs text-slate-400">Manage settings</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onSelect={() => onOpenSettings?.()}>Settings</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.open(
                  'https://github.com/siddharthanagula3/agiworkforce-desktop-app',
                  '_blank',
                )
              }
            >
              Help & Feedback
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
