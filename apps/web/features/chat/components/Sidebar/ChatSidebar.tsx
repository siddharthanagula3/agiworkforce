'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  MessageSquare,
  Settings,
  LogOut,
  ChevronUp,
  ChevronRight,
  CheckSquare,
  Folder,
  Layers,
  Library,
  PanelLeft,
  Plus,
  Download,
  HelpCircle,
  CreditCard,
  Keyboard,
  Globe,
} from 'lucide-react';
import { useClerk } from '@clerk/nextjs';
import { cn } from '@shared/lib/utils';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useBillingStore } from '@/stores/unified/auth';
import { ScrollArea } from '@shared/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { useDirectoryStore } from '@features/chat/stores/directory-store';
import { ConversationListItem } from './ConversationListItem';
import { GlobalSearchDialog } from '@features/chat/components/dialogs/GlobalSearchDialog';
import { KeyboardShortcutsDialog } from '@features/chat/components/dialogs/KeyboardShortcutsDialog';
import type { KeyboardShortcut } from '@features/chat/hooks/use-keyboard-shortcuts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal session shape accepted by ChatSidebar · compatible with both chat-store.ChatSession and shared/types.ChatSession */
export interface SessionLike {
  id: string;
  title: string;
  preview?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  messageCount?: number;
  userId?: string;
  isPinned?: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
}

