// apps/desktop/src/features/chat/ToolTimeline.tsx
import type { ElementType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Box,
  CheckCircle2,
  ChevronDown,
  Code2,
  Database,
  Edit3,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  Image,
  ListTodo,
  Loader2,
  MousePointerClick,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react';
import { type ToolLabelEntry } from './ToolLabel';
import { TaskPhaseTimeline, type ToolLabelEntryWithPhase } from './TaskPhaseTimeline';
import { cn } from '../../lib/utils';

interface ToolTimelineProps {
  entries: ToolLabelEntry[];
  className?: string;
  /**
   * When `true` and entries carry `phase` metadata, delegates rendering to
   * `<TaskPhaseTimeline>` which groups tool calls into named phase sections
   * (Manus-style multi-phase task UI). Defaults to `false` — existing
   * behaviour is fully preserved when this flag is absent or `false`.
   */
  enablePhaseGrouping?: boolean;
}

/** A rendered group: either a single standalone entry or a set of parallel entries. */
interface EntryGroup {
  /** Non-undefined means all entries share this parallel group key. */
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

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  if (count === 1) return `a ${singular}`;
  return `${count} ${plural}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function buildCompletedSummary(entries: ToolLabelEntry[]): string {
  const counts = {
    command: 0,
    read: 0,
    write: 0,
    search: 0,
    browse: 0,
    other: 0,
  };

  for (const entry of entries) {
    const name = normalizeName(entry.displayName);
    if (name.includes('bash') || name.includes('command') || name.includes('run code')) {
      counts.command++;
    } else if (name.includes('read') || name.includes('list')) {
      counts.read++;
    } else if (name.includes('write') || name.includes('edit') || name.includes('save')) {
      counts.write++;
    } else if (name.includes('search') || name.includes('grep') || name.includes('glob')) {
      counts.search++;
    } else if (name.includes('web') || name.includes('browser') || name.includes('click')) {
      counts.browse++;
    } else {
      counts.other++;
    }
  }

  const clauses: string[] = [];
  if (counts.command > 0) clauses.push(`ran ${pluralize(counts.command, 'command')}`);
  if (counts.write > 0)
    clauses.push(`${counts.write === 1 ? 'changed a file' : `changed ${counts.write} files`}`);
  if (counts.read > 0)
    clauses.push(`${counts.read === 1 ? 'read a file' : `read ${counts.read} files`}`);
  if (counts.search > 0) clauses.push(`searched ${pluralize(counts.search, 'source')}`);
  if (counts.browse > 0) clauses.push(`used ${pluralize(counts.browse, 'browser action')}`);

  if (clauses.length === 0) {
    clauses.push(`used ${entries.length} tool${entries.length === 1 ? '' : 's'}`);
  } else if (counts.other > 0) {
    clauses.push(`used ${counts.other} other tool${counts.other === 1 ? '' : 's'}`);
  }

  const summary = clauses.slice(0, 3).join(', ');
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

function getToolIcon(displayName: string): ElementType {
  const name = normalizeName(displayName);
  if (name.includes('bash') || name.includes('command') || name.includes('terminal')) {
    return Terminal;
  }
  if (name.includes('read') || name.includes('file')) {
    return FileText;
  }
  if (name.includes('list') || name.includes('ls') || name.includes('folder')) {
    return FolderOpen;
  }
  if (
    name.includes('edit') ||
    name.includes('write') ||
    name.includes('patch') ||
    name.includes('type')
  ) {
    return Edit3;
  }
  if (name.includes('search') || name.includes('grep') || name.includes('glob')) {
    return Search;
  }
  if (
    name.includes('web') ||
    name.includes('browser') ||
    name.includes('fetch') ||
    name.includes('scroll')
  ) {
    return Globe;
  }
  if (name.includes('click')) {
    return MousePointerClick;
  }
  if (name.includes('database') || name.includes('table') || name.includes('query')) {
    return Database;
  }
  if (name.includes('image') || name.includes('screenshot') || name.includes('video')) {
    return Image;
  }
  if (name.includes('todo')) {
    return ListTodo;
  }
  if (name.includes('code')) {
    return Code2;
  }
  if (name.includes('mcp')) {
    return Box;
  }
  return Wrench;
}

function statusPill(entry: ToolLabelEntry): string {
  if (entry.status === 'running') return 'Running';
  if (entry.status === 'error') return 'Error';
  return 'Result';
}

function ToolTimelineRow({ entry, isLast }: { entry: ToolLabelEntry; isLast: boolean }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const Icon = getToolIcon(entry.displayName);
  const isRunning = entry.status === 'running';
  const isError = entry.status === 'error';
  const detail = isError ? entry.error : entry.resultPreview;
  const hasDetail = Boolean(detail);

  return (
    <div className="relative flex gap-3">
      {!isLast && <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border/70" />}
      <div
        className={cn(
          'relative z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border bg-background',
          isError
            ? 'border-red-500/50 text-red-400'
            : isRunning
              ? 'border-amber-500/50 text-amber-400'
              : 'border-border text-muted-foreground',
        )}
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isError ? (
          <AlertCircle className="h-3 w-3" />
        ) : (
          <Icon className="h-3 w-3" />
        )}
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-xs', isError ? 'text-red-300' : 'text-foreground/85')}>
            {entry.displayName}
          </span>
          {entry.displayArgs && (
            <span className="truncate text-xs text-muted-foreground">{entry.displayArgs}</span>
          )}
          <button
            type="button"
            disabled={!hasDetail}
            onClick={() => hasDetail && setDetailsOpen((value) => !value)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              isError
                ? 'bg-red-500/15 text-red-300'
                : isRunning
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-muted text-muted-foreground',
              hasDetail && 'hover:bg-muted/80',
              !hasDetail && 'cursor-default',
            )}
          >
            {statusPill(entry)}
            {hasDetail && (
              <motion.span
                animate={{ rotate: detailsOpen ? 180 : 0 }}
                transition={{ duration: 0.15 }}
                className="inline-flex"
              >
                <ChevronDown className="h-2.5 w-2.5" />
              </motion.span>
            )}
          </button>
          {entry.durationMs !== undefined && entry.durationMs > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {formatDuration(entry.durationMs)}
            </span>
          )}
        </div>

        <AnimatePresence initial={false}>
          {hasDetail && detailsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <pre
                className={cn(
                  'mt-1.5 max-h-64 overflow-y-auto rounded-md border px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words',
                  isError
                    ? 'border-red-500/20 bg-red-950/30 text-red-200'
                    : 'border-border/60 bg-background/50 text-foreground/80',
                )}
              >
                {detail}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ToolTimeline({
  entries,
  className,
  enablePhaseGrouping = false,
}: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [userForcedClosed, setUserForcedClosed] = useState(false);
  const hasRunning = entries.some((e) => e.status === 'running');

  // Reset userForcedClosed when all tools finish so next batch auto-expands
  const prevHasRunning = useRef(hasRunning);
  useEffect(() => {
    const wasRunning = prevHasRunning.current;
    // Update the ref first so it always reflects the latest value,
    // preventing stale reads if hasRunning changes rapidly between renders.
    prevHasRunning.current = hasRunning;
    if (wasRunning && !hasRunning) {
      setUserForcedClosed(false);
    }
  }, [hasRunning]);

  // Auto-expand while tools are running, but respect user's manual close
  const isOpen = userForcedClosed ? false : hasRunning || isExpanded;
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

  // When phase grouping is opted in, check whether any entry carries phase
  // metadata. If so, delegate entirely to TaskPhaseTimeline.
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
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            // User is collapsing — if tools are running, force closed
            setUserForcedClosed(true);
            setIsExpanded(false);
          } else {
            // User is expanding — clear forced close
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
        {hasRunning ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3 h-3" />
        )}
        <span>
          {hasRunning ? (
            <span className="text-violet-400">{formatRunningSummary(entries)}</span>
          ) : (
            <>
              {buildCompletedSummary(entries)}
              {errorCount > 0 && <span className="text-red-400 ml-1">({errorCount} failed)</span>}
              {totalDuration > 0 && (
                <span className="text-muted-foreground/60 ml-1">
                  ({formatDuration(totalDuration)})
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
            <div className="border-t border-border/20 px-3 pb-1 pt-2">
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
                      {group.entries.map((entry, index) => (
                        <ToolTimelineRow
                          key={entry.id}
                          entry={entry}
                          isLast={index === group.entries.length - 1}
                        />
                      ))}
                    </div>
                  );
                }

                // Single standalone entry (parallelGroup absent, or only one entry in group).
                return group.entries.map((entry, index) => (
                  <ToolTimelineRow
                    key={entry.id}
                    entry={entry}
                    isLast={
                      groupedEntries.indexOf(group) === groupedEntries.length - 1 &&
                      index === group.entries.length - 1
                    }
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
