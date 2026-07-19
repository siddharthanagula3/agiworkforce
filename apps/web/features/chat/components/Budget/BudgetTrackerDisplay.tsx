'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useBillingUsageStore } from '@shared/stores/billing-usage-store';
import type { ManagedUsageBalance, ManagedUsageBalanceResponse } from '@agiworkforce/types';

interface BudgetTrackerDisplayProps {
  className?: string;
  /** When true, also fetches and shows the credit balance from /api/llm/v1/credits/balance */
  showCreditBalance?: boolean;
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

  return (
    <div
      className={cn('rounded-lg border border-white/[0.06] bg-white/[0.02] p-3', className)}
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
                <div className="border-t border-white/[0.06] pt-2 mt-2">
                  <p className="text-muted-foreground mb-1.5 font-medium uppercase tracking-wide text-[10px]">
                    Plan usage
                  </p>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current period:</span>
                  <span className="font-medium tabular-nums">
                    {Math.min(100, Math.max(0, Math.round(creditBalance.usage_percentage)))}% used
                  </span>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default BudgetTrackerDisplay;
