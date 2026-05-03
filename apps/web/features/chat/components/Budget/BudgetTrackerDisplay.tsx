'use client';

import { useMemo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useBillingUsageStore } from '@/stores/unified/billingUsage';
import { useChatStore } from '@features/chat/stores/chat-store';

interface BudgetTrackerDisplayProps {
  className?: string;
  /** When true, also fetches and shows the credit balance from /api/llm/v1/credits/balance */
  showCreditBalance?: boolean;
}

interface CreditBalance {
  monthly_remaining_cents: number;
  monthly_allocated_cents: number;
  daily_remaining_cents: number;
  daily_limit_cents: number;
}

interface CreditsResponse {
  credits: CreditBalance;
}

const CENTS_TO_DOLLARS = 0.01;

async function fetchCreditBalance(): Promise<CreditBalance | null> {
  try {
    const response = await fetch('/api/llm/v1/credits/balance', {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data: CreditsResponse = await response.json();
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

  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const messages = useChatStore((s) =>
    activeSessionId ? (s.messages[activeSessionId] ?? []) : [],
  );

  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
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

  const tokensUsed = useMemo(
    () => messages.reduce((sum, msg) => sum + (msg.metadata?.tokensUsed ?? 0), 0),
    [messages],
  );

  const costThisSession = sessionCost_cents * CENTS_TO_DOLLARS;

  const tokensRemaining =
    dailyBudget_cents > 0
      ? Math.max(0, Math.round((dailyBudget_cents - sessionCost_cents) / 0.002))
      : undefined;

  if (tokensUsed === 0 && sessionCost_cents === 0 && !showCreditBalance) {
    return null;
  }

  return (
    <div
      className={cn('rounded-lg border border-white/[0.06] bg-white/[0.02] p-3', className)}
      aria-label="Session budget"
    >
      <div className="space-y-2 text-xs">
        {/* Token usage */}
        {tokensUsed > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tokens used:</span>
            <span className="font-medium tabular-nums">{tokensUsed.toLocaleString()}</span>
          </div>
        )}

        {/* Session cost */}
        {sessionCost_cents > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cost this session:</span>
            <span className="font-medium tabular-nums">${costThisSession.toFixed(4)}</span>
          </div>
        )}

        {/* Daily tokens remaining (from billing store) */}
        {tokensRemaining !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Daily remaining:</span>
            <span className="font-medium tabular-nums">{tokensRemaining.toLocaleString()}</span>
          </div>
        )}

        {/* Credit balance from API */}
        {showCreditBalance && (
          <>
            {balanceLoading ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit balance:</span>
                <span className="font-medium text-muted-foreground animate-pulse">loading…</span>
              </div>
            ) : creditBalance ? (
              <>
                <div className="border-t border-white/[0.06] pt-2 mt-2">
                  <p className="text-muted-foreground mb-1.5 font-medium uppercase tracking-wide text-[10px]">
                    Credit Balance
                  </p>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly remaining:</span>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      creditBalance.monthly_remaining_cents <= 0 && 'text-destructive',
                    )}
                  >
                    ${(creditBalance.monthly_remaining_cents * CENTS_TO_DOLLARS).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly allocated:</span>
                  <span className="font-medium tabular-nums">
                    ${(creditBalance.monthly_allocated_cents * CENTS_TO_DOLLARS).toFixed(2)}
                  </span>
                </div>
                {creditBalance.daily_limit_cents > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily remaining:</span>
                    <span
                      className={cn(
                        'font-medium tabular-nums',
                        creditBalance.daily_remaining_cents <= 0 && 'text-destructive',
                      )}
                    >
                      ${(creditBalance.daily_remaining_cents * CENTS_TO_DOLLARS).toFixed(2)}
                    </span>
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
