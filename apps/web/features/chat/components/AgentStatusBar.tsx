'use client';

/**
 * AgentStatusBar
 *
 * Shown below the header when the AI agent is actively working.
 * Displays:
 * - Animated spinner + "Working on: [current action]" + elapsed time
 * - Collapsible action trail (timeline of steps)
 *
 * Framer-motion is used for expand/collapse animation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@shared/lib/utils';
import { ActionTrail, type ActionTrailEntry } from './ActionTrail';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentStatusBarProps {
  /** Whether the agent is currently working */
  isActive: boolean;
  /** Current action description (e.g. "Searching the web...", "Analyzing code...") */
  currentAction?: string;
  /** List of action trail entries for the collapsible timeline */
  actionTrail?: ActionTrailEntry[];
  /** When the current work started (for elapsed time counter) */
  startedAt?: Date;
  className?: string;
}

// ---------------------------------------------------------------------------
// Elapsed time hook
// ---------------------------------------------------------------------------

function useElapsedTime(startedAt: Date | undefined, active: boolean): string {
  const [elapsed, setElapsed] = useState('0s');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || !startedAt) {
      setElapsed('0s');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const update = () => {
      const diffMs = Date.now() - startedAt.getTime();
      const secs = Math.floor(diffMs / 1000);
      if (secs < 60) {
        setElapsed(`${secs}s`);
      } else {
        const mins = Math.floor(secs / 60);
        const remSecs = secs % 60;
        setElapsed(`${mins}m ${remSecs}s`);
      }
    };

    update();
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, startedAt]);

  return elapsed;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AgentStatusBar: React.FC<AgentStatusBarProps> = ({
  isActive,
  currentAction,
  actionTrail = [],
  startedAt,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);
  const elapsed = useElapsedTime(startedAt, isActive);

  if (!isActive) return null;

  const hasTrail = actionTrail.length > 0;
  const completedCount = actionTrail.filter((e) => e.status === 'completed').length;
  const totalCount = actionTrail.length;

  return (
    <div
      className={cn(
        'border-b border-primary/20 bg-primary/5',
        'transition-colors duration-200',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Agent status"
    >
      {/* Main status row */}
      <div className="flex items-center gap-2 px-3 py-2 md:px-4">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-xs font-medium text-foreground">Working on:</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {currentAction || 'Processing...'}
          </span>
        </div>

        {/* Elapsed time */}
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{elapsed}</span>

        {/* Step counter */}
        {hasTrail && (
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {completedCount}/{totalCount}
          </span>
        )}

        {/* Expand/collapse button */}
        {hasTrail && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label={expanded ? 'Collapse action trail' : 'Expand action trail'}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Collapsible action trail */}
      <AnimatePresence initial={false}>
        {expanded && hasTrail && (
          <motion.div
            key="action-trail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t border-primary/10 px-3 py-3 md:px-4">
              <ActionTrail entries={actionTrail} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

AgentStatusBar.displayName = 'AgentStatusBar';