export interface ChatSidebarProps {
  sessions: SessionLike[];
  activeSessionId?: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (sessionId: string) => void | Promise<boolean | void>;
  onRenameSession: (sessionId: string, title: string) => void;
  onToggleSidebar?: () => void;
  collapsed?: boolean;
  /** Optional rich-action callbacks · rendered in ConversationListItem when provided */
  onPinSession?: (sessionId: string) => void;
  onStarSession?: (sessionId: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  onShareSession?: (sessionId: string) => void;
  onDuplicateSession?: (sessionId: string) => void;
  /** Move a session to a project. Called with (sessionId, projectId). */
  onMoveToProjectSession?: (sessionId: string, projectId: string) => void | Promise<boolean | void>;
  /** Opens the Cloud Managed waitlist modal from upgrade affordances. */
  onUpgradeRequest?: () => void;
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

const GROUP_ORDER = ['Pinned', 'Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older'];

function groupSessions(sessions: SessionLike[]): Map<string, SessionLike[]> {
  const groups = new Map<string, SessionLike[]>();
  for (const key of GROUP_ORDER) {
    groups.set(key, []);
  }
  for (const session of sessions) {
    // Pinned sessions get their own top section regardless of date.
    if (session.isPinned) {
      groups.get('Pinned')!.push(session);
      continue;
    }
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
  onPin,
  onStar,
  onArchive,
  onShare,
  onDuplicate,
  onMoveToProject,
  bulkMode = false,
  isChecked = false,
  onToggleCheck,
}: {
  session: SessionLike;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void | Promise<boolean | void>;
  onRename: (id: string, title: string) => void;
  onPin?: (id: string) => void;
  onStar?: (id: string) => void;
  onArchive?: (id: string) => void;
  onShare?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onMoveToProject?: (id: string, projectId: string) => void | Promise<boolean | void>;
  bulkMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (id: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
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

  const updatedAtDate = useMemo(() => {
    const raw = session.updatedAt;
    const d = raw instanceof Date ? raw : raw ? new Date(raw) : new Date();
    return isNaN(d.getTime()) ? new Date(0) : d;
  }, [session.updatedAt]);

  // Bulk-mode: show a checkbox row, no rich menu
  if (bulkMode) {
    return (
      <div
        className={cn(
          'group relative flex items-center gap-2 px-2 py-1.5 rounded-lg mx-1 cursor-pointer transition-colors',
          isChecked ? 'bg-primary/10' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
        )}
        onClick={() => onToggleCheck?.(session.id)}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggleCheck?.(session.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {session.title || 'Untitled'}
        </span>
      </div>
    );
  }

  // Inline-rename mode: plain text input, no rich menu
  if (isRenaming) {
    return (
      <div className="group relative flex items-center gap-2 px-2 py-1.5 rounded-lg mx-1">
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
      </div>
    );
  }

  // Normal mode: delegate to ConversationListItem for rich hover actions
  return (
    <div className="mx-1">
      <ConversationListItem
        id={session.id}
        title={session.title || 'Untitled'}
        updatedAt={updatedAtDate}
        totalMessages={session.messageCount ?? 0}
        isActive={isActive}
        isPinned={session.isPinned}
        isStarred={session.isStarred}
        isArchived={session.isArchived}
        onClick={() => onSelect(session.id)}
        onRename={() => setIsRenaming(true)}
        onDelete={() => onDelete(session.id)}
        onPin={onPin ? () => onPin(session.id) : undefined}
        onStar={onStar ? () => onStar(session.id) : undefined}
        onArchive={onArchive ? () => onArchive(session.id) : undefined}
        onShare={onShare ? () => onShare(session.id) : undefined}
        onDuplicate={onDuplicate ? () => onDuplicate(session.id) : undefined}
        onMoveToProject={
          onMoveToProject
            ? (projectId: string) => onMoveToProject(session.id, projectId)
            : undefined
        }
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// User Profile (bottom)
// ---------------------------------------------------------------------------

const UserProfileArea = React.memo(function UserProfileArea({
  onUpgradeRequest,
  onOpenKeyboardShortcuts,
}: {
  onUpgradeRequest?: () => void;
  onOpenKeyboardShortcuts: () => void;
}) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { signOut: clerkSignOut } = useClerk();
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';
  const tierLabel =
    tier === 'free'
      ? 'Free'
      : tier === 'hobby'
        ? 'Hobby'
        : tier === 'pro'
          ? 'Pro'
          : tier === 'max'
            ? 'Max'
            : tier === 'enterprise'
              ? 'Enterprise'
              : null;

  const handleLogout = useCallback(async () => {
    // Run store cleanup first (clears localStorage before browser navigation).
    // Clerk's signOut with redirectUrl triggers a location change, which may
    // abort subsequent async work before cleanupAllStores() can complete.
    await logout();
    await clerkSignOut({ redirectUrl: '/login' });
  }, [clerkSignOut, logout]);

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="border-t border-[var(--chat-border-strong)]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account menu for ${displayName}`}
            className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
                {tierLabel && tier === 'free' ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/20">
                    Upgrade
                  </span>
                ) : tierLabel ? (
                  <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tierLabel}
                  </span>
                ) : null}
              </div>
              {user?.email && (
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              )}
            </div>
            <ChevronUp
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
          <DropdownMenuItem onClick={() => router.push('/settings/general')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="mr-2 h-4 w-4" />
              Language
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuItem disabled>English</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => router.push('/help')}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Get help
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onUpgradeRequest} disabled={!onUpgradeRequest}>
            <CreditCard className="mr-2 h-4 w-4" />
            Upgrade
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/download')}>
            <Download className="mr-2 h-4 w-4" />
            Get apps and extensions
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenKeyboardShortcuts}>
            <Keyboard className="mr-2 h-4 w-4" />
            Keyboard shortcuts
            <span className="ml-auto text-[10px] text-muted-foreground">?</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Collapsed Sidebar · claude.ai icon-rail pattern (~50px)
// ---------------------------------------------------------------------------

const RAIL_BTN =
  'flex h-9 w-9 items-center justify-center rounded-lg text-[var(--chat-text-muted)] hover:bg-white/[0.08] hover:text-[var(--chat-text-primary)] transition-colors';

function CollapsedSidebar({
  onNewChat,
  onToggleSidebar,
  onOpenSearch,
}: {
  onNewChat: () => void;
  onToggleSidebar?: () => void;
  onOpenSearch: () => void;
}) {
  const router = useRouter();
  const { user } = useAuthStore();
  const openDirectory = useDirectoryStore((s) => s.setOpen);
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  return (
    <div className="flex w-[50px] h-full flex-col items-center bg-[var(--chat-sidebar-bg)] py-2 gap-1">
      <button
        onClick={onToggleSidebar}
        className={RAIL_BTN}
        title="Expand sidebar"
        aria-label="Expand sidebar"
      >
        <PanelLeft className="h-[18px] w-[18px]" />
      </button>

      <button onClick={onNewChat} className={RAIL_BTN} title="New chat" aria-label="New chat">
        <Plus className="h-[18px] w-[18px]" />
      </button>

      <button onClick={onOpenSearch} className={RAIL_BTN} title="Search" aria-label="Search">
        <Search className="h-[18px] w-[18px]" />
      </button>

      <button
        onClick={() => router.push('/chat')}
        className={RAIL_BTN}
        title="Chats"
        aria-label="Chats"
      >
        <MessageSquare className="h-[18px] w-[18px]" />
      </button>

      <button
        onClick={() => router.push('/projects')}
        className={RAIL_BTN}
        title="Projects"
        aria-label="Projects"
      >
        <Folder className="h-[18px] w-[18px]" />
      </button>

      <button
        onClick={() => openDirectory(true)}
        className={RAIL_BTN}
        title="Directory"
        aria-label="Directory"
      >
        <Library className="h-[18px] w-[18px]" />
      </button>

      <button
        onClick={() => router.push('/customize')}
        className={RAIL_BTN}
        title="Customize"
        aria-label="Customize"
      >
        <Settings className="h-[18px] w-[18px]" />
      </button>

      <div className="flex-1" />

      <button
        onClick={() => router.push('/download')}
        className={cn(RAIL_BTN, 'relative')}
        title="Get apps and extensions"
        aria-label="Get apps and extensions"
      >
        <Download className="h-[18px] w-[18px]" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-500" />
      </button>

      <button
        onClick={() => router.push('/settings/general')}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold bg-[var(--chat-accent-primary)] text-white"
        title={user?.name ? `${user.name} settings` : 'Account settings'}
        aria-label="Account settings"
      >
        {initials}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Free Plan Nudge · only shown when user is on the free tier
// ---------------------------------------------------------------------------

const FreePlanNudge = React.memo(function FreePlanNudge({
  onUpgradeRequest,
}: {
  onUpgradeRequest?: () => void;
}) {
  const subscription = useBillingStore((s) => s.subscription);
  const tier = subscription?.tier ?? 'free';
  if (tier !== 'free') return null;
  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between rounded-full bg-black/[0.04] dark:bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground">
        <span>Free plan</span>
        <button
          type="button"
          onClick={onUpgradeRequest}
          className="font-medium text-primary hover:underline"
        >
          Upgrade
        </button>
      </div>
    </div>
  );
});

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
  onPinSession,
  onStarSession,
  onArchiveSession,
  onShareSession,
  onDuplicateSession,
  onMoveToProjectSession,
  onUpgradeRequest,
}: ChatSidebarProps) {
  const router = useRouter();
  const openDirectory = useDirectoryStore((s) => s.setOpen);
  const [bulkMode, setBulkMode] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

  const exitBulkMode = useCallback(() => {
    setBulkMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleCheck = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (visibleSessions: SessionLike[]) => {
      if (selectedIds.size === visibleSessions.length) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(visibleSessions.map((s) => s.id)));
      }
    },
    [selectedIds.size],
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0 || isBulkDeleting) return;
    setIsBulkDeleting(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await onDeleteSession(id);
      }
      exitBulkMode();
    } finally {
      setIsBulkDeleting(false);
    }
  }, [exitBulkMode, isBulkDeleting, onDeleteSession, selectedIds]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (bulkMode) exitBulkMode();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [bulkMode, exitBulkMode]);

  // Listen for custom events dispatched by the global keyboard shortcut hook
  // so that Cmd+K / Cmd+/ open the dialogs that live inside the sidebar,
  // without requiring state to be lifted to the page level.
  useEffect(() => {
    const openSearch = () => setSearchDialogOpen(true);
    const openShortcuts = () => setKeyboardShortcutsOpen(true);
    window.addEventListener('agi:open-search', openSearch);
    window.addEventListener('agi:open-shortcuts', openShortcuts);
    return () => {
      window.removeEventListener('agi:open-search', openSearch);
      window.removeEventListener('agi:open-shortcuts', openShortcuts);
    };
  }, []);

  const keyboardShortcuts = useMemo<KeyboardShortcut[]>(() => {
    const shortcuts: KeyboardShortcut[] = [
      {
        key: 'K',
        ctrl: true,
        meta: true,
        action: () => setSearchDialogOpen(true),
        description: 'Open search',
        category: 'navigation',
      },
      {
        key: '/',
        ctrl: true,
        meta: true,
        action: () => setKeyboardShortcutsOpen(true),
        description: 'Show keyboard shortcuts',
        category: 'ui',
      },
      {
        key: 'N',
        ctrl: true,
        meta: true,
        action: onNewChat,
        description: 'New conversation',
        category: 'conversation',
      },
    ];
    if (onToggleSidebar) {
      shortcuts.push({
        key: 'B',
        ctrl: true,
        meta: true,
        action: onToggleSidebar,
        description: 'Toggle sidebar',
        category: 'ui',
      });
    }
    return shortcuts;
  }, [onNewChat, onToggleSidebar]);

  const grouped = useMemo(() => groupSessions(sessions), [sessions]);

  if (collapsed) {
    return (
      <>
        <CollapsedSidebar
          onNewChat={onNewChat}
          onToggleSidebar={onToggleSidebar}
          onOpenSearch={() => setSearchDialogOpen(true)}
        />
        <GlobalSearchDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen} />
        <KeyboardShortcutsDialog
          open={keyboardShortcutsOpen}
          onOpenChange={setKeyboardShortcutsOpen}
          shortcuts={keyboardShortcuts}
        />
      </>
    );
  }

  return (
    <div className="flex h-full w-[260px] flex-col bg-[var(--chat-sidebar-bg)] border-r border-[var(--chat-border-strong)]">
      {/* Header */}
      {bulkMode ? (
        <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 text-[12px]">
          <span className="text-muted-foreground">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={() => handleSelectAll(sessions)}
            className="ml-1 text-primary hover:underline"
            disabled={isBulkDeleting}
          >
            {selectedIds.size === sessions.length ? 'Deselect all' : 'Select all'}
          </button>
          <button
            type="button"
            onClick={() => void handleBulkDelete()}
            disabled={selectedIds.size === 0 || isBulkDeleting}
            className="ml-1 text-destructive hover:underline disabled:opacity-40"
          >
            {isBulkDeleting ? 'Deleting...' : 'Delete'}
          </button>
          <button
            type="button"
            onClick={exitBulkMode}
            disabled={isBulkDeleting}
            className="ml-auto text-muted-foreground hover:underline disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button
            onClick={onToggleSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] hover:bg-white/[0.08] hover:text-[var(--chat-text-primary)] transition-colors"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] hover:bg-white/[0.08] hover:text-[var(--chat-text-primary)] transition-colors"
            aria-label="Search"
            onClick={() => setSearchDialogOpen(true)}
          >
            <Search className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          {sessions.length > 0 && (
            <button
              onClick={() => setBulkMode(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--chat-text-muted)] hover:bg-white/[0.08] hover:text-[var(--chat-text-primary)] transition-colors"
              aria-label="Select conversations"
              title="Select conversations"
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Nav items */}
      <div className="mx-1 pb-1 mb-1">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--chat-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--chat-text-primary)] transition-colors"
          aria-label="New chat"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          New chat
        </button>
        <button
          onClick={() => router.push('/chat')}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--chat-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--chat-text-primary)] transition-colors"
          aria-label="Chats"
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Chats
        </button>
        <button
          onClick={() => router.push('/projects')}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--chat-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--chat-text-primary)] transition-colors"
          aria-label="Projects"
        >
          <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Projects
        </button>
        <button
          onClick={() => router.push('/gallery')}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--chat-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--chat-text-primary)] transition-colors"
          aria-label="Artifacts"
        >
          <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Artifacts
        </button>
        <button
          onClick={() => openDirectory(true)}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--chat-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--chat-text-primary)] transition-colors"
          aria-label="Directory"
        >
          <Library className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Directory
        </button>
        <button
          onClick={() => router.push('/customize')}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--chat-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--chat-text-primary)] transition-colors"
          aria-label="Customize"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Customize
        </button>
      </div>

      {/* Recents header */}
      <div className="px-3 py-1.5 text-[11px] font-medium text-[var(--chat-text-muted)] tracking-wide">
        Recents
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessageSquare className="mb-2 h-7 w-7 text-muted-foreground/25" />
            <p className="text-sm text-muted-foreground/50">No conversations yet</p>
            <button
              type="button"
              onClick={onNewChat}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Start a new chat
            </button>
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
                  onPin={onPinSession}
                  onStar={onStarSession}
                  onArchive={onArchiveSession}
                  onShare={onShareSession}
                  onDuplicate={onDuplicateSession}
                  onMoveToProject={onMoveToProjectSession}
                  bulkMode={bulkMode}
                  isChecked={selectedIds.has(session.id)}
                  onToggleCheck={toggleCheck}
                />
              ))}
            </div>
          ))
        )}
      </ScrollArea>

      {/* Free plan upgrade pill per design-spec §6.4 */}
      <FreePlanNudge onUpgradeRequest={onUpgradeRequest} />

      {/* User profile */}
      <UserProfileArea
        onUpgradeRequest={onUpgradeRequest}
        onOpenKeyboardShortcuts={() => setKeyboardShortcutsOpen(true)}
      />

      {/* Global search dialog */}
      <GlobalSearchDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen} />
      <KeyboardShortcutsDialog
        open={keyboardShortcutsOpen}
        onOpenChange={setKeyboardShortcutsOpen}
        shortcuts={keyboardShortcuts}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export · wrapped in ErrorBoundary
// ---------------------------------------------------------------------------

export const ChatSidebar: React.FC<ChatSidebarProps> = (props) => {
  return (
    <ErrorBoundary compact componentName="Chat Sidebar">
      <ChatSidebarContent {...props} />
    </ErrorBoundary>
  );
};
