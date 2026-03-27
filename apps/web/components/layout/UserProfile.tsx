'use client';

import { ChevronUp, LifeBuoy, LogOut, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/unified/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';

interface UserProfileProps {
  collapsed?: boolean;
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
}

function getDisplayName(user: ReturnType<typeof useAuth>['user']) {
  const metadata = user?.user_metadata as
    | {
        name?: string;
        full_name?: string;
      }
    | undefined;

  return metadata?.full_name || metadata?.name || user?.email?.split('@')[0] || 'User';
}

function getPlanLabel(planName?: string | null) {
  if (!planName) return 'Free plan';
  return `${planName} plan`;
}

export function UserProfile({
  collapsed = false,
  onSettingsClick,
  onFeedbackClick,
}: UserProfileProps) {
  const { user, subscription, signOut, isLoading } = useAuth();

  const displayName = getDisplayName(user);
  const email = user?.email || '';
  const planLabel = getPlanLabel(subscription?.display_name);
  const initial = displayName.charAt(0).toUpperCase();

  const handleSettings = () => {
    onSettingsClick?.();
  };

  const handleFeedback = () => {
    onFeedbackClick?.();
  };

  if (isLoading && !user) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60',
          collapsed ? 'justify-center px-0 py-2' : 'px-3 py-3',
        )}
      >
        <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
        {!collapsed && <div className="h-4 w-24 animate-pulse rounded bg-muted" />}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'w-full rounded-2xl border border-border/70 bg-background/60 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            collapsed
              ? 'flex h-11 w-11 items-center justify-center rounded-full px-0 py-0'
              : 'flex items-center gap-3 px-3 py-3',
          )}
          aria-label="Open account menu"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {initial}
          </div>

          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{planLabel}</span>
                  {email ? <span className="truncate">· {email}</span> : null}
                </div>
              </div>
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align={collapsed ? 'center' : 'start'}
        className="mb-2 w-64 rounded-2xl border-border/70 bg-background/95 p-2 shadow-2xl backdrop-blur-xl"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
          {email ? <div className="truncate text-xs text-muted-foreground">{email}</div> : null}
          <div className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {planLabel}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleSettings} className="rounded-xl px-3 py-2">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>

        {onFeedbackClick ? (
          <DropdownMenuItem onClick={handleFeedback} className="rounded-xl px-3 py-2">
            <LifeBuoy className="mr-2 h-4 w-4" />
            Feedback
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem
          disabled
          className="rounded-xl px-3 py-2 text-muted-foreground data-[disabled]:opacity-100"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {subscription?.display_name || 'Free'} workspace
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => void signOut()}
          className="rounded-xl px-3 py-2 text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserProfile;
