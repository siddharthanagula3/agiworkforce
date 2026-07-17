/**
 * BranchNavigator
 *
 * Compact navigation arrows for cycling through conversation branches at fork
 * points. Displays "< 1/3 >" style controls with branch name on hover.
 *
 * Ported from apps/desktop/src/components/UnifiedAgenticChat/BranchNavigator.tsx
 *
 * Breaking changes vs source:
 *  - `BranchSummary` from desktop store types replaced by the local `BranchItem`
 *    interface — no dependency on desktop internal store types.
 *  - `messageId` type changed from `number` to `string` for surface-agnostic use.
 *
 * Store-connected variant: `BranchNavigatorContainer` reads from
 * `useCheckpointStore` and passes data to the pure `BranchNavigator`.
 */

import { memo, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useCheckpointStore,
  selectBranches,
  selectActiveBranchId,
} from '../stores/checkpointStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BranchItem {
  id: string;
  name?: string;
  /** The message ID at which this branch forks from its parent. */
  forkPointMessageId?: string;
}

export interface BranchNavigatorProps {
  /** All branches available for this conversation. */
  branches: BranchItem[];
  /** The currently-active branch id. */
  activeBranchId: string;
  /** Called when the user navigates to a different branch. */
  onSwitch: (branchId: string) => void;
  /** The message ID at which this fork occurs (used to filter relevant branches). */
  messageId: string;
}

// ── Pure component ─────────────────────────────────────────────────────────────

function BranchNavigatorComponent({
  branches,
  activeBranchId,
  onSwitch,
  messageId,
}: BranchNavigatorProps) {
  // Only show branches that fork at this message or the main branch.
  const relevantBranches = useMemo(() => {
    if (branches.length === 0) return [];
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
    <div className="inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1 py-0.5">
      <button
        type="button"
        onClick={handlePrev}
        disabled={currentIndex <= 0}
        aria-label="Previous branch"
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded transition-colors',
          currentIndex <= 0
            ? 'cursor-not-allowed text-muted-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <ChevronLeft size={10} />
      </button>

      <span
        className="min-w-[28px] cursor-default px-0.5 text-center font-mono text-[10px] text-muted-foreground"
        title={activeBranch?.name ?? activeBranchId}
      >
        {displayIndex}/{total}
      </span>

      <button
        type="button"
        onClick={handleNext}
        disabled={currentIndex >= total - 1}
        aria-label="Next branch"
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded transition-colors',
          currentIndex >= total - 1
            ? 'cursor-not-allowed text-muted-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <ChevronRight size={10} />
      </button>
    </div>
  );
}

BranchNavigatorComponent.displayName = 'BranchNavigator';

export const BranchNavigator = memo(BranchNavigatorComponent);
export default BranchNavigator;

// ── Store-connected container ─────────────────────────────────────────────────

export interface BranchNavigatorContainerProps {
  conversationId: string;
  messageId: string;
  /** Called when the user selects a branch. Host must update active branch in store. */
  onSwitch: (branchId: string) => void;
}

/**
 * BranchNavigatorContainer — reads branches from `useCheckpointStore` for
 * `conversationId` and renders `BranchNavigator`. Falls back to null if no
 * active branch is set.
 */
export function BranchNavigatorContainer({
  conversationId,
  messageId,
  onSwitch,
}: BranchNavigatorContainerProps) {
  const branches = useCheckpointStore(selectBranches(conversationId));
  const activeBranchId = useCheckpointStore(selectActiveBranchId(conversationId));

  const branchItems: BranchItem[] = branches.map((b) => ({
    id: b.id,
    name: b.name,
    forkPointMessageId: b.rootMessageId,
  }));

  if (!activeBranchId) return null;

  return (
    <BranchNavigator
      branches={branchItems}
      activeBranchId={activeBranchId}
      onSwitch={onSwitch}
      messageId={messageId}
    />
  );
}
