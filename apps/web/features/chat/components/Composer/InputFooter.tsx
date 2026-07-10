'use client';

import { cn } from '@shared/lib/utils';

interface InputFooterProps {
  /** Credits consumed this period (0–totalCredits) */
  usedCredits?: number;
  /** Total credit allowance for the period */
  totalCredits?: number;
  /** When true the bar is hidden (e.g. BYOK / unlimited plan) */
  hideCredits?: boolean;
}

function usageColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-green-500';
}

export function InputFooter({
  usedCredits = 0,
  totalCredits = 100,
  hideCredits = false,
}: InputFooterProps) {
  const pct = totalCredits > 0 ? Math.min(100, (usedCredits / totalCredits) * 100) : 0;
  const barColor = usageColor(pct);

  return (
    <div className="mt-2 flex items-center justify-end gap-4 px-1">
      {/* Right · credit usage bar */}
      {!hideCredits && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {usedCredits}/{totalCredits}
          </span>
          <div
            className="h-1 w-20 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Credit usage"
          >
            <div
              className={cn('h-full rounded-full transition-all duration-300', barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
