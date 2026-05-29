/**
 * Usage Warning Banner
 * Full-width dismissible alert shown when credit usage hits a threshold.
 * Alerts users when approaching credit limits (ChatGPT/Claude.ai style).
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, AlertCircle, X, TrendingUp } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useRouter } from 'next/navigation';

interface UsageData {
  used: number;
  limit: number;
  provider: string;
}

interface UsageWarningBannerProps {
  usageData: UsageData[];
  className?: string;
}

export function UsageWarningBanner({ usageData, className }: UsageWarningBannerProps) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const router = useRouter();

  // Find the provider with highest usage percentage
  const criticalProvider = usageData.reduce<{
    provider: string;
    percentage: number;
    used: number;
    limit: number;
  } | null>((acc, data) => {
    const percentage = data.limit > 0 ? (data.used / data.limit) * 100 : 0;
    if (!acc || percentage > acc.percentage) {
      return { ...data, percentage };
    }
    return acc;
  }, null);

  if (!criticalProvider) return null;

  const { provider, percentage, used, limit } = criticalProvider;

  // Only show warning if over 80%
  if (percentage < 80) return null;

  // Don't show if dismissed
  if (dismissed[provider]) return null;

  const isOverLimit = percentage >= 100;
  const isCritical = percentage >= 90;

  const getMessage = () => {
    if (isOverLimit) {
      return {
        text: `Daily credit limit reached ($${(used / 100).toFixed(2)} of $${(limit / 100).toFixed(2)}). Upgrade to continue.`,
        action: 'Upgrade Now',
      };
    }
    if (isCritical) {
      return {
        text: `${percentage.toFixed(0)}% of daily credits used. Upgrade to avoid interruptions.`,
        action: 'View Plans',
      };
    }
    return {
      text: `${percentage.toFixed(0)}% of daily credits used.`,
      action: 'Monitor',
    };
  };

  const { text, action } = getMessage();

  return (
    <div
      role="alert"
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-sm',
        isOverLimit
          ? 'bg-red-950/60 border-b border-red-800/50 text-red-200'
          : isCritical
            ? 'bg-orange-950/60 border-b border-orange-800/50 text-orange-200'
            : 'bg-yellow-950/60 border-b border-yellow-800/50 text-yellow-200',
        className,
      )}
    >
      {/* Icon */}
      {isOverLimit ? (
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}

      {/* Message */}
      <span className="flex-1 text-xs">{text}</span>

      {/* CTA */}
      <button
        type="button"
        onClick={() => router.push('/pricing')}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
          isOverLimit
            ? 'bg-red-600 text-white hover:bg-red-500'
            : 'bg-amber-600/80 text-white hover:bg-amber-500',
        )}
      >
        <TrendingUp className="h-3 w-3" aria-hidden="true" />
        {action}
      </button>

      {/* Dismiss — always available */}
      <button
        type="button"
        aria-label="Dismiss usage warning"
        onClick={() => setDismissed((prev) => ({ ...prev, [provider]: true }))}
        className="shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Hook to fetch and monitor usage data from the /api/usage endpoint.
 * Returns data formatted for UsageWarningBanner.
 */
export function useUsageMonitoring(userId: string | null) {
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const fetchUsage = async () => {
      try {
        const response = await fetch('/api/usage', {
          credentials: 'include',
        });

        if (!response.ok) {
          setUsageData([]);
          return;
        }

        const data = await response.json();

        // Convert API response to UsageData format for the banner
        // Single entry representing the user's overall credit usage
        const result: UsageData[] = [
          {
            provider: data.plan_tier || 'Credits',
            used: data.credits_used_cents || 0,
            limit: data.credits_allocated_cents || 0,
          },
        ];

        setUsageData(result);
      } catch (error) {
        console.error('Failed to fetch usage data:', error);
        setUsageData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsage();

    // Refresh every 5 minutes
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  return { usageData, isLoading };
}
