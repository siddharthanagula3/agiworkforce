/**
 * TokenCounter — visual context-window usage bar with optional input/output
 * split + budget marker + compact mode.
 *
 * Pure props-driven. Hosts pass currentTokens / maxTokens / budgetLimit and
 * render anywhere (chat header, sidecar, settings). The compact variant fits
 * in a sidebar pill; the full variant is a card with breakdown + warnings.
 */
import { Activity, AlertTriangle, Scissors, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { Tooltip } from './ui/Tooltip';
import { cn } from '../lib/utils';
import { formatTokens } from '../stores/budgetStore';

export interface TokenCounterProps {
  currentTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  maxTokens: number;
  budgetLimit?: number;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
  /** Shown as a "Compact" button when usage > 95% (compact mode) or > 80% (full mode). */
  onCompact?: () => void;
}

type UsageStatus = 'safe' | 'warning' | 'danger' | 'over-budget';

function getUsageStatus(
  current: number,
  max: number,
  budget?: number,
): {
  percentage: number;
  budgetPercentage: number;
  status: UsageStatus;
  statusColor: string;
  barColor: string;
} {
  const percentage = max > 0 ? (current / max) * 100 : 0;
  const budgetPercentage = budget && budget > 0 ? (current / budget) * 100 : 0;

  let status: UsageStatus = 'safe';
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
  inputTokens = 0,
  outputTokens = 0,
  maxTokens,
  budgetLimit,
  showDetails = true,
  compact = false,
  className,
  onCompact,
}: TokenCounterProps) => {
  const { percentage, budgetPercentage, status, statusColor, barColor } = useMemo(
    () => getUsageStatus(currentTokens, maxTokens, budgetLimit),
    [currentTokens, maxTokens, budgetLimit],
  );

  const tokensRemaining = maxTokens - currentTokens;
  const budgetRemaining = budgetLimit ? budgetLimit - currentTokens : null;

  if (compact) {
    const showWarning = percentage >= 80 && percentage < 95;
    const showDanger = percentage >= 95;

    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Tooltip content={`${percentage.toFixed(1)}% used · ${formatTokens(tokensRemaining)} left`}>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
              'bg-muted/50 hover:bg-muted',
              showDanger && 'ring-1 ring-destructive/50',
              showWarning && 'ring-1 ring-warning/50',
            )}
          >
            <Activity className={cn('h-3.5 w-3.5', statusColor)} />
            <span className={statusColor}>{formatTokens(currentTokens)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{formatTokens(maxTokens)}</span>
            {(showWarning || showDanger) && (
              <span
                className={cn(
                  'ml-0.5 rounded px-1 py-0.5 text-[9px] font-semibold',
                  showWarning && 'bg-warning/20 text-warning',
                  showDanger && 'bg-destructive/20 text-destructive',
                )}
              >
                {percentage.toFixed(0)}%
              </span>
            )}
          </div>
        </Tooltip>
        {showDanger && onCompact && (
          <button
            type="button"
            onClick={onCompact}
            className="flex items-center gap-1 rounded-md bg-destructive/15 px-1.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25"
            title="Compact context to free up space"
          >
            <Scissors className="h-3 w-3" />
            Compact
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2 rounded-lg border border-border bg-card p-3', className)}>
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

      <div className="space-y-1">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
          {inputTokens > 0 || outputTokens > 0 ? (
            <>
              <div
                className="absolute h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(inputTokens / maxTokens) * 100}%` }}
              />
              <div
                className="absolute h-full bg-green-500 transition-all duration-300"
                style={{
                  left: `${(inputTokens / maxTokens) * 100}%`,
                  width: `${(outputTokens / maxTokens) * 100}%`,
                }}
              />
            </>
          ) : (
            <div
              className={cn('h-full transition-all duration-300', barColor)}
              style={{ width: `${percentage}%` }}
            />
          )}
          {budgetLimit && budgetRemaining !== null && budgetRemaining > 0 && (
            <div
              className="absolute top-0 h-full border-r-2 border-warning"
              style={{ left: `${budgetPercentage}%` }}
            />
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{percentage.toFixed(1)}% used</span>
          {(inputTokens > 0 || outputTokens > 0) && (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />↓ {formatTokens(inputTokens)}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />↑ {formatTokens(outputTokens)}
              </span>
            </span>
          )}
          {budgetLimit && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Budget: {formatTokens(budgetLimit)}
            </span>
          )}
        </div>
      </div>

      {showDetails && (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-2">
          {(inputTokens > 0 || outputTokens > 0) && (
            <>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Input tokens</span>
                </div>
                <div className="text-sm font-medium text-blue-400">{formatTokens(inputTokens)}</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Output tokens</span>
                </div>
                <div className="text-sm font-medium text-green-400">
                  {formatTokens(outputTokens)}
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>Remaining</span>
            </div>
            <div className="text-sm font-medium">{formatTokens(tokensRemaining)}</div>
          </div>

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

          {status === 'warning' && (
            <div className="col-span-2 rounded-md bg-warning/10 px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Context window over 80% full</span>
                {onCompact && (
                  <button
                    type="button"
                    onClick={onCompact}
                    className="ml-auto flex items-center gap-1 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-warning/30"
                  >
                    <Scissors className="h-2.5 w-2.5" />
                    Compact
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'danger' && (
            <div className="col-span-2 rounded-md bg-destructive/10 px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Approaching context limit</span>
                {onCompact && (
                  <button
                    type="button"
                    onClick={onCompact}
                    className="ml-auto flex items-center gap-1 rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-destructive/30"
                  >
                    <Scissors className="h-2.5 w-2.5" />
                    Compact now
                  </button>
                )}
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
