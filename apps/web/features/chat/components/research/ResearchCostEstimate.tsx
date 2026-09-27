'use client';

import { formatCredits } from '@agiworkforce/types';
import { estimateResearchCredits } from '@/lib/billing/credit-estimates';
import { spendableCreditsNow, useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';
import { cn } from '@shared/lib/utils';

export interface ResearchCostEstimateProps {
  modelId: string | null | undefined;
  rounds: number | undefined;
  searches: number | undefined;
  className?: string;
}

function credits(value: number): string {
  return formatCredits(value, { maximumFractionDigits: value < 10 ? 1 : 0 });
}

export function ResearchCostEstimate({
  modelId,
  rounds,
  searches,
  className,
}: ResearchCostEstimateProps) {
  const { usage } = useManagedUsageSummary();
  const estimate =
    modelId && rounds && searches !== undefined
      ? estimateResearchCredits({ modelId, rounds, searches })
      : null;
  const available = spendableCreditsNow(usage);

  if (!estimate) {
    return (
      <p
        className={cn('text-xs text-muted-foreground', className)}
        data-testid="research-cost-estimate"
      >
        A cost estimate is not available for this model. The run is metered as it goes.
      </p>
    );
  }

  const exceeds = available !== null && estimate.total > available;
  return (
    <div className={cn('space-y-0.5 text-xs', className)} data-testid="research-cost-estimate">
      <p className="text-muted-foreground">
        {`Estimated cost: up to about ${credits(estimate.total)} for up to ${rounds} model rounds and ${searches} searches.`}
      </p>
      {available !== null ? (
        <p className={exceeds ? 'text-warning-text' : 'text-muted-foreground'}>
          {exceeds
            ? `You have ${credits(available)} available right now, so the run may stop before it finishes.`
            : `You have ${credits(available)} available right now.`}
        </p>
      ) : null}
    </div>
  );
}
