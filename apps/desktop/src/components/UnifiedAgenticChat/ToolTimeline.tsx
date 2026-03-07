// apps/desktop/src/components/UnifiedAgenticChat/ToolTimeline.tsx
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, GitBranch, Wrench } from 'lucide-react';
import { type ToolLabelEntry } from './ToolLabel';
import { ToolCallCard, type ToolCallStatus } from './ToolCallCard';
import { cn } from '../../lib/utils';

/** Map ToolLabelEntry status to ToolCallCard status */
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

/** Build a minimal args record from a displayArgs string, if present. */
function argsFromDisplayArgs(displayArgs: string): Record<string, unknown> | undefined {
  if (!displayArgs) return undefined;
  return { input: displayArgs };
}

interface ToolTimelineProps {
  entries: ToolLabelEntry[];
  className?: string;
}

/** A rendered group: either a single standalone entry or a set of parallel entries. */
interface EntryGroup {
  /** Non-undefined means all entries share this parallel group key. */
  parallelGroup?: string;
  entries: ToolLabelEntry[];
}

export function ToolTimeline({ entries, className }: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasRunning = entries.some((e) => e.status === 'running');

  // Auto-expand while tools are running, but preserve user's manual expansion
  const isOpen = hasRunning || isExpanded;
  const errorCount = entries.filter((e) => e.status === 'error').length;

  // Group consecutive entries that share the same parallelGroup value.
  // Entries without a parallelGroup are always their own single-item group.
  const groupedEntries = useMemo<EntryGroup[]>(() => {
    const groups: EntryGroup[] = [];
    let currentGroup: EntryGroup | null = null;

    for (const entry of entries) {
      if (entry.parallelGroup && currentGroup?.parallelGroup === entry.parallelGroup) {
        // Continue the current parallel group.
        currentGroup.entries.push(entry);
      } else {
        // Start a new group (parallel or standalone).
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

  return (
    <div className={cn('border border-border/30 rounded-lg overflow-hidden', className)}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
        <Wrench className="w-3 h-3" />
        <span>
          {hasRunning ? (
            <span className="text-violet-400">Running tools...</span>
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

      {/* Expandable tool list */}
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
                      {/* Parallel chip */}
                      <div className="flex items-center gap-1 mb-0.5">
                        <GitBranch className="w-2.5 h-2.5 text-blue-400/70 shrink-0" />
                        <span className="text-[10px] text-blue-400/70 font-mono">parallel</span>
                      </div>
                      {group.entries.map((entry) => (
                        <ToolCallCard
                          key={entry.id}
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

                // Single standalone entry (parallelGroup absent, or only one entry in group).
                return group.entries.map((entry) => (
                  <ToolCallCard
                    key={entry.id}
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
