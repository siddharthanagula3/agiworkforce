/**
 * TokenCounter
 * Compact pill showing token usage with a detailed tooltip breakdown.
 *
 * Display format: "1.2k tokens"
 * Tooltip: "Prompt: 800 | Completion: 400 | Cost: ~$0.003"
 */

'use client';

import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { Badge } from '@shared/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip';
import { cn } from '@shared/lib/utils';

export interface TokenCounterProps {
  /** Total prompt (input) tokens */
  promptTokens: number;
  /** Total completion (output) tokens */
  completionTokens: number;
  /** Estimated cost in USD (optional) */
  cost?: number;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Format a token count for display:
 *   - < 1,000    -> "842"
 *   - 1,000+     -> "1.2k"
 *   - 1,000,000+ -> "1.3M"
 */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return n.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.001) {
    return '<$0.001';
  }
  if (cost < 0.01) {
    return `~$${cost.toFixed(4)}`;
  }
  return `~$${cost.toFixed(3)}`;
}

export function TokenCounter({
  promptTokens,
  completionTokens,
  cost,
  className,
}: TokenCounterProps) {
  const totalTokens = useMemo(
    () => promptTokens + completionTokens,
    [promptTokens, completionTokens],
  );

  // Don't render if there are no tokens
  if (totalTokens === 0) {
    return null;
  }

  const tooltipLines: string[] = [
    `Prompt: ${formatTokenCount(promptTokens)}`,
    `Completion: ${formatTokenCount(completionTokens)}`,
  ];
  if (cost !== undefined && cost > 0) {
    tooltipLines.push(`Cost: ${formatCost(cost)}`);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={cn(
              'inline-flex cursor-default items-center gap-1 whitespace-nowrap text-xs font-normal',
              className,
            )}
          >
            <Zap className="h-3 w-3 shrink-0" />
            <span>{formatTokenCount(totalTokens)} tokens</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-0.5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Prompt:</span>
              <span className="font-mono">{formatTokenCount(promptTokens)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Completion:</span>
              <span className="font-mono">{formatTokenCount(completionTokens)}</span>
            </div>
            {cost !== undefined && cost > 0 && (
              <div className="flex items-center justify-between gap-4 border-t border-border pt-1">
                <span className="text-muted-foreground">Cost:</span>
                <span className="font-mono">{formatCost(cost)}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default TokenCounter;
