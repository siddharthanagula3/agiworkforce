'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@shared/lib/utils';

export interface ChatLayoutShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  className?: string;
}

export default function ChatLayoutShell({ children, sidebar, className }: ChatLayoutShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('chat-sidebar-collapsed') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Persist collapse state
  useEffect(() => {
    localStorage.setItem('chat-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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

  // Keyboard shortcut: Cmd/Ctrl+Shift+S toggles sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
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

  return (
    <div
      className={cn(
        'flex h-screen w-full overflow-hidden bg-[#faf9f7] dark:bg-[#0f0f13]',
        className,
      )}
    >
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* Left panel — conversation list sidebar */}
      {sidebar && (
        <>
          {/* Desktop sidebar */}
          <aside
            className={cn(
              'hidden lg:flex lg:flex-col shrink-0',
              'transition-[width] duration-200 ease-in-out',
              'bg-[#f5f4f1] dark:bg-[#0b0c14]',
              'border-r border-black/[0.08] dark:border-white/[0.07]',
              sidebarCollapsed ? 'w-16' : 'w-[280px]',
            )}
            aria-label="Conversation list"
          >
            {sidebar}
          </aside>

          {/* Mobile sidebar — slides in as overlay */}
          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex flex-col lg:hidden',
              'w-[280px] shadow-2xl',
              'bg-[#f5f4f1] dark:bg-[#0b0c14]',
              'border-r border-black/[0.08] dark:border-white/[0.07]',
              'transform transition-transform duration-200 ease-in-out',
              mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
            )}
            aria-label="Conversation list"
            aria-hidden={!mobileSidebarOpen}
          >
            {sidebar}
          </aside>
        </>
      )}

      {/* Main content area */}
      <main className="flex flex-1 flex-col min-h-0 overflow-hidden">{children}</main>

      {/* Bottom gradient fade — matches desktop AppLayout */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#faf9f7] via-[#faf9f7]/80 to-transparent dark:from-[#0f0f13] dark:via-[#0f0f13]/80 pointer-events-none z-10" />
    </div>
  );
}
