import { ChevronLeft, ChevronRight, MessageCircle, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationUI } from '../../types/chat';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const {
    conversations,
    activeConversationId,
    selectConversation,
    createConversation,
    renameConversation,
  } = useChatStore();

  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const haystack =
        `${conversation.title ?? ''} ${conversation.lastMessage ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, searchQuery]);

  const handleNewTask = useCallback(async () => {
    const id = await createConversation('New Task');
    await selectConversation(id);
  }, [createConversation, selectConversation]);

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
    (conversation: ConversationUI) => {
      const isActive = conversation.id === activeConversationId;
      const isEditing = conversation.id === editingId;
      const title = conversation.title?.trim() || 'Untitled task';
      const subtitle = conversation.lastMessage?.trim() || 'No activity yet';

      return (
        <button
          key={conversation.id}
          type="button"
          className={cn(
            'group flex w-full flex-col gap-1 rounded-xl px-3 py-2 text-left transition-colors',
            isActive ? 'bg-primary/10 text-primary' : 'hover:bg-primary/5',
          )}
          onClick={() => void handleSelectConversation(conversation.id)}
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
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
              <div className="flex-1 truncate text-sm font-medium">{title}</div>
            )}
          </div>
          {!isEditing && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">{subtitle}</span>
              <button
                type="button"
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingId(conversation.id);
                  setEditingTitle(title);
                }}
              >
                Rename
              </button>
            </div>
          )}
        </button>
      );
    },
    [activeConversationId, editingId, editingTitle, handleRename, handleSelectConversation],
  );

  return (
    <aside
      className={cn(
        'relative flex h-full w-72 flex-col border-r border-border/60 bg-background/95 backdrop-blur-xl transition-all duration-200',
        collapsed && 'w-20',
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            AGI
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold">Autopilot</p>
              <p className="text-xs text-muted-foreground">Auto approve enabled</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsed && (
        <div className="space-y-3 px-3">
          <Button className="w-full" onClick={handleNewTask}>
            <Plus className="mr-2 h-4 w-4" />
            New Automation Task
          </Button>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tasks"
            className="h-9 bg-background/80"
          />
        </div>
      )}

      <ScrollArea className="flex-1 px-2 py-4">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
            <MessageCircle className="h-5 w-5" />
            <p>No tasks yet. Start a new automation.</p>
            {!collapsed && (
              <Button variant="link" size="sm" onClick={handleNewTask}>
                Start new task
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">{filtered.map(renderConversation)}</div>
        )}
      </ScrollArea>

      <div className="border-t border-border/60 bg-background/80 px-3 py-2">
        {!collapsed && (
          <p className="text-xs text-muted-foreground text-center">
            Press{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              Cmd+K
            </kbd>{' '}
            for more options
          </p>
        )}
      </div>
    </aside>
  );
}
