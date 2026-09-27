'use client';

import { formatCredits } from '@agiworkforce/types';
import { estimateVideoCredits } from '@/lib/billing/credit-estimates';
import { spendableCreditsNow, useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';
import { cn } from '@shared/lib/utils';

export interface VideoCostEstimateProps {
  modelId: string;
  resolution: string;
  aspectRatio: string;
  durationSecs?: number;
  className?: string;
}

export function VideoCostEstimate({
  modelId,
  resolution,
  aspectRatio,
  durationSecs,
  className,
}: VideoCostEstimateProps) {
  const { usage } = useManagedUsageSummary();
  const estimate = estimateVideoCredits({ modelId, resolution, aspectRatio, durationSecs });
  if (estimate === null) return null;

  const available = spendableCreditsNow(usage);
  const exceeds = available !== null && estimate > available;
  const amount = formatCredits(estimate, { maximumFractionDigits: estimate < 10 ? 1 : 0 });
  const detail = exceeds
    ? `This video is estimated at ${amount}, more than the ${formatCredits(available, { maximumFractionDigits: 1 })} you have available right now.`
    : `This video is estimated at ${amount}. The final cost settles when it is delivered, and a failed video costs nothing.`;

  return (
    <span
      title={detail}
      aria-label={detail}
      role="note"
      data-testid="video-cost-estimate"
      className={cn(
        'shrink-0 whitespace-nowrap text-xs',
        exceeds ? 'text-warning-text' : 'text-muted-foreground',
        className,
      )}
    >
      {`About ${amount}`}
    </span>
  );
}
