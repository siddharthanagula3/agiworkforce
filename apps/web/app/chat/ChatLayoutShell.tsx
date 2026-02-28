'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@shared/lib/utils';
import { DashboardHeader } from '@shared/components/layout/DashboardHeader';
import { DashboardSidebar } from '@shared/components/layout/DashboardSidebar';
import { Button } from '@shared/ui/button';
import { X } from 'lucide-react';

export default function ChatLayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
        setMobileMenuOpen(false);
      }
    };

    handleResize();
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
        document.body.style.overflow = '';
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [mobileMenuOpen, closeMobileMenu]);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={closeMobileMenu}
          role="button"
          tabIndex={0}
          aria-label="Close navigation menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') closeMobileMenu();
          }}
        />
      )}

      {/* Header */}
      <DashboardHeader onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />

      <div className="relative flex pt-14">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            'fixed bottom-0 left-0 top-14 z-30 hidden lg:flex lg:flex-col',
            'transition-[width] duration-200 ease-in-out',
            sidebarCollapsed ? 'w-[60px]' : 'w-[240px]',
          )}
          aria-label="Main navigation"
        >
          <DashboardSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </aside>

        {/* Mobile Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-[260px] lg:hidden',
            'transform transition-transform duration-200 ease-in-out',
            'flex flex-col shadow-2xl',
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          aria-label="Mobile navigation"
          aria-hidden={!mobileMenuOpen}
        >
          <div className="flex items-center justify-end border-b border-white/[0.06] bg-black/40 px-2 py-2 backdrop-blur-xl">
            <Button
              variant="ghost"
              size="icon"
              onClick={closeMobileMenu}
              className="h-8 w-8 text-muted-foreground"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <DashboardSidebar collapsed={false} className="flex-1" />
        </aside>

        {/* Main Content */}
        <main
          id="main-content"
          className={cn(
            'relative flex-1 transition-[margin] duration-200 ease-in-out',
            sidebarCollapsed ? 'lg:ml-[60px]' : 'lg:ml-[240px]',
          )}
        >
          <div className="h-[calc(100vh-3.5rem)]">{children}</div>
        </main>
      </div>
    </div>
  );
}
