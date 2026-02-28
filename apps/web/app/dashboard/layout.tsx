'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@shared/lib/utils';
import { DashboardHeader } from '@shared/components/layout/DashboardHeader';
import { DashboardSidebar } from '@shared/components/layout/DashboardSidebar';
import { Button } from '@shared/ui/button';
import { MenuIcon, X } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const handleOverlayKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        closeMobileMenu();
      }
    },
    [closeMobileMenu],
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarCollapsed(true);
      } else {
        setMobileMenuOpen(false);
      }
    };

    queueMicrotask(() => {
      handleResize();
    });
    window.addEventListener('resize', handleResize);

    const timer = setTimeout(() => setIsLoading(false), 300);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mobileMenuOpen) {
        closeMobileMenu();
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen, closeMobileMenu]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div
            className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"
            role="status"
            aria-label="Loading"
          />
          <p className="font-medium text-foreground">Loading AGI Workforce...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agi-dashboard-theme min-h-screen bg-background transition-all duration-300 ease-in-out">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobileMenu}
          onKeyDown={handleOverlayKeyDown}
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
          aria-label="Main navigation"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DashboardSidebar collapsed={sidebarCollapsed} />
          </div>

          {/* Sidebar Toggle Button */}
          <div className="border-t border-border p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn('w-full', sidebarCollapsed && 'px-0')}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
            >
              <MenuIcon
                className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  sidebarCollapsed ? 'rotate-180' : '',
                )}
                aria-hidden="true"
              />
              {!sidebarCollapsed && <span className="ml-2">Collapse</span>}
            </Button>
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
          aria-label="Mobile navigation"
          aria-hidden={!mobileMenuOpen}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border p-4">
            <h2 className="text-lg font-semibold">AGI Workforce</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeMobileMenu}
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <DashboardSidebar collapsed={false} className="h-full" />
          </div>
        </aside>

        {/* Main Content */}
        <main
          id="main-content"
          className={cn(
            'relative z-10 flex-1',
            'transition-all duration-300 ease-in-out',
            'lg:pl-16',
            !sidebarCollapsed && 'lg:pl-64',
          )}
        >
          <div className="min-h-screen pt-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
          </div>
        </main>
      </div>

      {/* Floating Action Button (Mobile) */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <Button
          onClick={() => setMobileMenuOpen(true)}
          className="h-14 w-14 rounded-full bg-primary text-white shadow-lg"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          <MenuIcon className="h-6 w-6" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
