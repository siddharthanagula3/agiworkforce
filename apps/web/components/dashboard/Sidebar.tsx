'use client';

import { BarChart3, CreditCard, Download, Home, MessageSquare, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    {
      title: 'Overview',
      href: '/dashboard',
      icon: Home,
    },
    {
      title: 'Chat',
      href: '/dashboard/chat',
      icon: MessageSquare,
    },
    {
      title: 'Billing & Plan',
      href: '/dashboard/billing',
      icon: CreditCard,
    },
    {
      title: 'Usage',
      href: '/dashboard/usage',
      icon: BarChart3,
    },
    {
      title: 'Download App',
      href: '/download',
      icon: Download,
    },
    {
      title: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
    },
  ];

  return (
    <div className={cn('pb-12 min-h-screen w-64 border-r border-white/10 bg-black', className)}>
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <div className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-white/5 hover:text-white transition-colors',
                  pathname === item.href ? 'bg-white/10 text-white' : 'text-zinc-400',
                )}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
