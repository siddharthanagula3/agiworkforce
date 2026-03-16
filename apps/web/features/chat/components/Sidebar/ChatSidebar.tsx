'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  PanelLeftClose,
  X,
  Settings,
  LogOut,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useAuthStore } from '@shared/stores/authentication-store';
import { ScrollArea } from '@shared/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/ui/alert-dialog';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal session shape accepted by ChatSidebar — compatible with both chat-store.ChatSession and shared/types.ChatSession */
export interface SessionLike {
  id: string;
  title: string;
  preview?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  messageCount?: number;
  userId?: string;
}

export interface ChatSidebarProps {
  sessions: SessionLike[];
  activeSessionId?: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onToggleSidebar?: () => void;
  collapsed?: boolean;
}

// ---------------------------------------------------------------------------
// Time grouping
// ---------------------------------------------------------------------------

function getTimeGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const d = new Date(date);
  if (d >= today) return 'Today';
  if (d >= yesterday) return 'Yesterday';
  if (d >= sevenDaysAgo) return 'Last 7 Days';
  if (d >= thirtyDaysAgo) return 'Last 30 Days';
  return 'Older';
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older'];

function groupSessions(sessions: SessionLike[]): Map<string, SessionLike[]> {
  const groups = new Map<string, SessionLike[]>();
  for (const key of GROUP_ORDER) {
    groups.set(key, []);
  }
  for (const session of sessions) {
    const raw = session.updatedAt;
    const d = raw instanceof Date ? raw : raw ? new Date(raw) : new Date();
    const safeDate = isNaN(d.getTime()) ? new Date(0) : d;
    const group = getTimeGroup(safeDate);
    const arr = groups.get(group);
    if (arr) arr.push(session);
  }
  for (const [key, value] of groups) {
    if (value.length === 0) groups.delete(key);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Session Item
// ---------------------------------------------------------------------------

const SessionItem = React.memo(function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  session: SessionLike;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue !== session.title) {
      onRename(session.id, renameValue.trim());
    }
    setIsRenaming(false);
  }, [renameValue, session.title, session.id, onRename]);

  const timestamp = useMemo(() => {
    const raw = session.updatedAt;
    const d = raw instanceof Date ? raw : raw ? new Date(raw) : new Date();
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, [session.updatedAt]);

  return (
    <>
      <div
        className={cn(
          'group relative flex items-center gap-2 px-2 py-1.5 rounded-lg mx-1 cursor-pointer transition-colors',
          isActive
            ? 'bg-black/[0.06] dark:bg-white/[0.08]'
            : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
        )}
        onClick={() => !isRenaming && onSelect(session.id)}
      >
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onBlur={handleRenameSubmit}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {session.title || 'Untitled'}
          </span>
        )}

        {!isRenaming && (
          <>
            <span className="shrink-0 text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
              {timestamp}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10 dark:hover:bg-white/10 hover:text-foreground"
                  aria-label="Session actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRenaming(true);
                  }}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteOpen(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{session.title || 'Untitled'}&rdquo; will be permanently deleted. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteOpen(false);
                onDelete(session.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

// ---------------------------------------------------------------------------
// User Profile (bottom)
// ---------------------------------------------------------------------------

const UserProfileArea = React.memo(function UserProfileArea() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="border-t border-[var(--chat-border-strong)]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
              {user?.email && (
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              )}
            </div>
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-52 mb-1">
          <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Collapsed Sidebar (icon strip — 64px)
// ---------------------------------------------------------------------------

function CollapsedSidebar({
  onNewChat,
  onToggleSidebar,
}: {
  onNewChat: () => void;
  onToggleSidebar?: () => void;
}) {
  return (
    <div className="flex w-16 h-full flex-col items-center gap-1 bg-[var(--chat-sidebar-bg)] border-r border-[var(--chat-border-strong)] py-3">
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
          aria-label="Expand sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={onNewChat}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
        aria-label="New chat"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </button>
      <div className="mt-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/30" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar Content
// ---------------------------------------------------------------------------

function ChatSidebarContent({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onToggleSidebar,
  collapsed = false,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchQuery('');
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) || (s.preview && s.preview.toLowerCase().includes(q)),
    );
  }, [sessions, searchQuery]);

  const grouped = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);

  if (collapsed) {
    return <CollapsedSidebar onNewChat={onNewChat} onToggleSidebar={onToggleSidebar} />;
  }

  return (
    <div className="flex h-full flex-col bg-[var(--chat-sidebar-bg)] border-r border-[var(--chat-border-strong)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
        <span className="text-[13px] font-semibold text-foreground">AGI Workforce</span>
      </div>

      {/* New Chat button */}
      <div className="px-3 pb-1">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4 shrink-0" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="mx-2 my-2 flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1">
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessageSquare className="mb-2 h-7 w-7 text-muted-foreground/25" />
            <p className="text-sm text-muted-foreground/50">
              {searchQuery ? 'No matching chats' : 'No conversations yet'}
            </p>
            {!searchQuery && (
              <button onClick={onNewChat} className="mt-2 text-xs text-primary hover:underline">
                Start a new chat
              </button>
            )}
          </div>
        ) : (
          Array.from(grouped.entries()).map(([group, groupSessions]) => (
            <div key={group}>
              <div className="px-3 py-1 mt-3 mb-0.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                {group}
              </div>
              {groupSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onSelect={onSelectSession}
                  onDelete={onDeleteSession}
                  onRename={onRenameSession}
                />
              ))}
            </div>
          ))
        )}
      </ScrollArea>

      {/* User profile */}
      <UserProfileArea />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export — wrapped in ErrorBoundary
// ---------------------------------------------------------------------------

export const ChatSidebar: React.FC<ChatSidebarProps> = (props) => {
  return (
    <ErrorBoundary compact componentName="Chat Sidebar">
      <ChatSidebarContent {...props} />
    </ErrorBoundary>
  );
};
