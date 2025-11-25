/**
 * TokenCounter Component
 *
 * Real-time token counter display with visual gauge, context window limits,
 * and cost estimation. Similar to Claude Code and Cursor token displays.
 */

import { Activity, AlertTriangle, DollarSign, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { formatTokens } from '../../utils/tokenCount';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';

export interface TokenCounterProps {
  /**
   * Current token count
   */
  currentTokens: number;

  /**
   * Maximum context window size for the selected model
   */
  maxTokens: number;

  /**
   * Optional cost per token (for cost estimation)
   */
  costPerToken?: number;

  /**
   * Optional budget limit in tokens
   */
  budgetLimit?: number;

  /**
   * Show detailed breakdown in tooltip
   */
  showDetails?: boolean;

  /**
   * Compact mode (smaller display)
   */
  compact?: boolean;

  /**
   * Custom className
   */
  className?: string;
}

/**
 * Calculate usage percentage and determine status
 */
function getUsageStatus(current: number, max: number, budget?: number) {
  const percentage = (current / max) * 100;
  const budgetPercentage = budget ? (current / budget) * 100 : 0;

  let status: 'safe' | 'warning' | 'danger' | 'over-budget' = 'safe';
  let statusColor = 'text-success';
  let barColor = 'bg-success';

  if (budget && current >= budget) {
    status = 'over-budget';
    statusColor = 'text-destructive';
    barColor = 'bg-destructive';
  } else if (percentage >= 90) {
    status = 'danger';
    statusColor = 'text-destructive';
    barColor = 'bg-destructive';
  } else if (percentage >= 70 || (budget && budgetPercentage >= 80)) {
    status = 'warning';
    statusColor = 'text-warning';
    barColor = 'bg-warning';
  }

  return {
    percentage: Math.min(percentage, 100),
    budgetPercentage: budget ? Math.min(budgetPercentage, 100) : 0,
    status,
    statusColor,
    barColor,
  };
}

export const TokenCounter = ({
  currentTokens,
  maxTokens,
  costPerToken,
  budgetLimit,
  showDetails = true,
  compact = false,
  className,
}: TokenCounterProps) => {
  const { percentage, budgetPercentage, status, statusColor, barColor } = useMemo(
    () => getUsageStatus(currentTokens, maxTokens, budgetLimit),
    [currentTokens, maxTokens, budgetLimit],
  );

  const estimatedCost = useMemo(() => {
    if (!costPerToken) return null;
    return (currentTokens * costPerToken).toFixed(4);
  }, [currentTokens, costPerToken]);

  const tokensRemaining = maxTokens - currentTokens;
  const budgetRemaining = budgetLimit ? budgetLimit - currentTokens : null;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
              'bg-muted/50 hover:bg-muted',
              className,
            )}
          >
            <Activity className={cn('h-3.5 w-3.5', statusColor)} />
            <span className={statusColor}>{formatTokens(currentTokens)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{formatTokens(maxTokens)}</span>
          </div>
        </TooltipTrigger>
        {showDetails && (
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Usage</span>
                <span className="text-xs font-medium">{percentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Remaining</span>
                <span className="text-xs font-medium">{formatTokens(tokensRemaining)}</span>
              </div>
              {estimatedCost && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Est. cost</span>
                  <span className="text-xs font-medium">${estimatedCost}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    );
  }

  return (
    <div className={cn('space-y-2 rounded-lg border border-border bg-card p-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={cn('h-4 w-4', statusColor)} />
          <span className="text-sm font-medium">Token Usage</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('text-sm font-semibold', statusColor)}>
            {formatTokens(currentTokens)}
          </span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs text-muted-foreground">{formatTokens(maxTokens)}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full transition-all duration-300', barColor)}
            style={{ width: `${percentage}%` }}
          />
          {budgetLimit && budgetRemaining !== null && budgetRemaining > 0 && (
            <div
              className="absolute top-0 h-full border-r-2 border-warning"
              style={{ left: `${budgetPercentage}%` }}
            />
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{percentage.toFixed(1)}% used</span>
          {budgetLimit && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Budget: {formatTokens(budgetLimit)}
            </span>
          )}
        </div>
      </div>

      {/* Details Grid */}
      {showDetails && (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>Remaining</span>
            </div>
            <div className="text-sm font-medium">{formatTokens(tokensRemaining)}</div>
          </div>

          {estimatedCost && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                <span>Est. cost</span>
              </div>
              <div className="text-sm font-medium">${estimatedCost}</div>
            </div>
          )}

          {budgetRemaining !== null && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                <span>Budget left</span>
              </div>
              <div
                className={cn(
                  'text-sm font-medium',
                  budgetRemaining <= 0 ? 'text-destructive' : 'text-foreground',
                )}
              >
                {formatTokens(Math.max(0, budgetRemaining))}
              </div>
            </div>
          )}

          {status === 'danger' && (
            <div className="col-span-2 rounded-md bg-destructive/10 px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Approaching context limit</span>
              </div>
            </div>
          )}

          {status === 'over-budget' && (
            <div className="col-span-2 rounded-md bg-destructive/10 px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Budget limit exceeded</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TokenCounter;
