/**
 * InputFooter Component
 *
 * Footer section with keyboard hints, usage meters, and project folder selector.
 */

import React, { useCallback } from 'react';
import { FolderOpen } from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { cn } from '../../lib/utils';
import { useProjectStore } from '../../stores/projectStore';

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

  const currentFolder = useProjectStore((s) => s.currentFolder);
  const setCurrentFolder = useProjectStore((s) => s.setCurrentFolder);

  // Derive basename from the full path for display
  const folderBasename = currentFolder
    ? currentFolder.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? currentFolder
    : null;

  const handleSelectFolder = useCallback(async () => {
    try {
      const selected = await openDialog({ directory: true });
      if (typeof selected === 'string' && selected.length > 0) {
        setCurrentFolder(selected);
      }
    } catch (err) {
      // User cancelled the dialog or dialog is unavailable — silently ignore
      console.debug('[InputFooter] Folder dialog cancelled or unavailable', err);
    }
  }, [setCurrentFolder]);

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

        {/* Project folder pill */}
        {!isSimpleMode && (
          <button
            type="button"
            onClick={handleSelectFolder}
            title={currentFolder ?? 'Select project folder'}
            className={cn(
              'flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs',
              'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]',
              'hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--foreground)/0.3)]',
              'transition-colors duration-150 shrink-0 max-w-[160px]',
            )}
          >
            <FolderOpen className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {folderBasename ?? 'Select project'}
            </span>
          </button>
        )}
      </div>

      {/* Usage meters - hidden in simple mode */}
      {!isSimpleMode && showCreditUsage ? (
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
                creditPercentage > 90
                  ? 'bg-red-500'
                  : creditPercentage > 75
                    ? 'bg-amber-500'
                    : 'bg-green-500',
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
      ) : !isSimpleMode && hasTokenUsage ? (
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
                tokenPercentage > 90
                  ? 'bg-red-500'
                  : tokenPercentage > 70
                    ? 'bg-amber-500'
                    : 'bg-primary',
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

export default InputFooter;
