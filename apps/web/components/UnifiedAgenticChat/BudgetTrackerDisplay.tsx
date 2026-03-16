'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useBillingUsageStore } from '@/stores/unified/billingUsage';
import { useChatStore } from '@features/chat/stores/chat-store';

interface BudgetTrackerDisplayProps {
  className?: string;
}

const CENTS_TO_DOLLARS = 0.01;

export function BudgetTrackerDisplay({ className }: BudgetTrackerDisplayProps) {
  const sessionCost_cents = useBillingUsageStore((s) => s.sessionCost_cents);
  const dailyBudget_cents = useBillingUsageStore((s) => s.dailyBudget_cents);

  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const messages = useChatStore((s) =>
    activeSessionId ? (s.messages[activeSessionId] ?? []) : [],
  );

  const tokensUsed = useMemo(
    () =>
      messages.reduce((sum, msg) => sum + (msg.metadata?.tokensUsed ?? 0), 0),
    [messages],
  );

  const costThisSession = sessionCost_cents * CENTS_TO_DOLLARS;

  const tokensRemaining =
    dailyBudget_cents > 0
      ? Math.max(0, Math.round((dailyBudget_cents - sessionCost_cents) / 0.002))
      : undefined;

  if (tokensUsed === 0 && sessionCost_cents === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-white/[0.06] bg-white/[0.02] p-3',
        className,
      )}
      aria-label="Session budget"
    >
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tokens used:</span>
          <span className="font-medium tabular-nums">{tokensUsed.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cost this session:</span>
          <span className="font-medium tabular-nums">${costThisSession.toFixed(4)}</span>
        </div>
        {tokensRemaining !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining:</span>
            <span className="font-medium tabular-nums">{tokensRemaining.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default BudgetTrackerDisplay;
