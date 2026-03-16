/**
 * InputFooter Component
 *
 * Footer section with keyboard hints and usage meters.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface InputFooterProps {
  /** Whether in simple mode */
  isSimpleMode?: boolean;
  /** Whether there's an inline suggestion */
  hasInlineSuggestion: boolean;
  /** Whether to show credit usage */
  showCreditUsage: boolean;
  /** Credit usage percentage (0-100) */
  creditPercentage: number;
  /** Whether balance is low */
  isLowBalance: boolean;
  /** Token usage current value */
  tokenCurrent?: number;
  /** Token usage max value */
  tokenMax?: number;
}

export const InputFooter: React.FC<InputFooterProps> = ({
  isSimpleMode = false,
  hasInlineSuggestion,
  showCreditUsage,
  creditPercentage,
  isLowBalance,
  tokenCurrent,
  tokenMax,
}) => {
  const tokenPercentage =
    tokenCurrent != null && tokenMax != null && tokenMax > 0
      ? Math.min((tokenCurrent / tokenMax) * 100, 100)
      : 0;

  const hasTokenUsage = tokenCurrent != null && tokenMax != null;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border/50">
      <span className="text-xs text-muted-foreground">
        {isSimpleMode ? (
          <>Press Enter to send</>
        ) : hasInlineSuggestion ? (
          <>Tab to accept suggestion / Esc to dismiss</>
        ) : (
          <>Enter to send / Shift+Enter for newline</>
        )}
      </span>

      {/* Usage meters - hidden in simple mode */}
      {!isSimpleMode && showCreditUsage ? (
        <div
          className="flex items-center gap-2"
          title={`Monthly Usage: ${creditPercentage.toFixed(1)}%`}
        >
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                creditPercentage > 90
                  ? 'bg-destructive'
                  : creditPercentage > 75
                    ? 'bg-warning'
                    : 'bg-success',
              )}
              style={{ width: `${creditPercentage}%` }}
            />
          </div>
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              isLowBalance ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            {creditPercentage.toFixed(1)}%
          </span>
        </div>
      ) : !isSimpleMode && hasTokenUsage ? (
        <div className="flex items-center gap-2" title="Context Window Usage">
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                tokenPercentage > 90
                  ? 'bg-destructive'
                  : tokenPercentage > 70
                    ? 'bg-warning'
                    : 'bg-primary',
              )}
              style={{ width: `${tokenPercentage}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {(tokenCurrent ?? 0).toLocaleString()} / {(tokenMax ?? 0).toLocaleString()}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default InputFooter;
