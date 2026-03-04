/**
 * BranchNavigator Component
 *
 * Compact navigation arrows for cycling through conversation branches at fork points.
 * Displays "< 1/3 >" style controls with branch name tooltip on hover.
 */

import React, { memo, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BranchSummary } from '../../stores/chat/types';

export interface BranchNavigatorProps {
  branches: BranchSummary[];
  activeBranchId: string;
  onSwitch: (branchId: string) => void;
  /** The message ID at which this fork occurred (used to filter relevant branches) */
  messageId: number;
}

const BranchNavigatorComponent: React.FC<BranchNavigatorProps> = ({
  branches,
  activeBranchId,
  onSwitch,
  messageId,
}) => {
  // Only show branches that fork at or near this message
  const relevantBranches = useMemo(() => {
    if (branches.length === 0) return [];
    // Include main branch and branches that forked at this message
    return branches.filter((b) => b.id === 'main' || b.forkPointMessageId === messageId);
  }, [branches, messageId]);

  const currentIndex = relevantBranches.findIndex((b) => b.id === activeBranchId);
  const total = relevantBranches.length;

  if (total <= 1) return null;

  const handlePrev = () => {
    if (currentIndex <= 0) return;
    const prev = relevantBranches[currentIndex - 1];
    if (prev) onSwitch(prev.id);
  };

  const handleNext = () => {
    if (currentIndex >= total - 1) return;
    const next = relevantBranches[currentIndex + 1];
    if (next) onSwitch(next.id);
  };

  const activeBranch = relevantBranches[currentIndex];
  const displayIndex = currentIndex === -1 ? '?' : currentIndex + 1;

  return (
    <div className="inline-flex items-center gap-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1 py-0.5">
      <button
        type="button"
        onClick={handlePrev}
        disabled={currentIndex <= 0}
        className={cn(
          'flex items-center justify-center w-4 h-4 rounded transition-colors',
          currentIndex <= 0
            ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700',
        )}
        aria-label="Previous branch"
      >
        <ChevronLeft size={10} />
      </button>

      <span
        className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 px-0.5 min-w-[28px] text-center cursor-default"
        title={activeBranch?.name ?? activeBranchId}
      >
        {displayIndex}/{total}
      </span>

      <button
        type="button"
        onClick={handleNext}
        disabled={currentIndex >= total - 1}
        className={cn(
          'flex items-center justify-center w-4 h-4 rounded transition-colors',
          currentIndex >= total - 1
            ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700',
        )}
        aria-label="Next branch"
      >
        <ChevronRight size={10} />
      </button>
    </div>
  );
};

BranchNavigatorComponent.displayName = 'BranchNavigator';

export const BranchNavigator = memo(BranchNavigatorComponent);
export default BranchNavigator;
