'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useBillingUsageStore } from '@shared/stores/billing-usage-store';
import type { ManagedUsageBalance, ManagedUsageBalanceResponse } from '@agiworkforce/types';

interface BudgetTrackerDisplayProps {
  className?: string;
  showCreditBalance?: boolean;
  variant?: 'card' | 'compact';
}

async function fetchCreditBalance(): Promise<ManagedUsageBalance | null> {
  try {
    const response = await fetch('/api/llm/v1/credits/balance', {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data: ManagedUsageBalanceResponse = await response.json();
    return data.credits ?? null;
  } catch {
    return null;
  }
}

export function BudgetTrackerDisplay({
  className,
  showCreditBalance = false,
  variant = 'card',
}: BudgetTrackerDisplayProps) {
  const sessionCost_cents = useBillingUsageStore((s) => s.sessionCost_cents);
  const dailyBudget_cents = useBillingUsageStore((s) => s.dailyBudget_cents);

  const [creditBalance, setCreditBalance] = useState<ManagedUsageBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    if (!showCreditBalance) return;

    let cancelled = false;
    setBalanceLoading(true);

    fetchCreditBalance().then((balance) => {
      if (!cancelled) {
        setCreditBalance(balance);
        setBalanceLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [showCreditBalance]);

  const sessionUsedPercent =
    dailyBudget_cents > 0
      ? Math.min(100, Math.max(0, Math.round((sessionCost_cents / dailyBudget_cents) * 100)))
      : null;

  if (sessionUsedPercent === null && !showCreditBalance) {
    return null;
  }

  if (variant === 'compact') {
    if (sessionUsedPercent === null) return null;
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground',
          className,
        )}
        aria-label={`Session budget: ${sessionUsedPercent}% used`}
        title={`Current session: ${sessionUsedPercent}% of your daily budget`}
      >
        <span className="tabular-nums font-medium text-foreground">{sessionUsedPercent}%</span>
        <span>used</span>
      </span>
    );
  }

  return (
    <div
      className={cn('rounded-lg border border-border bg-card p-3', className)}
      aria-label="Session budget"
    >
      <div className="space-y-2 text-xs">
        {sessionUsedPercent !== null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current session:</span>
            <span className="font-medium tabular-nums">{sessionUsedPercent}% used</span>
          </div>
        )}

        {/* Credit balance from API */}
        {showCreditBalance && (
          <>
            {balanceLoading ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan usage:</span>
                <span className="font-medium text-muted-foreground animate-pulse">loading…</span>
              </div>
            ) : creditBalance ? (
              <>
                <div className="border-t border-border pt-2 mt-2">
                  <p className="text-muted-foreground mb-1.5 font-medium uppercase tracking-wide text-[10px]">
                    Plan usage
                  </p>
                </div>
                {/* Free's allowance is internal: the server sends no percentage
                    for it, so there is nothing to render and nothing to game.
                    The plan still meters and still refuses when exhausted. */}
                {creditBalance.usage_visible && creditBalance.usage_percentage !== null ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current period:</span>
                    <span className="font-medium tabular-nums">
                      {Math.min(100, Math.max(0, Math.round(creditBalance.usage_percentage)))}% used
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {creditBalance.has_usage_remaining ? 'Included usage' : 'Limit reached'}
                    </span>
                    <a href="/pricing" className="font-medium underline underline-offset-2">
                      Upgrade
                    </a>
                  </div>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default BudgetTrackerDisplay;
