/**
 * ChatHeader - Clean, minimal header
 *
 * Redesigned with:
 * - Essential actions only (sidebar, title, search, menu)
 * - Secondary actions in overflow menu
 * - Clean visual hierarchy
 * - Profile popover on avatar click
 */

import React from 'react';
import Link from 'next/link';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Badge } from '@shared/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@shared/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@shared/ui/popover';
import { Separator } from '@shared/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import {
  Menu,
  Share2,
  Settings,
  Edit3,
  Check,
  X,
  Search,
  BarChart3,
  Bookmark,
  MoreHorizontal,
  FileDown,
  Trash2,
  Download,
  LogOut,
  ArrowUpRight,
} from 'lucide-react';
import type { ChatSession } from '../../types';
import { ThemeToggle } from '@shared/ui/theme-toggle';
import { useAuthStore } from '@shared/stores/authentication-store';
import { PLAN_LABEL, isFreePlan, type UIPlanTier } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toUIPlanTier(plan: string | undefined): UIPlanTier {
  const normalized = (plan ?? 'byok').toLowerCase();
  if (normalized === 'local' || normalized === 'local-only') return 'local';
  if (normalized === 'byok') return 'byok';
  if (normalized === 'hobby') return 'hobby';
  if (normalized === 'pro') return 'pro';
  if (normalized === 'max') return 'max';
  return 'byok';
}

function getInitials(name: string | undefined, email: string | undefined): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'AG';
}

// ---------------------------------------------------------------------------
// Profile Popover
// ---------------------------------------------------------------------------

function ProfilePopover() {
  const { user, logout } = useAuthStore();

  const tier = toUIPlanTier(user?.plan);
  const planLabel = PLAN_LABEL[tier];
  const displayName = user?.name ?? user?.email ?? 'User';
  const email = user?.email ?? '';
  const initials = getInitials(user?.name, user?.email);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Open profile menu"
        >
          <Avatar className="h-7 w-7">
            {user?.avatar && <AvatarImage src={user.avatar} alt={displayName} />}
            <AvatarFallback className="text-[10px] font-semibold bg-amber-500/20 text-amber-400">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-64 p-0">
        {/* Identity section */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar className="h-9 w-9 shrink-0">
            {user?.avatar && <AvatarImage src={user.avatar} alt={displayName} />}
            <AvatarFallback className="text-xs font-semibold bg-amber-500/20 text-amber-400">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
          </div>
        </div>

        {/* Plan badge */}
        <div className="px-4 pb-3">
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide',
              tier === 'hobby' && 'bg-amber-500/20 text-amber-400 border-amber-500/30',
              tier === 'pro' && 'bg-violet-500/20 text-violet-400 border-violet-500/30',
              tier === 'max' && 'bg-blue-500/20 text-blue-400 border-blue-500/30',
              (tier === 'byok' || tier === 'local') &&
                'bg-white/10 text-muted-foreground border-white/10',
            )}
          >
            {planLabel}
          </Badge>
        </div>

        <Separator />

        {/* Navigation links */}
        <div className="py-1">
          <Link
            href="/settings"
            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/60 transition-colors"
          >
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Settings
          </Link>

          {isFreePlan(tier) && (
            <Link
              href="/pricing"
              className="flex items-center gap-2 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              Upgrade plan
            </Link>
          )}

          <Link
            href="/downloads"
            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/60 transition-colors"
          >
            <Download className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Get apps and extensions
          </Link>
        </div>

        <Separator />

        {/* Log out */}
        <div className="py-1">
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// cn import (local copy to avoid circular)
// ---------------------------------------------------------------------------

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface ChatHeaderProps {
  session: ChatSession | null;
  onRename: (title: string) => void;
  onShare: () => void;
  onExport: () => void;
  onSettings: () => void;
  onToggleSidebar: () => void;
  onSearch?: () => void;
  onAnalytics?: () => void;
  onBookmarks?: () => void;
  onDelete?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  session,
  onRename,
  onShare,
  onExport,
  onSettings,
  onToggleSidebar,
  onSearch,
  onAnalytics,
  onBookmarks,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState(session?.title || '');

  React.useEffect(() => {
    setEditTitle(session?.title || '');
  }, [session?.title]);

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== session?.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(session?.title || '');
    setIsEditing(false);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Left: Sidebar toggle + Title */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-8 w-8 flex-shrink-0"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') handleCancel();
              }}
              className="h-8 max-w-xs"
              autoFocus
              aria-label="Chat title"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRename}
              className="h-8 w-8 flex-shrink-0"
              aria-label="Confirm rename"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="h-8 w-8 flex-shrink-0"
              aria-label="Cancel rename"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted"
            aria-label={`Edit chat title: ${session?.title || 'New Chat'}`}
          >
            <h1 className="truncate text-sm font-semibold">{session?.title || 'New Chat'}</h1>
            <Edit3
              className="h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Search - Primary action */}
        {onSearch && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSearch}
            className="hidden gap-2 sm:flex"
            aria-label="Search conversations"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden text-xs text-muted-foreground lg:inline">⌘K</span>
          </Button>
        )}

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Profile Popover */}
        <ProfilePopover />

        {/* More Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onSearch && (
              <DropdownMenuItem onClick={onSearch} className="sm:hidden">
                <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                Search
              </DropdownMenuItem>
            )}

            {onBookmarks && (
              <DropdownMenuItem onClick={onBookmarks}>
                <Bookmark className="mr-2 h-4 w-4" aria-hidden="true" />
                Bookmarks
              </DropdownMenuItem>
            )}

            {onAnalytics && (
              <DropdownMenuItem onClick={onAnalytics}>
                <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
                Analytics
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={onShare}>
              <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Share
            </DropdownMenuItem>

            <DropdownMenuItem onClick={onExport}>
              <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
              Export
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={onSettings}>
              <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
              Settings
            </DropdownMenuItem>

            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete Chat
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
