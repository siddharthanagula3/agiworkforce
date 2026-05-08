// packages/unified-chat/src/components/ToolTimeline.tsx
// Ported from apps/desktop/src/components/UnifiedAgenticChat/ToolTimeline.tsx
// No Tauri, no desktop stores. Uses local ToolCallCard and TaskPhaseTimeline.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, GitBranch, Wrench } from 'lucide-react';
import type { ToolLabelEntry } from '@agiworkforce/types';
import { ToolCallCard } from './ToolCallCard';
import type { ToolCallStatus } from './ToolCallCard';
import { TaskPhaseTimeline } from './TaskPhaseTimeline';
import type { ToolLabelEntryWithPhase } from './TaskPhaseTimeline';
import { cn } from '../lib/utils';

function toToolCallStatus(status: ToolLabelEntry['status']): ToolCallStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
      return 'complete';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

function argsFromDisplayArgs(displayArgs: string): Record<string, unknown> | undefined {
  if (!displayArgs) return undefined;
  return { input: displayArgs };
}

export interface ToolTimelineProps {
  entries: ToolLabelEntry[];
  className?: string;
  /**
   * When `true` and entries carry `phase` metadata, delegates rendering to
   * `<TaskPhaseTimeline>`. Defaults to `false`.
   */
  enablePhaseGrouping?: boolean;
}

/** A rendered group: either a single standalone entry or a set of parallel entries. */
interface EntryGroup {
  parallelGroup?: string;
  entries: ToolLabelEntry[];
}

function formatRunningSummary(entries: ToolLabelEntry[]): string {
  const runningEntries = entries.filter((entry) => entry.status === 'running');
  const latestRunning = runningEntries[runningEntries.length - 1];
  const toolWord = entries.length === 1 ? 'tool' : 'tools';

  if (!latestRunning) {
    return `Running ${entries.length} ${toolWord}`;
  }

  return `Running ${runningEntries.length}/${entries.length} ${toolWord}: ${latestRunning.displayName}`;
}

export function ToolTimeline({
  entries,
  className,
  enablePhaseGrouping = false,
}: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [userForcedClosed, setUserForcedClosed] = useState(false);
  const hasRunning = entries.some((e) => e.status === 'running');

  const prevHasRunning = useRef(hasRunning);
  useEffect(() => {
    const wasRunning = prevHasRunning.current;
    prevHasRunning.current = hasRunning;
    if (wasRunning && !hasRunning) {
      setUserForcedClosed(false);
    }
  }, [hasRunning]);

  const isOpen = userForcedClosed ? false : hasRunning || isExpanded;
  const errorCount = entries.filter((e) => e.status === 'error').length;

  const groupedEntries = useMemo<EntryGroup[]>(() => {
    const groups: EntryGroup[] = [];
    let currentGroup: EntryGroup | null = null;

    for (const entry of entries) {
      if (entry.parallelGroup && currentGroup?.parallelGroup === entry.parallelGroup) {
        currentGroup.entries.push(entry);
      } else {
        currentGroup = {
          parallelGroup: entry.parallelGroup,
          entries: [entry],
        };
        groups.push(currentGroup);
      }
    }

    return groups;
  }, [entries]);

  const totalDuration = useMemo(
    () =>
      groupedEntries.reduce((sum, group) => {
        const groupDuration =
          group.parallelGroup !== undefined && group.entries.length > 1
            ? Math.max(...group.entries.map((entry) => entry.durationMs ?? 0))
            : group.entries.reduce((groupSum, entry) => groupSum + (entry.durationMs ?? 0), 0);

        return sum + groupDuration;
      }, 0),
    [groupedEntries],
  );

  if (entries.length === 0) return null;

  if (enablePhaseGrouping) {
    const entriesWithPhase = entries as ToolLabelEntryWithPhase[];
    const hasPhaseData = entriesWithPhase.some((e) => e.phase != null && e.phase !== '');
    if (hasPhaseData) {
      return (
        <TaskPhaseTimeline
          entries={entriesWithPhase}
          isStreaming={hasRunning}
          className={className}
        />
      );
    }
  }

  return (
    <div className={cn('border border-border/30 rounded-lg overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            setUserForcedClosed(true);
            setIsExpanded(false);
          } else {
            setUserForcedClosed(false);
            setIsExpanded(true);
          }
        }}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
        <Wrench className="w-3 h-3" />
        <span>
          {hasRunning ? (
            <span className="text-violet-400">{formatRunningSummary(entries)}</span>
          ) : (
            <>
              Used {entries.length} tool{entries.length !== 1 ? 's' : ''}
              {errorCount > 0 && <span className="text-red-400 ml-1">({errorCount} failed)</span>}
              {totalDuration > 0 && (
                <span className="text-muted-foreground/60 ml-1">
                  (
                  {totalDuration < 1000
                    ? `${totalDuration}ms`
                    : `${(totalDuration / 1000).toFixed(1)}s`}
                  )
                </span>
              )}
            </>
          )}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1.5 border-t border-border/20 pt-2">
              {groupedEntries.map((group) => {
                const isParallelGroup =
                  group.parallelGroup !== undefined && group.entries.length > 1;

                if (isParallelGroup) {
                  return (
                    <div
                      key={group.parallelGroup}
                      className="border-l-2 border-blue-500/30 pl-2 py-0.5 space-y-1.5"
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <GitBranch className="w-2.5 h-2.5 text-blue-400/70 shrink-0" />
                        <span className="text-[10px] text-blue-400/70 font-mono">parallel</span>
                      </div>
                      {group.entries.map((entry) => (
                        <ToolCallCard
                          key={entry.id}
                          toolCallId={entry.id}
                          toolName={entry.displayName}
                          args={argsFromDisplayArgs(entry.displayArgs)}
                          error={entry.error}
                          status={toToolCallStatus(entry.status)}
                          elapsedMs={entry.durationMs}
                        />
                      ))}
                    </div>
                  );
                }

                return group.entries.map((entry) => (
                  <ToolCallCard
                    key={entry.id}
                    toolCallId={entry.id}
                    toolName={entry.displayName}
                    args={argsFromDisplayArgs(entry.displayArgs)}
                    error={entry.error}
                    status={toToolCallStatus(entry.status)}
                    elapsedMs={entry.durationMs}
                  />
                ));
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
