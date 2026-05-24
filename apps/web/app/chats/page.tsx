'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
  Search,
  MessageSquare,
  X,
  Trash2,
  Archive,
  FolderInput,
  CheckSquare,
  Square,
  ChevronLeft,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@shared/lib/utils';
import { useChatStore } from '@features/chat/stores/chat-store';
import { useProjectStore } from '@features/projects/stores/project-store';
import { FolderManagement } from '@features/chat/components/Sidebar/FolderManagement';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import { ScrollArea } from '@shared/ui/scroll-area';

// ---------------------------------------------------------------------------
// Date grouping (matches ChatSidebar convention)
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

// ---------------------------------------------------------------------------
// ChatsIndexPage
// ---------------------------------------------------------------------------

export default function ChatsIndexPage() {
  const router = useRouter();
  const { userId } = useAuth();

  const sessions = useChatStore((s) => s.sessions);
  const loadSessionsFromDb = useChatStore((s) => s.loadSessionsFromDb);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const archiveSession = useChatStore((s) => s.archiveSession);
  const moveToProject = useChatStore((s) => s.moveToProject);
  const setActiveSession = useChatStore((s) => s.setActiveSession);

  const projects = useProjectStore((s) => s.projects);

  const [searchQuery, setSearchQuery] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Load sessions on mount
  useEffect(() => {
    if (userId) {
      void loadSessionsFromDb(userId);
    }
  }, [userId, loadSessionsFromDb]);

  // Exit bulk mode on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (bulkMode) exitBulkMode();
        else setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [bulkMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Filter: non-archived, matching search, optionally by folder
  const filtered = useMemo(() => {
    let list = sessions.filter((s) => !s.isArchived);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) || (s.preview && s.preview.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [sessions, searchQuery]);

  // Group by date
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const key of GROUP_ORDER) {
      groups.set(key, []);
    }
    for (const session of filtered) {
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
  }, [filtered]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  }, [selectedIds.size, filtered]);

  const handleBulkDelete = useCallback(() => {
    for (const id of selectedIds) deleteSession(id);
    exitBulkMode();
  }, [selectedIds, deleteSession, exitBulkMode]);

  const handleBulkArchive = useCallback(() => {
    for (const id of selectedIds) archiveSession(id);
    exitBulkMode();
  }, [selectedIds, archiveSession, exitBulkMode]);

  const handleBulkMoveToProject = useCallback(
    (projectId: string) => {
      for (const id of selectedIds) moveToProject(id, projectId);
      exitBulkMode();
    },
    [selectedIds, moveToProject, exitBulkMode],
  );

  const handleSessionClick = useCallback(
    (id: string) => {
      if (bulkMode) {
        toggleCheck(id);
        return;
      }
      setActiveSession(id);
      router.push(`/chat/${id}`);
    },
    [bulkMode, toggleCheck, setActiveSession, router],
  );

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Left filter sidebar */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border md:flex">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <button
            onClick={() => router.back()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">Chats</span>
        </div>
        <ScrollArea className="flex-1 py-2">
          <FolderManagement
            selectedFolderId={selectedFolderId}
            onFolderSelect={setSelectedFolderId}
            onMoveSession={() => {}}
          />
        </ScrollArea>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-border px-6 py-4">
          {/* Mobile back */}
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:hidden"
            onClick={() => router.back()}
            aria-label="Go back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <h1 className="text-lg font-semibold text-foreground">Chats</h1>

          {/* Search */}
          <div className="relative ml-4 flex-1 max-w-md">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Search conversations"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!bulkMode ? (
              <button
                onClick={() => setBulkMode(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Select conversations"
              >
                <CheckSquare className="h-4 w-4" aria-hidden="true" />
                Select
              </button>
            ) : (
              <button
                onClick={exitBulkMode}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Cancel selection"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </button>
            )}
          </div>
        </header>

        {/* Bulk action bar */}
        {bulkMode && (
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-6 py-2.5">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {selectedIds.size === filtered.length && filtered.length > 0 ? (
                <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <Square className="h-4 w-4" aria-hidden="true" />
              )}
              {selectedIds.size === filtered.length && filtered.length > 0
                ? 'Deselect all'
                : 'Select all'}
            </button>

            <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleBulkArchive}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-40"
                aria-label="Archive selected"
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archive
              </button>

              {projects.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={selectedIds.size === 0}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-40"
                      aria-label="Move selected to project"
                    >
                      <FolderInput className="h-4 w-4" aria-hidden="true" />
                      Move to project
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {projects.map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => handleBulkMoveToProject(project.id)}
                      >
                        <span className="truncate">{project.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:pointer-events-none disabled:opacity-40"
                aria-label="Delete selected"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <MessageSquare
                className="mb-3 h-10 w-10 text-muted-foreground/25"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No matching conversations' : 'No conversations yet'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => router.push('/chat')}
                  className="mt-3 text-sm text-primary hover:underline"
                >
                  Start a new chat
                </button>
              )}
            </div>
          ) : (
            <div className="px-4 py-4 md:px-8">
              {Array.from(grouped.entries()).map(([group, groupSessions]) => (
                <section key={group} className="mb-6">
                  <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </h2>
                  <div className="space-y-1">
                    {groupSessions.map((session) => {
                      const updatedAt =
                        session.updatedAt instanceof Date
                          ? session.updatedAt
                          : session.updatedAt
                            ? new Date(session.updatedAt)
                            : new Date();
                      const safeDate = isNaN(updatedAt.getTime()) ? new Date(0) : updatedAt;
                      const isChecked = selectedIds.has(session.id);

                      return (
                        <div
                          key={session.id}
                          onClick={() => handleSessionClick(session.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSessionClick(session.id);
                            }
                          }}
                          aria-label={session.title}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 transition-colors',
                            isChecked ? 'bg-primary/10' : 'hover:bg-accent',
                          )}
                        >
                          {/* Bulk checkbox */}
                          {bulkMode && (
                            <span className="flex-shrink-0">
                              {isChecked ? (
                                <CheckSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                              ) : (
                                <Square
                                  className="h-4 w-4 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                          )}

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium text-foreground">
                                {session.title || 'Untitled'}
                              </span>
                              <span className="flex-shrink-0 text-xs text-muted-foreground">
                                {formatDistanceToNow(safeDate, { addSuffix: true })}
                              </span>
                            </div>
                            {session.preview && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {session.preview}
                              </p>
                            )}
                            {session.messageCount !== undefined && session.messageCount > 0 && (
                              <p className="mt-0.5 text-xs text-muted-foreground/60">
                                {session.messageCount} message
                                {session.messageCount !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
