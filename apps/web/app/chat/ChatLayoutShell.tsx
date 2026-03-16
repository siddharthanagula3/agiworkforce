'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@shared/lib/utils';
import { useChatStore } from '@features/chat/stores/chat-store';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
import { useAuthStore } from '@shared/stores/authentication-store';
import { CommandPalette } from '@/components/UnifiedAgenticChat/CommandPalette';
import { KeyboardShortcutsDialog } from '@/components/UnifiedAgenticChat/KeyboardShortcutsDialog';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

const SIDEBAR_WIDTH_KEY = 'chat-sidebar-width';
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 400;
const SIDEBAR_DEFAULT_WIDTH = 280;

export interface ChatLayoutShellProps {
  children: React.ReactNode;
  className?: string;
}

export default function ChatLayoutShell({ children, className }: ChatLayoutShellProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    sessions,
    activeSessionId,
    createSession,
    deleteSession,
    renameSession,
    pinSession,
    unpinSession,
    archiveSession,
    unarchiveSession,
  } = useChatStore();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('chat-sidebar-collapsed') === 'true';
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
    return parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) || String(SIDEBAR_DEFAULT_WIDTH), 10);
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Persist collapse state
  useEffect(() => {
    localStorage.setItem('chat-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Persist sidebar width
  const handleSidebarResize = useCallback((newWidth: number) => {
    setSidebarWidth(newWidth);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(newWidth));
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [mobileSidebarOpen]);

  // Keyboard shortcuts: Cmd+K → command palette, Cmd+/ → shortcuts, Cmd+Shift+S → sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (isMeta && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
      if (isMeta && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
      if (e.key === 'Escape' && mobileSidebarOpen) {
        closeMobileSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileSidebarOpen, closeMobileSidebar]);

  const handleNewChat = useCallback(() => {
    closeMobileSidebar();
    const id = createSession(user?.id);
    router.push(`/chat/${id}`);
  }, [closeMobileSidebar, createSession, router, user?.id]);

  const handleSelectSession = useCallback(
    (id: string) => {
      closeMobileSidebar();
      router.push(`/chat/${id}`);
    },
    [closeMobileSidebar, router],
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      deleteSession(id);
      if (id === activeSessionId) {
        const remaining = useChatStore.getState().sessions;
        if (remaining.length > 0) {
          router.push(`/chat/${remaining[0]!.id}`);
        } else {
          router.push('/chat');
        }
      }
    },
    [deleteSession, activeSessionId, router],
  );

  const sharedSidebarProps = {
    sessions,
    activeSessionId: activeSessionId ?? undefined,
    onNewChat: handleNewChat,
    onSelectSession: handleSelectSession,
    onDeleteSession: handleDeleteSession,
    onRenameSession: renameSession,
    onPinSession: pinSession,
    onUnpinSession: unpinSession,
    onArchiveSession: archiveSession,
    onUnarchiveSession: unarchiveSession,
  };

  return (
    <div className={cn('flex h-screen w-full overflow-hidden bg-[var(--chat-bg)]', className)}>
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* Desktop sidebar — resizable on lg+ */}
      <aside
        className={cn(
          'hidden lg:flex lg:flex-col relative shrink-0',
          'bg-[var(--chat-sidebar-bg)]',
          'border-r border-[var(--chat-border-strong)]',
          sidebarCollapsed
            ? 'w-16 transition-[width] duration-200 ease-in-out'
            : 'transition-none',
        )}
        style={sidebarCollapsed ? undefined : { width: `${sidebarWidth}px` }}
        aria-label="Conversation list"
      >
        <ChatSidebarNew
          {...sharedSidebarProps}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          collapsed={sidebarCollapsed}
        />
        {!sidebarCollapsed && (
          <ResizeHandle
            onResize={handleSidebarResize}
            width={sidebarWidth}
            minWidth={SIDEBAR_MIN_WIDTH}
            maxWidth={SIDEBAR_MAX_WIDTH}
            direction="right"
          />
        )}
      </aside>

      {/* Mobile sidebar — slides in as overlay */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col lg:hidden',
          'w-[280px] shadow-2xl',
          'bg-[var(--chat-sidebar-bg)]',
          'border-r border-[var(--chat-border-strong)]',
          'transform transition-transform duration-200 ease-in-out',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Conversation list"
        aria-hidden={!mobileSidebarOpen}
      >
        <ChatSidebarNew
          {...sharedSidebarProps}
          onToggleSidebar={closeMobileSidebar}
          collapsed={false}
        />
      </aside>

      {/* Main content area */}
      <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* Mobile header bar */}
        <div className="flex items-center gap-3 border-b border-[var(--chat-border-subtle)] px-3 py-2 lg:hidden">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
            aria-label="Open sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-foreground">AGI Workforce</span>
        </div>

        {children}
      </main>

      {/* Bottom gradient fade */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--chat-bg)] via-[var(--chat-bg)]/80 to-transparent pointer-events-none z-10" />

      {/* Global dialogs */}
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <KeyboardShortcutsDialog isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
