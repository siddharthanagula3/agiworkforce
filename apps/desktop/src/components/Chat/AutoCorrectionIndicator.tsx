/**
 * AutoCorrectionIndicator Component
 *
 * Shows auto-correction status and statistics.
 * Similar to BugBot status in Cursor.
 */

import { RefreshCw, Check, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import type { AutoCorrectionState } from '../../hooks/useAutoCorrection';

export interface AutoCorrectionIndicatorProps {
  state: AutoCorrectionState;
  compact?: boolean;
  className?: string;
}

export function AutoCorrectionIndicator({
  state,
  compact = false,
  className,
}: AutoCorrectionIndicatorProps) {
  if (!state.isActive && state.attemptCount === 0) {
    return null; // Don't show if never activated
  }

  const hasErrors = state.errors.length > 0;
  const isRetrying = state.isActive && hasErrors;
  const isFixed = !state.isActive && state.attemptCount > 0 && !hasErrors;

  const config = isFixed
    ? {
        icon: Check,
        label: 'Auto-corrected',
        color: 'text-success',
        bg: 'bg-success/10',
      }
    : isRetrying
      ? {
          icon: RefreshCw,
          label: 'Auto-correcting',
          color: 'text-primary',
          bg: 'bg-primary/10',
        }
      : {
          icon: hasErrors ? XCircle : AlertTriangle,
          label: 'Correction failed',
          color: 'text-destructive',
          bg: 'bg-destructive/10',
        };

  const Icon = config.icon;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
              config.bg,
              config.color,
              className,
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', isRetrying && 'animate-spin')} />
            <span>{state.attemptCount} attempts</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">
              {state.totalErrors} errors detected, {state.fixedErrors} fixed
            </p>
            {state.errors.length > 0 && (
              <p className="text-xs text-muted-foreground">{state.errors.length} remaining</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border p-3', config.bg, className)}>
      <div className="flex items-start gap-3">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-full', config.bg)}>
          <Icon className={cn('h-4 w-4', config.color, isRetrying && 'animate-spin')} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className={cn('font-semibold', config.color)}>{config.label}</h4>
            <span className="text-xs text-muted-foreground">Attempt {state.attemptCount} of 3</span>
          </div>

          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Total errors detected:</span>
              <span className="font-medium">{state.totalErrors}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Errors fixed:</span>
              <span className="font-medium text-success">{state.fixedErrors}</span>
            </div>
            {state.errors.length > 0 && (
              <div className="flex items-center justify-between">
                <span>Remaining errors:</span>
                <span className="font-medium text-destructive">{state.errors.length}</span>
              </div>
            )}
          </div>

          {/* Error list */}
          {state.errors.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium">Current errors:</p>
              <div className="space-y-1">
                {state.errors.slice(0, 3).map((error, idx) => (
                  <div
                    key={idx}
                    className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">[{error.type}]</span>{' '}
                    {error.message.slice(0, 100)}
                    {error.message.length > 100 && '...'}
                  </div>
                ))}
                {state.errors.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{state.errors.length - 3} more errors
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AutoCorrectionIndicator;
