'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
  ChevronDown,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Tag,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useAuthStore } from '@shared/stores/authentication-store';
import { ScrollArea } from '@shared/ui/scroll-area';
import { ProjectSidebar } from '@features/projects/components/ProjectSidebar';
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@shared/ui/context-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/ui/collapsible';
import type { ChatSession } from '../../stores/chat-store';

// ---------------------------------------------------------------------------
// Autotag types + helpers
// ---------------------------------------------------------------------------

type ConversationTag =
  | 'coding'
  | 'research'
  | 'writing'
  | 'brainstorm'
  | 'analysis'
  | 'debug'
  | 'creative'
  | 'general';

const TAG_COLORS: Record<ConversationTag, string> = {
  coding: 'bg-blue-500/15 text-blue-400',
  research: 'bg-purple-500/15 text-purple-400',
  writing: 'bg-emerald-500/15 text-emerald-400',
  brainstorm: 'bg-amber-500/15 text-amber-400',
  analysis: 'bg-cyan-500/15 text-cyan-400',
  debug: 'bg-red-500/15 text-red-400',
  creative: 'bg-pink-500/15 text-pink-400',
  general: 'bg-zinc-500/15 text-zinc-400',
};

const ALL_TAGS: ConversationTag[] = [
  'coding',
  'research',
  'writing',
  'brainstorm',
  'analysis',
  'debug',
  'creative',
  'general',
];

function getAuthHeaders(): Record<string, string> {
  // Auth is managed via Supabase SSR cookies (set by middleware) — no manual token needed.
  return {
    'Content-Type': 'application/json',
  };
}

async function fetchBatchTags(conversationIds: string[]): Promise<Record<string, ConversationTag>> {
  if (conversationIds.length === 0) return {};
  try {
    const res = await fetch('/api/autotag/batch', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ conversationIds }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { tags?: Record<string, string> };
    return (data.tags ?? {}) as Record<string, ConversationTag>;
  } catch {
    return {};
  }
}

