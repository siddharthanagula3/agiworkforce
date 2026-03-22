/**
 * PlanBadge
 * Compact pill badge showing the user's plan tier and remaining credits,
 * designed to live in the chat header on agiworkforce.com/chat.
 *
 * Display format:
 *   Paid:  "[Pro · $12.34 left]"
 *   Free:  "[Free · Upgrade →]"
 *
 * Color states (by usage % consumed):
 *   Green  — > 50% remaining
 *   Yellow — 25–50% remaining
 *   Red    — < 25% remaining
 *
 * Tooltip: "X credits remaining · Resets [date]"
 * Click:   navigate to /billing
 * Loading: skeleton pill
 * Error:   renders nothing
 */

'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@shared/lib/utils';
import { useBillingData } from '@features/billing/hooks/use-billing-queries';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip';
import type { BillingPlan } from '@features/billing/hooks/use-billing-queries';

// ============================================================================
// Helpers
// ============================================================================

const PLAN_LABELS: Record<BillingPlan, string> = {
  free: 'Free',
  hobby: 'Hobby',
  pro: 'Pro',
  max: 'Max',
  enterprise: 'Enterprise',
};

/** Format a cents value as "$X.XX" */
function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/** Format an ISO date string as "Mar 1" */
function formatResetDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return 'next month';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'next month';
  }
}

/**
 * Return colour variant key based on remaining usage percentage.
 * pctRemaining is 0–100 (100 = nothing used yet).
 */
function getColorVariant(pctRemaining: number): 'green' | 'yellow' | 'red' {
  if (pctRemaining > 50) return 'green';
  if (pctRemaining >= 25) return 'yellow';
  return 'red';
}

const colorClasses: Record<'green' | 'yellow' | 'red', string> = {
  green:
    'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
  yellow:
    'bg-amber-500/10 text-amber-700 border-amber-500/20 hover:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30',
  red: 'bg-red-500/10 text-red-700 border-red-500/20 hover:bg-red-500/20 dark:text-red-400 dark:border-red-500/30',
};

const freePillClasses = 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20';

// ============================================================================
// Component
// ============================================================================

export function PlanBadge() {
  const router = useRouter();
  const { data: billing, isLoading, isError } = useBillingData();

  // Loading state: skeleton pill
  if (isLoading) {
    return <div className="w-28 h-7 rounded-full animate-pulse bg-muted" aria-hidden="true" />;
  }

  // Error or no data: render nothing (graceful degradation)
  if (isError || !billing) {
    return null;
  }

  const plan = billing.plan as BillingPlan;
  const planLabel = PLAN_LABELS[plan] ?? 'Free';
  const isFree = plan === 'free';

  // Credits are stored in cents in currentBalance
  const balanceCents = billing.usage?.currentBalance ?? 0;
  // totalLimit is in tokens; map to cents via the same 1:100 ratio used in the dashboard
  const allocatedCents = billing.usage?.totalLimit ? Math.round(billing.usage.totalLimit / 100) : 0;

  // Compute remaining percentage (0–100, where 100 = full balance remaining)
  const pctRemaining =
    allocatedCents > 0 ? Math.min(100, Math.round((balanceCents / allocatedCents) * 100)) : 0;

  const colorVariant = getColorVariant(pctRemaining);
  const resetDate = formatResetDate(billing.current_period_end);

  const handleClick = () => {
    router.push('/billing');
  };

  // ---- Tooltip content ----
  const tooltipText = isFree
    ? 'Upgrade to Pro for more credits'
    : `${formatCents(balanceCents)} credits remaining · Resets ${resetDate}`;

  // ---- Pill label ----
  const pillLabel = isFree
    ? `${planLabel} · Upgrade →`
    : `${planLabel} · ${formatCents(balanceCents)} left`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            aria-label={`Plan: ${planLabel}. ${tooltipText}. Click to manage billing.`}
            className={cn(
              // Base pill shape
              'inline-flex items-center gap-1 whitespace-nowrap',
              'rounded-full border px-2.5 py-1',
              'text-xs font-medium leading-none',
              'transition-colors duration-150',
              'cursor-pointer select-none',
              // Color
              isFree ? freePillClasses : colorClasses[colorVariant],
            )}
          >
            {pillLabel}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[200px] text-center">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
