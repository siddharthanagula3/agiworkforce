import { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';

import { invoke, isTauri } from '../../lib/tauri-mock';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';

/**
 * FIX-007 (Sprint 3): per-user daily LLM-spend tracker. Polls the
 * `budget_get_status` IPC every 30 seconds and renders a compact
 * `$X / $Y today` chip. The widget is the user-visible surface for the
 * `DailyBudgetGuard` enforcement that lives in the Rust backend; without
 * it, the user only sees the cap when a call is rejected.
 *
 * Mounts as a no-op in the web build (no IPC channel) and on Tauri before
 * the user is identified — the chip is shown only when we have a real
 * status to report.
 */
interface BudgetStatus {
  user_id: string;
  day: string;
  spent_usd: number;
  cap_usd: number;
  remaining_usd: number;
}

const POLL_INTERVAL_MS = 30_000;

export interface BudgetStatusWidgetProps {
  /** User identity for budget-bucket lookup. Pass `'default'` for guest sessions. */
  userId: string;
}

export function BudgetStatusWidget({ userId }: BudgetStatusWidgetProps) {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri || !userId) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      try {
        const next = await invoke<BudgetStatus>('budget_get_status', { userId });
        if (cancelled) return;
        setStatus(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        // Don't clear stale status — better to show a slightly stale
        // value than to disappear when the IPC blips.
      }
      if (!cancelled) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId]);

  if (!isTauri || (!status && !error)) {
    return null;
  }

  if (!status) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span>—</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>LLM budget</p>
          <p className="text-xs text-muted-foreground">
            Failed to read daily spend{error ? `: ${error}` : ''}.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const usagePercent = status.cap_usd > 0 ? (status.spent_usd / status.cap_usd) * 100 : 0;
  const colorClass =
    usagePercent >= 100
      ? 'text-destructive'
      : usagePercent >= 80
        ? 'text-warning'
        : 'text-muted-foreground';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('flex items-center gap-1.5 cursor-default', colorClass)}>
          <DollarSign className="h-3.5 w-3.5" />
          <span>
            ${status.spent_usd.toFixed(2)} / ${status.cap_usd.toFixed(2)}
          </span>
          <span className="text-muted-foreground">today</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Daily LLM spend cap (FIX-007)</p>
        <p className="text-xs text-muted-foreground">
          ${status.spent_usd.toFixed(4)} spent of ${status.cap_usd.toFixed(2)} cap (
          {usagePercent.toFixed(0)}%). Adjust the cap in Settings → Models → Budget.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
