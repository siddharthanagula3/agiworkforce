'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@shared/lib/utils';
import { DashboardHeader } from '@shared/components/layout/DashboardHeader';
import { DashboardSidebar } from '@shared/components/layout/DashboardSidebar';
import { Button } from '@shared/ui/button';
import { MenuIcon, X } from 'lucide-react';

export default function ChatLayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      } else {
        setMobileMenuOpen(false);
      }
    };

    queueMicrotask(handleResize);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeMobileMenu();
      };
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [mobileMenuOpen, closeMobileMenu]);

  return (
    <div className="agi-dashboard-theme min-h-screen bg-background">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobileMenu}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') closeMobileMenu();
          }}
          role="button"
          tabIndex={0}
          aria-label="Close navigation menu"
        />
      )}

      {/* Header */}
      <DashboardHeader
        onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        sidebarCollapsed={sidebarCollapsed}
      />

      <div className="relative flex">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            'hidden lg:fixed lg:inset-y-0 lg:top-16 lg:flex lg:flex-col',
            'border-r border-border bg-card/50 backdrop-blur-xl',
            'z-30 transition-all duration-300 ease-in-out',
            sidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DashboardSidebar collapsed={sidebarCollapsed} />
          </div>
        </aside>

        {/* Mobile Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 lg:hidden',
            'border-r border-border bg-card backdrop-blur-xl',
            'transform transition-transform duration-300 ease-in-out',
            'flex flex-col shadow-2xl',
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-lg font-semibold">AGI Workforce</h2>
            <Button variant="ghost" size="icon" onClick={closeMobileMenu}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <DashboardSidebar collapsed={false} className="h-full" />
          </div>
        </aside>

        {/* Main Content - Chat takes full height */}
        <main
          className={cn(
            'relative z-10 flex-1',
            'transition-all duration-300 ease-in-out',
            'lg:pl-16',
            !sidebarCollapsed && 'lg:pl-64',
          )}
        >
          <div className="h-screen pt-16">{children}</div>
        </main>
      </div>

      {/* Mobile FAB */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <Button
          onClick={() => setMobileMenuOpen(true)}
          className="h-14 w-14 rounded-full bg-primary text-white shadow-lg"
        >
          <MenuIcon className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
