'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@shared/ui/button';
import { cn } from '@shared/lib/utils';
import {
  MessageSquare,
  Plus,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';

interface DashboardSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRODUCT_NAVIGATION: NavigationItem[] = [
  {
    name: 'Chat',
    href: '/chat',
    icon: MessageSquare,
  },
];

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  collapsed = false,
  onToggle,
  className,
}) => {
  const pathname = usePathname();

  const isActiveLink = (href: string) => {
    if (href === '/chat') {
      return pathname === '/chat' || pathname.startsWith('/chat/');
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div
      className={cn(
        'relative flex h-full flex-col bg-black/40 backdrop-blur-xl',
        'border-r border-white/[0.06]',
        className,
      )}
    >
      {/* Logo + Collapse Toggle */}
      <div
        className={cn(
          'flex items-center border-b border-white/[0.06] px-4 py-4',
          collapsed ? 'justify-center px-2' : 'justify-between',
        )}
      >
        <Link
          href="/chat"
          className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-foreground">AGI Workforce</span>
          )}
        </Link>
        {!collapsed && onToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
        {collapsed && onToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="absolute -right-3 top-5 z-50 hidden h-6 w-6 rounded-full border border-white/[0.06] bg-background text-muted-foreground shadow-md hover:text-foreground lg:flex"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* New Chat Button */}
      <div className={cn('px-3 py-3', collapsed && 'px-2')}>
        {collapsed ? (
          <Button
            className="w-full bg-primary px-0 text-primary-foreground shadow-sm hover:bg-primary/90"
            size="icon"
            asChild
          >
            <Link href="/chat" aria-label="New Chat">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            className="w-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            asChild
          >
            <Link href="/chat">
              <Plus className="mr-2 h-4 w-4" />
              New Chat
            </Link>
          </Button>
        )}
      </div>

      {/* Product Navigation */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        <nav className="space-y-0.5">
          {!collapsed && (
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Product
            </p>
          )}
          {PRODUCT_NAVIGATION.map((item) => {
            const isActive = isActiveLink(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-white/[0.08] text-foreground'
                    : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                )}
                title={collapsed ? item.name : undefined}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <item.icon
                  className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary')}
                />
                {!collapsed && <span>{item.name}</span>}

                {/* Tooltip for collapsed */}
                {collapsed && (
                  <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-white/[0.06] bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-white/[0.06]" />

      {/* Footer: Download App */}
      <div className="p-2">
        <Link
          href="/download"
          className={cn(
            'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
            'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? 'Download App' : undefined}
        >
          <Download className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Download App</span>}
          {collapsed && (
            <div className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-white/[0.06] bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              Download App
            </div>
          )}
        </Link>
      </div>
    </div>
  );
};

export { DashboardSidebar };
