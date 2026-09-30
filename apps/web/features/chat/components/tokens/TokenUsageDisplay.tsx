import { Badge } from '@agiworkforce/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@agiworkforce/ui';
import { formatCredits } from '@agiworkforce/types';
import { getModelPresentationLabel } from '@agiworkforce/unified-chat';
import { Zap, TrendingUp } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import {
  useSettledTurnCredits,
  type SettledTurnCredits,
} from '@features/chat/lib/use-settled-turn-credits';

interface TokenUsageDisplayProps {
  tokensUsed: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  requestId?: string;
  className?: string;
  variant?: 'compact' | 'detailed';
}

function settledCreditsLabel(settled: SettledTurnCredits | null): string | null {
  if (!settled) return null;
  switch (settled.status) {
    case 'settled':
      return formatCredits(settled.credits, { maximumFractionDigits: 2 });
    case 'loading':
    case 'pending':
      return 'Credits settling';
    case 'unavailable':
      return 'Credits unavailable';
    case 'unmetered':
      return null;
  }
}

export function TokenUsageDisplay({
  tokensUsed,
  inputTokens,
  outputTokens,
  model,
  requestId,
  className,
  variant = 'compact',
}: TokenUsageDisplayProps) {
  const creditsLabel = settledCreditsLabel(useSettledTurnCredits(requestId));

  const formatTokens = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  if (variant === 'compact') {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className={cn('flex items-center gap-1.5 text-xs font-normal', className)}
            >
              <Zap className="h-3 w-3" />
              <span>{formatTokens(tokensUsed)} tokens</span>
              {creditsLabel && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span>{creditsLabel}</span>
                </>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1 text-xs">
              {model && (
                <div className="font-medium text-foreground">
                  {getModelPresentationLabel(model)}
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Input tokens:</span>
                <span className="font-mono">{inputTokens ? formatTokens(inputTokens) : 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Output tokens:</span>
                <span className="font-mono">
                  {outputTokens ? formatTokens(outputTokens) : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-1">
                <span className="font-medium">Total:</span>
                <span className="font-mono font-medium">{formatTokens(tokensUsed)}</span>
              </div>
              {creditsLabel && (
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">Credits:</span>
                  <span className="font-mono font-medium">{creditsLabel}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3 text-xs',
        className,
      )}
    >
      {model && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="font-medium">{getModelPresentationLabel(model)}</span>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono">{formatTokens(tokensUsed)}</span>
          <span className="text-muted-foreground">tokens</span>
        </div>

        {inputTokens && outputTokens && (
          <div className="text-muted-foreground">
            <span className="font-mono">{formatTokens(inputTokens)}</span>
            {' → '}
            <span className="font-mono">{formatTokens(outputTokens)}</span>
          </div>
        )}

        {creditsLabel && <span className="font-mono font-medium">{creditsLabel}</span>}
      </div>
    </div>
  );
}
