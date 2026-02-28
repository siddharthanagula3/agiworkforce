'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@shared/ui/button';
import { cn } from '@shared/lib/utils';
import { Users, MessageSquare, Store, Sparkles, Plus, Download, Image } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardSidebarProps {
  collapsed?: boolean;
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
  {
    name: 'VIBE',
    href: '/dashboard/vibe',
    icon: Sparkles,
  },
  {
    name: 'AI Workforce',
    href: '/dashboard/agents',
    icon: Users,
  },
  {
    name: 'Marketplace',
    href: '/dashboard/hire',
    icon: Store,
  },
  {
    name: 'Media Studio',
    href: '/dashboard/media',
    icon: Image,
  },
];

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({ collapsed = false, className }) => {
  const pathname = usePathname();

  const isActiveLink = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  const renderNavItem = (item: NavigationItem, index: number) => {
    const isActive = isActiveLink(item.href);

    return (
      <motion.div
        key={item.name}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
      >
        <Link
          href={item.href}
          className={cn(
            'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-300',
            'hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10',
            collapsed ? 'justify-center' : '',
            isActive
              ? 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          title={collapsed ? item.name : undefined}
        >
          {/* Active indicator */}
          {isActive && !collapsed && (
            <motion.div
              layoutId="active-indicator"
              className="absolute left-0 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-primary/50"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}

          {/* Icon with background */}
          <div
            className={cn(
              'rounded-lg p-2 transition-all duration-300',
              isActive
                ? 'scale-110 bg-primary/10'
                : 'bg-muted/50 group-hover:scale-105 group-hover:bg-muted',
            )}
          >
            <item.icon
              className={cn('h-4 w-4 transition-all duration-300', isActive && 'text-primary')}
            />
          </div>

          {/* Label */}
          {!collapsed && (
            <div className="flex-1">
              <div className="font-semibold">{item.name}</div>
            </div>
          )}

          {/* Tooltip for collapsed state */}
          {collapsed && (
            <div
              className={cn(
                'absolute left-full z-50 ml-3 rounded-lg border bg-popover/95 px-3 py-2 shadow-lg backdrop-blur-sm',
                'pointer-events-none opacity-0 transition-all duration-300 group-hover:opacity-100',
                'whitespace-nowrap',
              )}
            >
              <p className="text-sm font-medium">{item.name}</p>
            </div>
          )}
        </Link>
      </motion.div>
    );
  };

  return (
    <div
      className={cn(
        'glass-strong flex h-full flex-col border-r border-border/50 backdrop-blur-xl',
        'overflow-visible',
        className,
      )}
    >
      {/* Logo Section */}
      <div
        className={cn(
          'flex items-center gap-3 border-b border-border/50 bg-gradient-to-r from-primary/5 to-transparent px-4 py-5',
          collapsed && 'justify-center px-2',
        )}
      >
        {collapsed ? (
          <motion.div
            whileHover={{ scale: 1.1, rotate: 10 }}
            whileTap={{ scale: 0.95 }}
            className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl shadow-lg"
          >
            <Sparkles className="h-5 w-5 text-white" />
          </motion.div>
        ) : (
          <>
            <motion.div
              whileHover={{ scale: 1.1, rotate: 10 }}
              whileTap={{ scale: 0.95 }}
              className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl shadow-lg"
            >
              <Sparkles className="h-5 w-5 text-white" />
            </motion.div>
            <div className="flex flex-col">
              <h1 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-base font-bold text-transparent">
                AI Workforce
              </h1>
              <p className="text-xs text-muted-foreground">Powered by AGI</p>
            </div>
          </>
        )}
      </div>

      {/* New Chat Button */}
      <div className={cn('border-b border-border/50 px-4 py-4', collapsed && 'px-2')}>
        {collapsed ? (
          <Button
            className={cn(
              'gradient-primary w-full text-white shadow-lg',
              'transition-all duration-300 hover:scale-[1.02] hover:shadow-xl',
              'aspect-square p-0',
            )}
            asChild
          >
            <Link href="/chat" aria-label="New Chat">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            className={cn(
              'btn-glow gradient-primary w-full text-white shadow-lg',
              'transition-all duration-300 hover:scale-[1.02] hover:shadow-xl',
            )}
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
      <div className="scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent flex-1 overflow-y-auto px-3 py-4">
        <nav className="space-y-1">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-3 flex items-center justify-between px-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Product
              </p>
              <div className="ml-3 h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
            </motion.div>
          )}
          {PRODUCT_NAVIGATION.map((item, index) => renderNavItem(item, index))}
        </nav>
      </div>

      {/* Footer: Download App */}
      <div className="border-t border-border/50 bg-gradient-to-t from-muted/20 to-transparent p-3">
        {collapsed ? (
          <Link
            href="/download"
            className={cn(
              'group relative flex min-h-11 items-center justify-center rounded-xl px-3 py-3 text-sm font-medium transition-all duration-300',
              'text-muted-foreground hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 hover:text-foreground',
            )}
            title="Download App"
          >
            <div className="rounded-lg bg-muted/50 p-2 transition-all duration-300 group-hover:scale-105 group-hover:bg-muted">
              <Download className="h-4 w-4" />
            </div>
            <div
              className={cn(
                'absolute left-full z-50 ml-3 rounded-lg border bg-popover/95 px-3 py-2 shadow-lg backdrop-blur-sm',
                'pointer-events-none opacity-0 transition-all duration-300 group-hover:opacity-100',
                'whitespace-nowrap',
              )}
            >
              <p className="text-sm font-medium">Download App</p>
            </div>
          </Link>
        ) : (
          <Link
            href="/download"
            className={cn(
              'group flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-300',
              'text-muted-foreground hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 hover:text-foreground',
            )}
          >
            <div className="rounded-lg bg-muted/50 p-2 transition-all duration-300 group-hover:scale-105 group-hover:bg-muted">
              <Download className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">Download App</div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
};

export { DashboardSidebar };
