/**
 * Plan Usage Display Component
 * Shows the user's percentage-only plan usage in the chat interface.
 * Fetches from /api/usage server endpoint for accurate billing data.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@shared/stores/authentication-store';
import { Card, Button } from '@agiworkforce/ui';
import { Coins, TrendingUp, AlertTriangle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { normalizeUsagePercentage, type ManagedUsageSummaryResponse } from '@agiworkforce/types';

type UsageData = ManagedUsageSummaryResponse;

interface TokenBalanceDisplayProps {
  compact?: boolean;
  className?: string;
}

export function TokenBalanceDisplay({ compact = false, className }: TokenBalanceDisplayProps) {
  const { user } = useAuthStore();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadBalance = useCallback(async () => {
    if (!user?.id) {
      setUsage(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/usage', {
        credentials: 'include',
      });

      if (!response.ok) {
        console.error('Failed to fetch usage data:', response.status);
        return;
      }

      const data: UsageData = await response.json();
      setUsage(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (!user?.id) {
      setUsage(null);
      setIsLoading(false);
      return;
    }

    const doLoad = async () => {
      if (!isMounted) return;
      setIsLoading(true);
      await loadBalance();
    };

    doLoad();

    // Refresh balance every 30 seconds
    intervalId = setInterval(loadBalance, 30000);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [user?.id, loadBalance]);

  if (!user) {
    return null;
  }

  if (isLoading && usage === null) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm',
          className,
        )}
      >
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-muted-foreground">Loading usage...</span>
      </div>
    );
  }

  const usagePercentage = normalizeUsagePercentage(usage?.usage_percentage);
  const remainingPercentage = Math.max(0, 100 - Math.round(usagePercentage));
  const planTier = usage?.plan_tier ?? 'free';

  const isLow = usagePercentage >= 80;
  const isCritical = usagePercentage >= 95;

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
          isCritical && 'bg-red-100 text-red-700',
          isLow && !isCritical && 'bg-yellow-100 text-yellow-700',
          !isLow && 'bg-primary/10 text-primary',
          className,
        )}
      >
        {isCritical ? <AlertTriangle className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />}
        {/* Subscription-usage framing (PART 7): show % used, not internal $ balance. */}
        <span className="font-medium">{Math.min(100, Math.round(usagePercentage))}% used</span>
        <span className="text-xs opacity-70 capitalize">{planTier}</span>
        {isCritical && (
          <Link href="/pricing">
            <Button size="sm" variant="destructive" className="ml-2 h-6 text-xs">
              Upgrade
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <Card
      className={cn(
        'border-2 transition-all hover:shadow-md',
        isCritical && 'border-red-300 bg-red-50',
        isLow && !isCritical && 'border-yellow-300 bg-yellow-50',
        !isLow && 'border-primary/30 bg-primary/5',
        className,
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {isCritical ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-red-700">Usage limit reached</span>
                </>
              ) : isLow ? (
                <>
                  <TrendingUp className="h-4 w-4 text-yellow-600" />
                  <span className="text-yellow-700">Usage running low</span>
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4" />
                  <span>Plan usage</span>
                </>
              )}
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  'text-3xl font-bold',
                  isCritical && 'text-red-700',
                  isLow && !isCritical && 'text-yellow-700',
                  !isLow && 'text-primary',
                )}
              >
                {Math.round(usagePercentage)}% used
              </span>
            </div>

            <div className="mt-1 text-xs text-muted-foreground capitalize">
              {planTier} plan
              {usage?.usage_reset_at && (
                <> &middot; Resets {new Date(usage.usage_reset_at).toLocaleDateString()}</>
              )}
            </div>

            {isCritical && (
              <div className="mt-3 rounded-md bg-red-100 p-2 text-xs text-red-700">
                <strong>Action Required:</strong> Your plan usage limit has been reached. Upgrade to
                continue using managed AI features.
              </div>
            )}

            {isLow && !isCritical && (
              <div className="mt-3 rounded-md bg-yellow-100 p-2 text-xs text-yellow-700">
                <strong>Notice:</strong> You are nearing your plan usage limit. Consider upgrading
                to avoid interruptions.
              </div>
            )}
          </div>

          <div className="ml-4 flex flex-col gap-2">
            <Link href="/pricing">
              <Button size="sm" variant={isCritical ? 'destructive' : 'default'} className="w-full">
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                Upgrade
              </Button>
            </Link>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsLoading(true);
                loadBalance();
              }}
              className="w-full"
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-all duration-500',
                isCritical && 'bg-red-500',
                isLow && !isCritical && 'bg-yellow-500',
                !isLow && 'bg-primary',
              )}
              style={{
                width: `${Math.min(100, usagePercentage)}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{remainingPercentage}% remaining</span>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>
    </Card>
  );
}

/**
 * Mini token balance badge for header/toolbar
 */
export function TokenBalanceBadge({ className }: { className?: string }) {
  return <TokenBalanceDisplay compact className={className} />;
}
