import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  Blocks,
  ChevronLeft,
  ChevronRight,
  Code2,
  Mail,
  Calendar,
  CheckSquare,
  FileText,
  Smartphone,
  ShieldCheck,
  Cloud,
  Database,
  Globe,
  HardDrive,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MoreVertical,
  Network,
  Plus,
  Pin,
  PinOff,
  Search,
  Terminal,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { Input } from '../ui/Input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/Tooltip';
import type { ConversationUI } from '../../types/chat';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import { useTrayQuickActions } from '../../hooks/useTrayQuickActions';
import { SettingsPanel } from '../Settings/SettingsPanel';
import { CostSidebarWidget } from '../Analytics/CostSidebarWidget';

const STORAGE_KEY = 'agiworkforce.sidebar.collapsed';

export type NavSection =
  | 'dashboard'
  | 'chats'
  | 'migration'
  | 'projects'
  | 'artifacts'
  | 'code'
  | 'terminal'
  | 'browser'
  | 'files'
  | 'database'
  | 'communications'
  | 'calendar'
  | 'productivity'
  | 'documents'
  | 'mobile'
  | 'security'
  | 'api';

interface SidebarProps {
  className?: string;
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
}

function SidebarNavItem({
  icon: Icon,
  label,
  shortcut,
  active,
  collapsed,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'w-full justify-start gap-3 text-sm font-medium transition-colors',
        'hover:bg-primary/10 hover:text-primary',
        active && 'bg-primary/10 text-primary shadow-inner',
        collapsed ? 'px-2 py-2 h-10 justify-center' : 'px-3 py-2 h-10',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <span className="flex-1 text-left truncate">
          {label}
          {shortcut && <span className="ml-2 text-xs text-muted-foreground">{shortcut}</span>}
        </span>
      )}
    </Button>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right">
            <div className="flex items-center gap-2">
              <span>{label}</span>
              {shortcut && <span className="text-xs text-muted-foreground">{shortcut}</span>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

export function Sidebar({ className, activeSection, onSectionChange }: SidebarProps) {
  const {
    conversations,
    activeConversationId,
    selectConversation,
    createConversation,
    deleteConversation,
    togglePinnedConversation,
    renameConversation,
  } = useChatStore();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? value === 'true' : false;
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingSearchFocus, setPendingSearchFocus] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingInitialTitle, setEditingInitialTitle] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameCancelledRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!collapsed && pendingSearchFocus) {
      const node = searchInputRef.current;
      if (node) {
        node.focus();
        node.select();
      }
      setPendingSearchFocus(false);
    }
  }, [collapsed, pendingSearchFocus]);

  useEffect(() => {
    if (editingConversationId !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingConversationId]);

  const unreadCount = useMemo(
    () => conversations.reduce((count, conversation) => count + (conversation.unreadCount ?? 0), 0),
    [conversations],
  );

  const handleTrayNewConversation = useCallback(async () => {
    try {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      await createConversation(`Quick chat · ${timestamp}`);
    } catch (error) {
      console.error('[tray] failed to create conversation from tray', error);
    }
  }, [createConversation]);

  const handleTrayOpenSettings = useCallback(() => {
    setSettingsOpen(true);
  }, [setSettingsOpen]);

  useTrayQuickActions({
    onNewConversation: handleTrayNewConversation,
    onOpenSettings: handleTrayOpenSettings,
    unreadCount,
  });

  const filteredConversations = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const base = term
      ? conversations.filter((conversation) => {
          const haystack = `${conversation.title || 'untitled conversation'} ${
            conversation.lastMessage || ''
          }`.toLowerCase();
          return haystack.includes(term);
        })
      : conversations;

    return {
      pinned: base.filter((conversation) => conversation.pinned),
      others: base.filter((conversation) => !conversation.pinned),
    };
  }, [conversations, searchQuery]);

  const compactList = useMemo(
    () => [...filteredConversations.pinned, ...filteredConversations.others].slice(0, 5),
    [filteredConversations],
  );
  const { pinned: pinnedConversations, others: otherConversations } = filteredConversations;
  const hasFilteredResults = pinnedConversations.length > 0 || otherConversations.length > 0;

  const handleNewChat = async () => {
    const conversationId = await createConversation('New Conversation');
    await selectConversation(conversationId);
    onSectionChange('chats');
  };

  const handleSelectConversation = async (id: number) => {
    await selectConversation(id);
    onSectionChange('chats');
  };

  const handleTogglePin = async (id: number) => {
    await togglePinnedConversation(id);
  };

  const clearRenameState = () => {
    renameInputRef.current = null;
    setEditingConversationId(null);
    setEditingTitle('');
    setEditingInitialTitle('');
  };

  const handleStartRename = (conversation: ConversationUI) => {
    const currentTitle = conversation.title?.trim() || 'Untitled conversation';
    renameCancelledRef.current = false;
    setEditingConversationId(conversation.id);
    setEditingTitle(currentTitle);
    setEditingInitialTitle(currentTitle);
  };

  const handleRenameCancel = () => {
    renameCancelledRef.current = true;
    clearRenameState();
  };

  const handleRenameSubmit = async () => {
    if (editingConversationId === null) {
      return;
    }
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      window.alert('Title cannot be empty');
      return;
    }
    if (trimmed === editingInitialTitle.trim()) {
      clearRenameState();
      return;
    }
    try {
      await renameConversation(editingConversationId, trimmed);
      clearRenameState();
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      window.alert('Failed to rename conversation. Please try again.');
    }
  };

  const handleRenameInputBlur = () => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }
    void handleRenameSubmit();
  };

  const handleRenameInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleRenameSubmit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      handleRenameCancel();
    }
  };

  const renderConversation = (conversation: ConversationUI) => {
    const isActive = activeConversationId === conversation.id;
    const isEditing = editingConversationId === conversation.id;
    const title = conversation.title || 'Untitled conversation';
    const lastMessage = conversation.lastMessage || 'No messages yet';

    const handleConversationClick = () => {
      if (isEditing) {
        return;
      }
      void handleSelectConversation(conversation.id);
    };

    return (
      <div
        key={conversation.id}
        className={cn(
          'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors',
          isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
          isEditing && 'bg-background',
        )}
        onClick={handleConversationClick}
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              ref={(element) => {
                if (isEditing) {
                  renameInputRef.current = element;
                }
              }}
              value={editingTitle}
              onChange={(event) => setEditingTitle(event.target.value)}
              onBlur={handleRenameInputBlur}
              onKeyDown={handleRenameInputKeyDown}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Rename conversation"
            />
          ) : (
            <>
              <p className="truncate text-sm font-medium text-foreground">{title}</p>
              <p className="truncate text-xs text-muted-foreground">{lastMessage}</p>
            </>
          )}
        </div>
        {!isEditing && (
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
                    className={cn(
                      'h-7 w-7 text-muted-foreground transition-opacity hover:text-primary focus-visible:opacity-100',
                      conversation.pinned
                        ? 'opacity-100 text-primary'
                        : 'opacity-0 group-hover:opacity-100',
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleTogglePin(conversation.id);
                    }}
                  >
                    {conversation.pinned ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Open conversation menu"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onClick={(event) => event.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelectConversation(conversation.id);
                  }}
                >
                  Open conversation
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    handleStartRename(conversation);
                  }}
                >
                  Rename conversation
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    handleTogglePin(conversation.id);
                  }}
                >
                  {conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    const confirmDelete = window.confirm(
                      'Delete this conversation? This action cannot be undone.',
                    );
                    if (!confirmDelete) {
                      return;
                    }
                    void deleteConversation(conversation.id);
                  }}
                >
                  Delete conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    );
  };

  const widthClass = collapsed ? 'w-16' : 'w-72';

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border/60 bg-muted/20 text-sm text-muted-foreground backdrop-blur-sm',
        widthClass,
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setCollapsed((prev) => !prev)}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Toggle sidebar Ctrl+\</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {!collapsed && (
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Menu className="h-4 w-4 text-primary" />
            <span>Claude Mode</span>
          </div>
        )}
      </div>

      <div className="px-3 pb-2">
        <Button
          onClick={handleNewChat}
          className={cn(
            'w-full justify-start gap-3 font-medium transition-colors',
            collapsed ? 'h-10 justify-center px-0' : 'h-10 px-3',
            'bg-primary/90 text-primary-foreground hover:bg-primary',
          )}
        >
          <Plus className="h-4 w-4" />
          {!collapsed && <span>New chat</span>}
        </Button>
      </div>

      <div className="px-3 pb-2">
        {!collapsed ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search conversations..."
              className="pl-9 pr-3 text-sm"
            />
          </div>
        ) : (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-full justify-center"
                  onClick={() => {
                    setPendingSearchFocus(true);
                    setCollapsed(false);
                  }}
                  aria-label="Expand sidebar to search conversations"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand to search conversations</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <nav className="px-2 space-y-1">
        <SidebarNavItem
          icon={LayoutDashboard}
          label="Overview"
          shortcut="Ctrl+Shift+D"
          active={activeSection === 'dashboard'}
          collapsed={collapsed}
          onClick={() => onSectionChange('dashboard')}
        />
        <SidebarNavItem
          icon={ArrowLeftRight}
          label="Migrations"
          active={activeSection === 'migration'}
          collapsed={collapsed}
          onClick={() => onSectionChange('migration')}
        />
        <SidebarNavItem
          icon={MessageCircle}
          label="Chats"
          active={activeSection === 'chats'}
          collapsed={collapsed}
          onClick={() => onSectionChange('chats')}
        />
        <SidebarNavItem
          icon={Cloud}
          label="Cloud Storage"
          active={activeSection === 'projects'}
          collapsed={collapsed}
          onClick={() => onSectionChange('projects')}
        />
        <SidebarNavItem
          icon={Blocks}
          label="Artifacts"
          active={activeSection === 'artifacts'}
          collapsed={collapsed}
          onClick={() => onSectionChange('artifacts')}
        />
        <SidebarNavItem
          icon={Code2}
          label="Code"
          active={activeSection === 'code'}
          collapsed={collapsed}
          onClick={() => onSectionChange('code')}
        />
        <SidebarNavItem
          icon={Terminal}
          label="Terminal"
          active={activeSection === 'terminal'}
          collapsed={collapsed}
          onClick={() => onSectionChange('terminal')}
        />
        <SidebarNavItem
          icon={Globe}
          label="Browser"
          active={activeSection === 'browser'}
          collapsed={collapsed}
          onClick={() => onSectionChange('browser')}
        />
        <SidebarNavItem
          icon={HardDrive}
          label="Files"
          active={activeSection === 'files'}
          collapsed={collapsed}
          onClick={() => onSectionChange('files')}
        />
        <SidebarNavItem
          icon={Database}
          label="Database"
          active={activeSection === 'database'}
          collapsed={collapsed}
          onClick={() => onSectionChange('database')}
        />
        <SidebarNavItem
          icon={Mail}
          label="Email"
          active={activeSection === 'communications'}
          collapsed={collapsed}
          onClick={() => onSectionChange('communications')}
        />
        <SidebarNavItem
          icon={Calendar}
          label="Calendar"
          active={activeSection === 'calendar'}
          collapsed={collapsed}
          onClick={() => onSectionChange('calendar')}
        />
        <SidebarNavItem
          icon={CheckSquare}
          label="Productivity"
          active={activeSection === 'productivity'}
          collapsed={collapsed}
          onClick={() => onSectionChange('productivity')}
        />
        <SidebarNavItem
          icon={FileText}
          label="Documents"
          active={activeSection === 'documents'}
          collapsed={collapsed}
          onClick={() => onSectionChange('documents')}
        />
        <SidebarNavItem
          icon={Smartphone}
          label="Mobile"
          active={activeSection === 'mobile'}
          collapsed={collapsed}
          onClick={() => onSectionChange('mobile')}
        />
        <SidebarNavItem
          icon={ShieldCheck}
          label="Security"
          active={activeSection === 'security'}
          collapsed={collapsed}
          onClick={() => onSectionChange('security')}
        />
        <SidebarNavItem
          icon={Network}
          label="API"
          active={activeSection === 'api'}
          collapsed={collapsed}
          onClick={() => onSectionChange('api')}
        />
      </nav>

      <div className="mt-2 flex-1 px-1">
        {!collapsed ? (
          <ScrollArea className="h-full">
            <div className="space-y-4 px-1 pb-4">
              <CostSidebarWidget onOpenDashboard={() => onSectionChange('dashboard')} />
              {hasFilteredResults ? (
                <>
                  {pinnedConversations.length > 0 && (
                    <div className="space-y-1">
                      <div className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Pinned
                      </div>
                      <div className="space-y-1">
                        {pinnedConversations.map((conversation) =>
                          renderConversation(conversation),
                        )}
                      </div>
                    </div>
                  )}

                  {otherConversations.length > 0 && (
                    <div className="space-y-1">
                      <div className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {pinnedConversations.length > 0 ? 'Recent' : 'Conversations'}
                      </div>
                      <div className="space-y-1">
                        {otherConversations.map((conversation) => renderConversation(conversation))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-md border border-dashed border-border/60 bg-background/60 px-3 py-4 text-xs text-muted-foreground">
                  {searchQuery
                    ? `No conversations match "${searchQuery}".`
                    : 'Conversations you create will appear here.'}
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <CostSidebarWidget collapsed onOpenDashboard={() => onSectionChange('dashboard')} />
            {compactList.length === 0 ? (
              <div className="rounded-full border border-dashed border-border/60 px-3 py-2 text-center text-xs text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              compactList.map((conversation) => (
                <TooltipProvider key={conversation.id} delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-10 w-10 rounded-full border border-transparent transition-colors',
                          activeConversationId === conversation.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'hover:bg-accent',
                          conversation.pinned && 'border-primary/70',
                        )}
                        onClick={() => handleSelectConversation(conversation.id)}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="font-medium">{conversation.title || 'Untitled conversation'}</p>
                      <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {conversation.lastMessage || 'No messages yet'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border border-transparent bg-background/70 px-3 py-2 text-left transition-colors hover:border-border hover:bg-background',
                collapsed && 'justify-center px-0',
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                SN
              </div>
              {!collapsed && (
                <div className="flex flex-1 flex-col overflow-hidden text-xs">
                  <span className="truncate text-sm font-medium text-foreground">
                    Siddhartha Nagula
                  </span>
                  <span className="truncate text-muted-foreground">Pro plan</span>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align={collapsed ? 'center' : 'start'} side="top">
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              founders@agiagentautomation.com
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              Settings
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+,</span>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Language</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>English</DropdownMenuItem>
                <DropdownMenuItem>Deutsch</DropdownMenuItem>
                <DropdownMenuItem>Japanese</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={() => window.open('https://docs.agiworkforce.com', '_blank')}
            >
              Get help
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => window.open('https://agiworkforce.com/pricing', '_blank')}
            >
              Upgrade plan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open('https://agiworkforce.com', '_blank')}>
              Learn more
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => console.log('Log out clicked - auth integration pending')}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}

export default Sidebar;
