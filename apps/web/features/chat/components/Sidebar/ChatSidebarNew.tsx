'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Plus,
  Search,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  PanelLeftClose,
  X,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { ChatSession } from '../../stores/chat-store';

interface ChatSidebarProps {
  sessions: ChatSession[];
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onToggleSidebar: () => void;
}

// ---------------------------------------------------------------------------
// Time grouping
// ---------------------------------------------------------------------------

function getTimeGroup(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Previous 7 Days';
  if (diffDays <= 30) return 'Previous 30 Days';
  return 'Older';
}

function groupSessions(sessions: ChatSession[]): Map<string, ChatSession[]> {
  const groups = new Map<string, ChatSession[]>();
  const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];

  // Initialize in order
  for (const key of order) {
    groups.set(key, []);
  }

  for (const session of sessions) {
    const group = getTimeGroup(session.updatedAt);
    const arr = groups.get(group);
    if (arr) {
      arr.push(session);
    }
  }

  // Remove empty groups
  for (const [key, value] of groups) {
    if (value.length === 0) groups.delete(key);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Session Item
// ---------------------------------------------------------------------------

function SessionItem({
  session,
  isActive,
  onDelete,
  onRename,
}: {
  session: ChatSession;
  isActive: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== session.title) {
      onRename(session.id, renameValue.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-lg px-3 py-2.5 transition-all duration-200',
        isActive
          ? 'bg-muted/60 text-foreground'
          : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
      )}
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
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      ) : (
        <button
          onClick={() => router.push(`/chat/${session.id}`)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-sm">{session.title}</div>
        </button>
      )}

      {/* More button */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className={cn(
            'ml-1 flex h-6 w-6 items-center justify-center rounded-md transition-opacity',
            'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          aria-label="Session actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
            <button
              onClick={() => {
                setIsRenaming(true);
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs hover:bg-muted/60"
            >
              <Pencil className="h-3 w-3" /> Rename
            </button>
            <button
              onClick={() => {
                onDelete(session.id);
                setShowMenu(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function ChatSidebarNew({
  sessions,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  onToggleSidebar,
}: ChatSidebarProps) {
  const params = useParams();
  const activeSessionId = params?.sessionId as string | undefined;
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q),
    );
  }, [sessions, searchQuery]);

  const grouped = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <button
          onClick={onToggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="Close sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
        <button
          onClick={onNewChat}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="New chat"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="h-8 w-full rounded-lg border border-border/30 bg-muted/20 pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-border/60 focus:ring-1 focus:ring-ring/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/30" />
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
            <div key={group} className="mb-3">
              <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                {group}
              </div>
              <div className="space-y-0.5">
                {groupSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onDelete={onDeleteSession}
                    onRename={onRenameSession}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
