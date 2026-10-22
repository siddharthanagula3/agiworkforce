'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { ChevronUp, Download } from '@agiworkforce/icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@agiworkforce/ui';
import { SidebarFreePlanNudge, SidebarPlanBadge } from './SidebarPlanNudge';

export interface AccountFooterProps {
  loading: boolean;
  displayName: string;
  initial: string;
  email?: string | undefined;
  tierLabel: string | null;
  isFreeTier: boolean;
  menuItems: ReactNode;
  onFreePlanUpgrade: () => void;
  desktopDownload: { href: string; label: string } | null;
}

export function AccountFooter({
  loading,
  displayName,
  initial,
  email,
  tierLabel,
  isFreeTier,
  menuItems,
  onFreePlanUpgrade,
  desktopDownload,
}: AccountFooterProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading account"
        className="flex w-full items-center gap-2 px-3 py-3"
      >
        <span
          className="h-7 w-7 shrink-0 motion-safe:animate-pulse rounded-full bg-muted"
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5" aria-hidden>
          <span className="h-3 w-24 motion-safe:animate-pulse rounded-compact bg-muted" />
          <span className="h-2.5 w-32 motion-safe:animate-pulse rounded-compact bg-muted/70" />
        </span>
        <span className="sr-only">Loading account…</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {isFreeTier && <SidebarFreePlanNudge onUpgrade={onFreePlanUpgrade} />}
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Account menu for ${displayName}`}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-start transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
                  <SidebarPlanBadge tierLabel={tierLabel} isFreeTier={isFreeTier} />
                </div>
                {email && <p className="truncate text-caption text-muted-foreground">{email}</p>}
              </div>
              <ChevronUp
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
        {desktopDownload && (
          <a
            href={desktopDownload.href}
            aria-label={desktopDownload.label}
            title={desktopDownload.label}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

const AccountFooterContext = createContext<ReactNode>(null);

export function AccountFooterProvider({
  footer,
  children,
}: {
  footer: ReactNode;
  children: ReactNode;
}) {
  return <AccountFooterContext.Provider value={footer}>{children}</AccountFooterContext.Provider>;
}

export function useAccountFooter(): ReactNode {
  return useContext(AccountFooterContext);
}
