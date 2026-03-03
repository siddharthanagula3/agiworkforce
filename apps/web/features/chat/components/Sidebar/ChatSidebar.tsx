import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { ScrollArea } from '@shared/ui/scroll-area';
import { Separator } from '@shared/ui/separator';
import { Skeleton } from '@shared/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@shared/ui/avatar';
import {
  Plus,
  Search,
  MessageSquare,
  MoreHorizontal,
  LayoutDashboard,
  Sparkles,
  Users,
  Store,
  ImageIcon,
  Settings,
  CreditCard,
  HelpCircle,
  LogOut,
  ChevronUp,
} from 'lucide-react';
import { useAuthStore } from '@shared/stores/authentication-store';
import type { ChatSession } from '../../types';
import { ConversationListItem } from './ConversationListItem';
import { FolderManagement } from './FolderManagement';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  searchQuery: string;
  selectedFolderId?: string | null;
  isLoading?: boolean;
  onSearchChange: (query: string) => void;
  onNewChat: () => void;
  onSessionSelect: (session: ChatSession) => void;
  onSessionRename: (sessionId: string, newTitle: string) => void;
  onSessionDelete: (sessionId: string) => void;
  onToggleSidebar: () => void;
  onSessionStar?: (sessionId: string) => void;
  onSessionPin?: (sessionId: string) => void;
  onSessionArchive?: (sessionId: string) => void;
  onSessionShare?: (sessionId: string) => void;
  onSessionDuplicate?: (sessionId: string) => void;
  onFolderSelect?: (folderId: string | null) => void;
  onMoveSessionToFolder?: (sessionId: string, folderId: string | null) => void;
}

/**
 * Skeleton loader for chat session items - memoized since it's static
 */
const SessionSkeleton = memo(function SessionSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg p-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
});

/** Compact navigation link */
const NavLink = memo(function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
});

/** User profile dropdown at sidebar bottom — opens upward */
const UserProfileDropdown = memo(function UserProfileDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.push('/login');
  };

  const navigate = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="relative border-t border-border" ref={ref}>
      {/* Dropdown menu — opens upward */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="py-1">
            <button
              onClick={() => navigate('/dashboard/settings')}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              Settings
            </button>
            <button
              onClick={() => navigate('/dashboard/billing')}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Billing & Usage
            </button>
            <button
              onClick={() => navigate('/dashboard/support')}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              Help & Support
            </button>
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted"
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={user?.avatar} />
          <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          {user?.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
        </div>
        <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
});

const ChatSidebarContent = memo(function ChatSidebarContent({
  sessions,
  currentSession,
  searchQuery,
  selectedFolderId,
  isLoading = false,
  onSearchChange,
  onNewChat,
  onSessionSelect,
  onSessionRename,
  onSessionDelete,
  onToggleSidebar,
  onSessionStar,
  onSessionPin,
  onSessionArchive,
  onSessionShare,
  onSessionDuplicate,
  onFolderSelect,
  onMoveSessionToFolder,
}: ChatSidebarProps) {
  // Memoize search change handler
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange],
  );

  // Memoize session count display

  return (
    <div className="flex h-full flex-col bg-card/50 backdrop-blur-sm">
      {/* Header */}
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">AGI Workforce</span>
          <Button variant="ghost" size="sm" onClick={onToggleSidebar} className="h-7 w-7 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={onNewChat} className="w-full gap-2" size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9 h-8 text-sm"
          />
        </div>
      </div>

      {/* Folder Management */}
      {onFolderSelect && onMoveSessionToFolder && (
        <>
          <Separator />
          <div className="py-2">
            <FolderManagement
              selectedFolderId={selectedFolderId || null}
              onFolderSelect={onFolderSelect}
              onMoveSession={onMoveSessionToFolder}
            />
          </div>
          <Separator />
        </>
      )}

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <SessionSkeleton />
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-sm">No chat history yet</p>
            <p className="text-xs">Start a new conversation</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {sessions.map((session) => {
              // Safely convert updatedAt to Date object
              // Use a stable fallback (epoch start) to avoid impure Date.now() during render
              const updatedAt =
                session.updatedAt instanceof Date
                  ? session.updatedAt
                  : new Date(session.updatedAt || 0);

              // Validate date - use epoch start as stable fallback (not new Date() which changes every render)
              const safeUpdatedAt = isNaN(updatedAt.getTime()) ? new Date(0) : updatedAt;

              return (
                <ConversationListItem
                  key={session.id}
                  id={session.id}
                  title={session.title}
                  summary={session.summary}
                  updatedAt={safeUpdatedAt}
                  totalMessages={session.messageCount}
                  isActive={currentSession?.id === session.id}
                  isStarred={session.metadata?.['starred'] as boolean | undefined}
                  isPinned={session.metadata?.['pinned'] as boolean | undefined}
                  isArchived={session.metadata?.['archived'] as boolean | undefined}
                  tags={(session.metadata?.['tags'] as string[] | undefined) || []}
                  onClick={() => onSessionSelect(session)}
                  onRename={() => onSessionRename(session.id, session.title)}
                  onDelete={() => onSessionDelete(session.id)}
                  onStar={onSessionStar ? () => onSessionStar(session.id) : undefined}
                  onPin={onSessionPin ? () => onSessionPin(session.id) : undefined}
                  onArchive={onSessionArchive ? () => onSessionArchive(session.id) : undefined}
                  onShare={onSessionShare ? () => onSessionShare(session.id) : undefined}
                  onDuplicate={
                    onSessionDuplicate ? () => onSessionDuplicate(session.id) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Navigation Links */}
      <div className="border-t border-border px-2 py-2">
        <div className="grid grid-cols-2 gap-1">
          <NavLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavLink href="/dashboard/vibe" icon={Sparkles} label="VIBE" />
          <NavLink href="/dashboard/agents" icon={Users} label="Agents" />
          <NavLink href="/dashboard/hire" icon={Store} label="Marketplace" />
          <NavLink href="/dashboard/media" icon={ImageIcon} label="Media" />
        </div>
      </div>

      {/* User Profile */}
      <UserProfileDropdown />
    </div>
  );
});

/**
 * ChatSidebar - Chat history sidebar with error boundary protection
 */
export const ChatSidebar: React.FC<ChatSidebarProps> = (props) => {
  return (
    <ErrorBoundary compact componentName="Chat Sidebar">
      <ChatSidebarContent {...props} />
    </ErrorBoundary>
  );
};
