'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useThemeContext } from '@shared/hooks/useThemeContext';
import { Button } from '@shared/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import { cn } from '@shared/lib/utils';
import {
  LogOut,
  Menu,
  User as UserIcon,
  CreditCard,
  HelpCircle,
  Moon,
  Sun,
  ChevronDown,
  Settings,
} from 'lucide-react';

interface DashboardHeaderProps {
  onMenuClick?: () => void;
  className?: string;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ onMenuClick, className }) => {
  const { setTheme, actualTheme } = useThemeContext();
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  const toggleTheme = () => {
    setTheme(actualTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-40 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl',
        className,
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left: Mobile menu button */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="h-8 w-8 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>

          {/* Model Selector Placeholder */}
          <button
            className="hidden items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.08] sm:flex"
            aria-label="Select model"
          >
            GPT-4o
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Right: Theme toggle + User dropdown */}
        <div className="flex items-center gap-1.5">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Toggle theme"
          >
            {actualTheme === 'light' ? (
              <Moon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sun className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>

          {/* User Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 px-2 hover:bg-white/[0.04]"
                aria-label="User menu"
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback className="bg-primary/20 text-xs font-medium text-primary">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* User info header */}
              <div className="px-2 py-2">
                <p className="truncate text-sm font-medium">{user?.name || 'User'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push('/dashboard/settings/profile')}
                className="cursor-pointer gap-2"
              >
                <UserIcon className="h-4 w-4" aria-hidden="true" />
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push('/dashboard/billing')}
                className="cursor-pointer gap-2"
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                Billing & Usage
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push('/dashboard/settings')}
                className="cursor-pointer gap-2"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push('/dashboard/support')}
                className="cursor-pointer gap-2"
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
                Help & Support
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer gap-2 text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export { DashboardHeader };
