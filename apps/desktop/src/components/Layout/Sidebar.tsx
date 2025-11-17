import { ChevronLeft, ChevronRight, HelpCircle, MessageCircle, Plus, Settings } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import type { ConversationUI } from '../../types/chat';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import type { AppView } from '../../App';

interface SidebarProps {
  className?: string;
  onOpenSettings?: () => void;
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

export function Sidebar({ className, onOpenSettings, currentView, onViewChange }: SidebarProps) {
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

  const navigationItems = [
    { id: 'enhanced-chat' as AppView, label: 'Chat', icon: MessageCircle },
  ];

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
        'relative flex h-full w-72 flex-col border-r border-border/60 bg-background/95 backdrop-blur-xl transition-all duration-300 ease-in-out',
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
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation Menu */}
      <div className="px-3 pb-3 border-b border-border/60">
        {!collapsed ? (
          <div className="space-y-1">
            {navigationItems.map((item) => (
              <Button
                key={item.id}
                variant={currentView === item.id ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start',
                  currentView === item.id && 'bg-primary/10 text-primary hover:bg-primary/15',
                )}
                onClick={() => onViewChange(item.id)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {navigationItems.map((item) => (
              <Button
                key={item.id}
                variant={currentView === item.id ? 'secondary' : 'ghost'}
                size="icon"
                className={cn(
                  'w-full',
                  currentView === item.id && 'bg-primary/10 text-primary hover:bg-primary/15',
                )}
                onClick={() => onViewChange(item.id)}
                title={item.label}
              >
                <item.icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
        )}
      </div>

      {!collapsed && currentView === 'enhanced-chat' && (
        <div className="space-y-3 px-3 pt-3">
          <Button className="w-full" onClick={handleNewTask}>
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search conversations"
            className="h-9 bg-background/80"
          />
        </div>
      )}

      {currentView === 'enhanced-chat' && (
        <ScrollArea className="flex-1 px-2 py-4">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-5 w-5" />
              <p>No conversations yet. Start a new chat.</p>
              {!collapsed && (
                <Button variant="link" size="sm" onClick={handleNewTask}>
                  Start new chat
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">{filtered.map(renderConversation)}</div>
          )}
        </ScrollArea>
      )}

      {currentView !== 'enhanced-chat' && !collapsed && (
        <div className="flex-1 px-4 py-6 text-center text-sm text-muted-foreground">
          <p>Navigate using the menu above</p>
        </div>
      )}

      {/* Bottom Actions - Similar to Claude Desktop/OpenAI */}
      <div className="border-t border-border/60 bg-background/80">
        <div className="px-3 py-2 space-y-1">
          {!collapsed ? (
            <>
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => onOpenSettings?.()}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={() => {
                  // TODO: Implement help/feedback
                  window.open(
                    'https://github.com/siddharthanagula3/agiworkforce-desktop-app',
                    '_blank',
                  );
                }}
              >
                <HelpCircle className="mr-2 h-4 w-4" />
                Help & Feedback
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => onOpenSettings?.()}
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => {
                  window.open(
                    'https://github.com/siddharthanagula3/agiworkforce-desktop-app',
                    '_blank',
                  );
                }}
                title="Help"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* User Profile Section - Similar to Claude Desktop */}
        <div className="px-3 py-2 border-t border-border/60">
          {!collapsed ? (
            <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors cursor-pointer group">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                SN
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Siddhartha Nagula</p>
                <p className="text-xs text-muted-foreground truncate">Pro plan</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => {
                  // TODO: Implement user menu
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                SN
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
