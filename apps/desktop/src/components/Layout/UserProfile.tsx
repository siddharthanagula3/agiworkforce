import * as Popover from '@radix-ui/react-popover';
import {
  CreditCard,
  MessageSquare,
  Settings,
  Coins,
  LogOut,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { useAccountStore, selectIsTierLoading } from '../../stores/accountStore';
import { useAuthStore } from '../../stores/auth';
import { openPricingPage } from '../../utils/navigation';
import { getUsagePercentage } from '../../stores/usageStore';
import { refreshCreditsAfterMessage } from '../../hooks/useCreditRefresh';
import { formatCreditNumber } from '../../utils/credits';

interface UserProfileProps {
  onSettingsClick?: () => void;
  onBillingClick?: () => void;
  onFeedbackClick?: () => void;
  collapsed?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  onSettingsClick,
  onBillingClick,
  onFeedbackClick,
  collapsed = false,
}) => {
  const account = useAccountStore((state) => state.account);
  const isTierLoading = useAccountStore(selectIsTierLoading);

  const { displayName, email, avatar, planDisplayName, plan, credits } = account;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshCredits = async () => {
    setIsRefreshing(true);
    try {
      await refreshCreditsAfterMessage();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Show "Loading..." when subscription tier is being fetched
  // This prevents showing "FREE" to paid users during network delays
  const displayedPlanName = isTierLoading ? 'Loading...' : planDisplayName;

  const name = displayName || email?.split('@')[0] || 'Account';

  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2.5 text-left transition-all hover:bg-zinc-800 hover:border-white/20',
            collapsed && 'justify-center px-2',
          )}
        >
          {}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
            {avatar ? (
              <img src={avatar} alt={name} className="h-full w-full rounded-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          {}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium text-zinc-100">{name}</div>
              <div
                className={cn(
                  'mt-0.5 inline-flex items-center rounded-xs bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300',
                  isTierLoading && 'animate-pulse',
                )}
              >
                {isTierLoading && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
                {displayedPlanName}
              </div>
            </div>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-64 rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {}
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-purple-500 text-sm font-semibold text-white">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={name}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-100">{name}</div>
                <div
                  className={cn(
                    'mt-1 inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-300',
                    isTierLoading && 'animate-pulse',
                  )}
                >
                  {isTierLoading && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
                  {displayedPlanName}
                </div>
              </div>
            </div>
            {/* Credit Balance Display */}
            {(plan === 'hobby' || plan === 'pro' || plan === 'max') && credits && (
              <div className="mt-3 space-y-2">
                {/* Refresh Credits Button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleRefreshCredits()}
                    disabled={isRefreshing}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                    title="Refresh credits"
                  >
                    <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </div>
                {/* Daily Credits */}
                {credits.daily_limit_cents !== undefined && credits.daily_limit_cents > 0 && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-xs font-medium text-zinc-300">Daily Credits</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Remaining</span>
                        <span className="text-sm font-semibold text-zinc-100">
                          {formatCreditNumber(credits.daily_remaining_cents)} credits
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Used</span>
                        <span className="text-xs text-zinc-400">
                          {Math.min(
                            getUsagePercentage(
                              credits.daily_used_cents || 0,
                              credits.daily_limit_cents,
                            ),
                            100,
                          ).toFixed(0)}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-linear-to-r from-blue-500 to-blue-400 transition-all"
                          style={{
                            width: `${Math.min(
                              getUsagePercentage(
                                credits.daily_used_cents || 0,
                                credits.daily_limit_cents,
                              ),
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                      {credits.daily_reset_at && (
                        <div className="text-[10px] text-zinc-500 mt-1">
                          Resets in{' '}
                          {Math.ceil(
                            (new Date(credits.daily_reset_at).getTime() - Date.now()) /
                              (1000 * 60 * 60),
                          )}{' '}
                          hours
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Monthly Credits */}
                {((credits.allocated_cents && credits.allocated_cents > 0) ||
                  ((credits as any).credits_allocated_cents &&
                    (credits as any).credits_allocated_cents > 0)) && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-xs font-medium text-zinc-300">Monthly Credits</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Remaining</span>
                        <span className="text-sm font-semibold text-zinc-100">
                          {formatCreditNumber(credits.remaining_cents)} credits
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Used</span>
                        <span className="text-xs text-zinc-400">
                          {Math.min(
                            getUsagePercentage(
                              credits.used_cents || 0,
                              credits.allocated_cents || 0,
                            ),
                            100,
                          ).toFixed(0)}
                          %
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-linear-to-r from-amber-500 to-amber-400 transition-all"
                          style={{
                            width: `${Math.min(getUsagePercentage(credits.used_cents || 0, credits.allocated_cents || 0), 100)}%`,
                          }}
                        />
                      </div>
                      {credits.period_end && (
                        <div className="text-[10px] text-zinc-500 mt-1">
                          Resets {new Date(credits.period_end).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {}
          <div className="py-2">
            <button
              type="button"
              onClick={() => {
                onSettingsClick?.();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <Settings className="h-4 w-4 text-zinc-400" />
              <span>Settings</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onBillingClick?.();
                void openPricingPage();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <CreditCard className="h-4 w-4 text-zinc-400" />
              <span>Billing</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onFeedbackClick?.();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <MessageSquare className="h-4 w-4 text-zinc-400" />
              <span>Send Feedback</span>
            </button>

            <div className="my-1 border-t border-white/10" />

            <button
              type="button"
              onClick={() => {
                void useAuthStore.getState().signOut();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-white/5"
            >
              <LogOut className="h-4 w-4 text-red-400" />
              <span>Log Out</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default UserProfile;
