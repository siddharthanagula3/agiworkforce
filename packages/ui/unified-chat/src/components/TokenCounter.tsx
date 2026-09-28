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
  let statusColor = 'text-success-text';
  let barColor = 'bg-success-fill';

  if (budget && current >= budget) {
    status = 'over-budget';
    statusColor = 'text-danger-text';
    barColor = 'bg-danger-fill';
  } else if (percentage >= 90) {
    status = 'danger';
    statusColor = 'text-danger-text';
    barColor = 'bg-danger-fill';
  } else if (percentage >= 70 || (budget && budgetPercentage >= 80)) {
    status = 'warning';
    statusColor = 'text-warning-text';
    barColor = 'bg-warning-fill';
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
              showDanger && 'ring-1 ring-danger-fill/50',
              showWarning && 'ring-1 ring-warning-fill/50',
            )}
          >
            <Activity className={cn('h-3.5 w-3.5', statusColor)} />
            <span className={statusColor}>{formatTokens(currentTokens)}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{formatTokens(maxTokens)}</span>
            {(showWarning || showDanger) && (
              <span
                className={cn(
                  'ms-0.5 rounded-compact px-1 py-0.5 text-caption font-semibold',
                  showWarning && 'bg-warning-fill/10 text-warning-text',
                  showDanger && 'bg-danger-fill/10 text-danger-text',
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
            className="flex items-center gap-1 rounded-md border border-danger-fill/40 px-1.5 py-1 text-xs font-medium text-danger-text transition-colors hover:bg-danger-fill/10"
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
                className="absolute h-full bg-blue-500 transition-all duration-moved"
                style={{ width: `${(inputTokens / maxTokens) * 100}%` }}
              />
              <div
                className="absolute h-full bg-success-fill transition-all duration-moved"
                style={{
                  left: `${(inputTokens / maxTokens) * 100}%`,
                  width: `${(outputTokens / maxTokens) * 100}%`,
                }}
              />
            </>
          ) : (
            <div
              className={cn('h-full transition-all duration-moved', barColor)}
              style={{ width: `${percentage}%` }}
            />
          )}
          {budgetLimit && budgetRemaining !== null && budgetRemaining > 0 && (
            <div
              className="absolute top-0 h-full border-e-2 border-warning-fill"
              style={{ left: `${budgetPercentage}%` }}
            />
          )}
        </div>
        <div className="flex items-center justify-between text-caption text-muted-foreground">
          <span>{percentage.toFixed(1)}% used</span>
          {(inputTokens > 0 || outputTokens > 0) && (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />↓ {formatTokens(inputTokens)}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success-fill" />↑{' '}
                {formatTokens(outputTokens)}
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
                <div className="text-sm font-medium text-info-text">
                  {formatTokens(inputTokens)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-success-fill" />
                  <span>Output tokens</span>
                </div>
                <div className="text-sm font-medium text-success-text">
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
                  budgetRemaining <= 0 ? 'text-danger-text' : 'text-foreground',
                )}
              >
                {formatTokens(Math.max(0, budgetRemaining))}
              </div>
            </div>
          )}

          {status === 'warning' && (
            <div className="col-span-2 rounded-md bg-warning-fill/10 px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-warning-text">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Context window over 80% full</span>
                {onCompact && (
                  <button
                    type="button"
                    onClick={onCompact}
                    className="ms-auto flex items-center gap-1 rounded-compact border border-warning-fill/40 px-1.5 py-0.5 text-caption font-medium transition-colors hover:border-warning-fill"
                  >
                    <Scissors className="h-2.5 w-2.5" />
                    Compact
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'danger' && (
            <div className="col-span-2 rounded-md bg-danger-fill/10 px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-danger-text">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Approaching context limit</span>
                {onCompact && (
                  <button
                    type="button"
                    onClick={onCompact}
                    className="ms-auto flex items-center gap-1 rounded-compact border border-danger-fill/40 px-1.5 py-0.5 text-caption font-medium transition-colors hover:border-danger-fill"
                  >
                    <Scissors className="h-2.5 w-2.5" />
                    Compact now
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'over-budget' && (
            <div className="col-span-2 rounded-md bg-danger-fill/10 px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-danger-text">
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
