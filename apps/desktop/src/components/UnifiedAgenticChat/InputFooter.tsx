/**
 * InputFooter Component
 *
 * Minimal footer with keyboard hints and usage meters (shown only when usage > 80%).
 */

import React from 'react';
import { cn } from '../../lib/utils';

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

  const hasTokenUsage = tokenCurrent != null && tokenMax != null && tokenMax > 0;

  // Only show usage meters when usage exceeds 80%
  const showCreditMeter = !isSimpleMode && showCreditUsage && creditPercentage > 80;
  const showTokenMeter = !isSimpleMode && !showCreditMeter && hasTokenUsage && tokenPercentage > 80;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-[hsl(var(--border))]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {isSimpleMode ? (
            <>Press Enter to send</>
          ) : hasInlineSuggestion ? (
            <>Tab to accept suggestion / Esc to dismiss</>
          ) : (
            <>Enter to send / Shift+Enter for newline</>
          )}
        </span>
      </div>

      {/* Usage meters - only shown when usage > 80% */}
      {showCreditMeter ? (
        <div
          className="flex items-center gap-2"
          title={`Monthly Usage: ${creditPercentage.toFixed(1)}%`}
        >
          <div
            className="w-24 h-1.5 bg-[hsl(var(--muted))] rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.min(creditPercentage, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                creditPercentage > 90 ? 'bg-red-500' : 'bg-amber-500',
              )}
              style={{ width: `${Math.min(creditPercentage, 100)}%` }}
            />
          </div>
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              isLowBalance
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-[hsl(var(--muted-foreground))]',
            )}
          >
            {creditPercentage.toFixed(1)}%
          </span>
        </div>
      ) : showTokenMeter ? (
        <div className="flex items-center gap-2" title="Context Window Usage">
          <div
            className="w-24 h-1.5 bg-[hsl(var(--muted))] rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={tokenPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                tokenPercentage > 90 ? 'bg-red-500' : 'bg-amber-500',
              )}
              style={{ width: `${tokenPercentage}%` }}
            />
          </div>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {(tokenCurrent ?? 0).toLocaleString()} / {(tokenMax ?? 0).toLocaleString()}
          </span>
        </div>
      ) : null}
    </div>
  );
};