async function fetchConversationsByTag(tag: ConversationTag): Promise<string[]> {
  try {
    const res = await fetch(`/api/autotag/conversations?tag=${encodeURIComponent(tag)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { conversationIds?: string[] };
    return data.conversationIds ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId?: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onPinSession: (sessionId: string) => void;
  onUnpinSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
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

function groupSessions(sessions: ChatSession[]): Map<string, ChatSession[]> {
  const groups = new Map<string, ChatSession[]>();
  for (const key of GROUP_ORDER) {
    groups.set(key, []);
  }
  for (const session of sessions) {
    const d =
      session.updatedAt instanceof Date ? session.updatedAt : new Date(session.updatedAt || 0);
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

interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  tag?: ConversationTag;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}

function SessionItem({
  session,
  isActive,
  tag,
  onSelect,
  onDelete,
  onRename,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
}: SessionItemProps) {
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
    const d =
      session.updatedAt instanceof Date ? session.updatedAt : new Date(session.updatedAt || 0);
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

  const itemRow = (
    <div
      className={cn(
        'group relative flex items-center gap-2 px-2 py-1.5 rounded-lg mx-1 cursor-pointer transition-colors',
        isActive
          ? 'bg-black/[0.06] dark:bg-white/[0.08]'
          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
      )}
      onClick={() => !isRenaming && onSelect(session.id)}
    >
      {session.isPinned && (
        <Pin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50 rotate-45" />
      )}
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

      {/* Tag badge */}
      {!isRenaming && tag && tag !== 'general' && (
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium capitalize',
            TAG_COLORS[tag],
          )}
        >
          {tag}
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
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRenaming(true);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  if (session.isPinned) onUnpin(session.id);
                  else onPin(session.id);
                }}
              >
                {session.isPinned ? (
                  <PinOff className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <Pin className="mr-2 h-3.5 w-3.5" />
                )}
                {session.isPinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  if (session.isArchived) onUnarchive(session.id);
                  else onArchive(session.id);
                }}
              >
                {session.isArchived ? (
                  <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <Archive className="mr-2 h-3.5 w-3.5" />
                )}
                {session.isArchived ? 'Unarchive' : 'Archive'}
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
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{itemRow}</ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem onSelect={() => setIsRenaming(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              if (session.isPinned) onUnpin(session.id);
              else onPin(session.id);
            }}
          >
            {session.isPinned ? (
              <PinOff className="mr-2 h-3.5 w-3.5" />
            ) : (
              <Pin className="mr-2 h-3.5 w-3.5" />
            )}
            {session.isPinned ? 'Unpin' : 'Pin'}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              if (session.isArchived) onUnarchive(session.id);
              else onArchive(session.id);
            }}
          >
            {session.isArchived ? (
              <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
            ) : (
              <Archive className="mr-2 h-3.5 w-3.5" />
            )}
            {session.isArchived ? 'Unarchive' : 'Archive'}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

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
}

// ---------------------------------------------------------------------------
// User Profile (bottom)
// ---------------------------------------------------------------------------

function UserProfileArea() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

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
}

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
        onClick={() => onToggleSidebar?.()}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
        aria-label="Search conversations"
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
// Main Sidebar
// ---------------------------------------------------------------------------

export function ChatSidebarNew({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onPinSession,
  onUnpinSession,
  onArchiveSession,
  onUnarchiveSession,
  onToggleSidebar,
  collapsed = false,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<ConversationTag | null>(null);
  const [tagMap, setTagMap] = useState<Record<string, ConversationTag>>({});
  const [tagFilterIds, setTagFilterIds] = useState<Set<string> | null>(null);

  // Batch-fetch tags for all visible sessions
  useEffect(() => {
    const ids = sessions.map((s) => s.id);
    if (ids.length === 0) return;
    // Only fetch tags for IDs we haven't fetched yet
    const untaggedIds = ids.filter((id) => !(id in tagMap));
    if (untaggedIds.length === 0) return;
    void fetchBatchTags(untaggedIds).then((tags) => {
      setTagMap((prev) => ({ ...prev, ...tags }));
    });
    // Re-run when sessions list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]);

  // When tag filter changes, fetch matching conversation IDs from the server
  useEffect(() => {
    if (!tagFilter) {
      setTagFilterIds(null);
      return;
    }
    void fetchConversationsByTag(tagFilter).then((ids) => {
      setTagFilterIds(new Set(ids));
    });
  }, [tagFilter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchQuery('');
        setTagFilter(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const filteredSessions = useMemo(() => {
    let result = sessions;

    // Filter by text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) || (s.preview && s.preview.toLowerCase().includes(q)),
      );
    }

    // Filter by tag (uses server-side IDs when available, falls back to local tagMap)
    if (tagFilter) {
      if (tagFilterIds) {
        result = result.filter((s) => tagFilterIds.has(s.id));
      } else {
        result = result.filter((s) => tagMap[s.id] === tagFilter);
      }
    }

    return result;
  }, [sessions, searchQuery, tagFilter, tagFilterIds, tagMap]);

  const pinnedSessions = useMemo(
    () => filteredSessions.filter((s) => s.isPinned && !s.isArchived),
    [filteredSessions],
  );

  const activeSessions = useMemo(
    () => filteredSessions.filter((s) => !s.isPinned && !s.isArchived),
    [filteredSessions],
  );

  const archivedSessions = useMemo(
    () => filteredSessions.filter((s) => s.isArchived),
    [filteredSessions],
  );

  const grouped = useMemo(() => groupSessions(activeSessions), [activeSessions]);

  if (collapsed) {
    return <CollapsedSidebar onNewChat={onNewChat} onToggleSidebar={onToggleSidebar} />;
  }

  const renderItem = (session: ChatSession) => (
    <SessionItem
      key={session.id}
      session={session}
      isActive={session.id === activeSessionId}
      tag={tagMap[session.id] as ConversationTag | undefined}
      onSelect={onSelectSession}
      onDelete={onDeleteSession}
      onRename={onRenameSession}
      onPin={onPinSession}
      onUnpin={onUnpinSession}
      onArchive={onArchiveSession}
      onUnarchive={onUnarchiveSession}
    />
  );

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

      {/* Tag filter chips */}
      <div className="mx-2 mb-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setTagFilter(null)}
          className={cn(
            'shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
            !tagFilter
              ? 'bg-primary/15 text-primary'
              : 'bg-black/5 dark:bg-white/5 text-muted-foreground/60 hover:text-muted-foreground',
          )}
        >
          All
        </button>
        {ALL_TAGS.filter((t) => t !== 'general').map((t) => (
          <button
            key={t}
            onClick={() => setTagFilter(tagFilter === t ? null : t)}
            className={cn(
              'shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors',
              tagFilter === t
                ? TAG_COLORS[t]
                : 'bg-black/5 dark:bg-white/5 text-muted-foreground/60 hover:text-muted-foreground',
            )}
          >
            <Tag className="h-2.5 w-2.5" />
            {t}
          </button>
        ))}
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
          <>
            {/* Pinned section */}
            {pinnedSessions.length > 0 && (
              <div>
                <div className="px-3 py-1 mt-3 mb-0.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1">
                  <Pin className="h-2.5 w-2.5" />
                  Pinned
                </div>
                {pinnedSessions.map(renderItem)}
              </div>
            )}

            {/* Time-grouped active sessions */}
            {Array.from(grouped.entries()).map(([group, groupSessions]) => (
              <div key={group}>
                <div className="px-3 py-1 mt-3 mb-0.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  {group}
                </div>
                {groupSessions.map(renderItem)}
              </div>
            ))}

            {/* Archived section — collapsible */}
            {archivedSessions.length > 0 && (
              <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center gap-1 px-3 py-1 mt-3 mb-0.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider hover:text-muted-foreground transition-colors">
                    <Archive className="h-2.5 w-2.5" />
                    Archived ({archivedSessions.length})
                    <ChevronDown
                      className={cn(
                        'ml-auto h-3 w-3 transition-transform',
                        archiveOpen && 'rotate-180',
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>{archivedSessions.map(renderItem)}</CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </ScrollArea>

      {/* Projects panel — create/switch projects for shared context */}
      <div className="mx-2 border-t border-[var(--chat-border-subtle)]">
        <ProjectSidebar />
      </div>

      {/* User profile */}
      <UserProfileArea />
    </div>
  );
}
