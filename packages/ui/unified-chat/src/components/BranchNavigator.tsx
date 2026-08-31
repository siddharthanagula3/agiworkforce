import { memo, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useCheckpointStore,
  selectBranches,
  selectActiveBranchId,
} from '../stores/checkpointStore';

export interface BranchItem {
  id: string;
  name?: string;
  forkPointMessageId?: string;
}

export interface BranchNavigatorProps {
  branches: BranchItem[];
  activeBranchId: string;
  onSwitch: (branchId: string) => void;
  messageId: string;
}

function BranchNavigatorComponent({
  branches,
  activeBranchId,
  onSwitch,
  messageId,
}: BranchNavigatorProps) {
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
        className="min-w-[28px] cursor-default px-0.5 text-center font-mono text-[12px] text-muted-foreground"
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

export interface BranchNavigatorContainerProps {
  conversationId: string;
  messageId: string;
  onSwitch: (branchId: string) => void;
}

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
