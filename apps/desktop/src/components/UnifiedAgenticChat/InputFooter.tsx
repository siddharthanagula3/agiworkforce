/**
 * InputFooter Component
 *
 * Footer section with keyboard hints and usage meters.
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
  /** Monthly credit usage percentage (0-100) */
  creditPercentage: number;
  /** Daily credit usage percentage (0-100) */
  dailyCreditPercentage?: number;
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
  dailyCreditPercentage,
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
    <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700/50">
      <span className="text-xs text-gray-500 dark:text-gray-400">
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
        <div className="flex items-center gap-4">
          {/* Daily Usage */}
          {dailyCreditPercentage != null && (
            <div
              className="flex items-center gap-2"
              title={`Daily Usage: ${dailyCreditPercentage.toFixed(1)}%`}
            >
              <span className="text-xs text-gray-500 dark:text-gray-400">Daily:</span>
              <div className="w-20 h-1.5 bg-gray-200 dark:bg-charcoal-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    dailyCreditPercentage > 90
                      ? 'bg-red-500'
                      : dailyCreditPercentage > 75
                        ? 'bg-amber-500'
                        : 'bg-blue-500',
                  )}
                  style={{ width: `${dailyCreditPercentage}%` }}
                />
              </div>
              <span className="text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">
                {dailyCreditPercentage.toFixed(1)}%
              </span>
            </div>
          )}

          {/* Monthly Usage */}
          <div
            className="flex items-center gap-2"
            title={`Monthly Usage: ${creditPercentage.toFixed(1)}%`}
          >
            <span className="text-xs text-gray-500 dark:text-gray-400">Monthly:</span>
            <div className="w-20 h-1.5 bg-gray-200 dark:bg-charcoal-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  creditPercentage > 90
                    ? 'bg-red-500'
                    : creditPercentage > 75
                      ? 'bg-amber-500'
                      : 'bg-green-500',
                )}
                style={{ width: `${creditPercentage}%` }}
              />
            </div>
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                isLowBalance
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-600 dark:text-gray-300',
              )}
            >
              {creditPercentage.toFixed(1)}%
            </span>
          </div>
        </div>
      ) : !isSimpleMode && hasTokenUsage ? (
        <div className="flex items-center gap-2" title="Context Window Usage">
          <div className="w-24 h-1.5 bg-gray-200 dark:bg-charcoal-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                tokenPercentage > 90
                  ? 'bg-red-500'
                  : tokenPercentage > 70
                    ? 'bg-amber-500'
                    : 'bg-primary',
              )}
              style={{ width: `${tokenPercentage}%` }}
            />
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {(tokenCurrent ?? 0).toLocaleString()} / {(tokenMax ?? 0).toLocaleString()}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export default InputFooter;
