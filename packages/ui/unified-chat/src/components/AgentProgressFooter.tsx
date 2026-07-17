/**
 * AgentProgressFooter
 *
 * A persistent 40px bar that appears above the chat input during agent execution.
 * Displays task name, step counter, progress bar, live elapsed timer, and an
 * expand button that opens the ExecutionSidecar.
 *
 * Ported from apps/desktop/src/components/UnifiedAgenticChat/AgentProgressFooter.tsx
 * Store dependency changed: reads from agentLoopStore.activeGoal (no Tauri).
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronUp, Loader2, Timer } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAgentLoopStore, selectActiveGoal } from '../stores/agentLoopStore';

interface AgentProgressFooterProps {
  onExpandSidecar?: () => void;
}

/**
 * Formats elapsed milliseconds into a compact human-readable string.
 * Examples: 5000 → "5s", 130000 → "2m 10s"
 */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function AgentProgressFooter({ onExpandSidecar }: AgentProgressFooterProps) {
  const activeGoal = useAgentLoopStore(selectActiveGoal);

  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeGoal || activeGoal.status === 'completed' || activeGoal.status === 'failed') {
      const intervalId = intervalRef.current;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalRef.current = null;
      }
      return;
    }

    setElapsedMs(Date.now() - activeGoal.startTime);

    const id = setInterval(() => {
      setElapsedMs(Date.now() - activeGoal.startTime);
    }, 1000);

    intervalRef.current = id;

    return () => {
      const intervalId = intervalRef.current;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalRef.current = null;
      }
    };
  }, [activeGoal]);

  if (!activeGoal || activeGoal.status === 'completed' || activeGoal.status === 'failed') {
    return null;
  }

  const { description, completedSteps, totalSteps, progressPercent } = activeGoal;

  const progressWidth =
    progressPercent > 0
      ? progressPercent
      : totalSteps > 0
        ? Math.round((completedSteps / totalSteps) * 100)
        : 0;

  const hasStepInfo = totalSteps > 0;

  return (
    <div
      className={cn(
        'flex h-10 w-full items-center gap-3 border-t border-white/10 px-4',
        'bg-[#0d0e18] shrink-0',
      )}
      role="status"
      aria-live="polite"
      aria-label={`Agent executing: ${description}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-400" aria-hidden="true" />
        <span className="truncate text-xs font-medium text-foreground" title={description}>
          {description}
        </span>
      </div>

      {hasStepInfo && (
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            Step {completedSteps}/{totalSteps}
          </span>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-700 ease-out"
              style={{ width: `${progressWidth}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          <Timer className="h-3 w-3" aria-hidden="true" />
          <span>{formatElapsed(elapsedMs)}</span>
        </div>

        <button
          type="button"
          onClick={onExpandSidecar}
          className={cn(
            'rounded p-1 text-muted-foreground transition-colors',
            'hover:bg-white/10 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500',
          )}
          aria-label="Open execution panel"
          title="Open execution panel"
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
