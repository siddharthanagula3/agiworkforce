// apps/desktop/src/components/UnifiedAgenticChat/TaskPhaseTimeline.tsx
import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import type { ToolLabelEntry } from './ToolLabel';
import { TaskPhaseSection } from './TaskPhaseSection';
import type { TaskPhase } from './TaskPhaseSection';
import { ToolCallCard, type ToolCallStatus } from './ToolCallCard';

// ─────────────────────────────────────────────────────────────────────────────
// Extended entry type — ToolLabelEntry augmented with optional phase metadata.
// These fields are not part of the canonical ToolLabelEntry shape from
// @agiworkforce/types, so we layer them on here for phase-grouping purposes.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolLabelEntryWithPhase extends ToolLabelEntry {
  /** Optional phase name used to group tool calls into TaskPhaseSection blocks. */
  phase?: string;
  /** Unix timestamp (ms) when this tool call started, for phase duration calc. */
  startTime?: number;
  /** Unix timestamp (ms) when this tool call ended, for phase duration calc. */
  endTime?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface TaskPhaseTimelineProps {
  entries: ToolLabelEntryWithPhase[];
  isStreaming?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * Derive the phase status from a collection of tool entries within that phase.
 * - If any tool is running → phase is 'running'
 * - Else if any tool errored → phase is 'failed'
 * - Else → phase is 'completed'
 */
function derivePhaseStatus(tools: ToolLabelEntryWithPhase[]): TaskPhase['status'] {
  if (tools.some((t) => t.status === 'running')) return 'running';
  if (tools.some((t) => t.status === 'error')) return 'failed';
  return 'completed';
}

/**
 * Group a flat list of entries by their `phase` field, preserving insertion
 * order of phase names (first occurrence determines position).
 *
 * Entries without a `phase` field are placed into a synthetic fallback group
 * named `''` (empty string), which is handled separately below.
 */
function groupByPhase(entries: ToolLabelEntryWithPhase[]): Map<string, ToolLabelEntryWithPhase[]> {
  const map = new Map<string, ToolLabelEntryWithPhase[]>();
  for (const entry of entries) {
    const key = entry.phase ?? '';
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskPhaseTimeline
// ─────────────────────────────────────────────────────────────────────────────

export function TaskPhaseTimeline({
  entries,
  isStreaming: _isStreaming,
  className,
}: TaskPhaseTimelineProps) {
  const grouped = useMemo(() => groupByPhase(entries), [entries]);

  // Check whether any entry has a phase name — if not, degrade gracefully to
  // a flat list so existing behaviour is unchanged for unphased tool sets.
  const hasPhaseMetadata = useMemo(
    () => entries.some((e) => e.phase != null && e.phase !== ''),
    [entries],
  );

  if (!hasPhaseMetadata) {
    // Graceful degradation: render entries as a flat list of ToolCallCards
    return (
      <div className={cn('space-y-1.5', className)}>
        {entries.map((entry) => (
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

  // Build TaskPhase objects from grouped entries
  const phases: TaskPhase[] = [];

  for (const [phaseName, phaseEntries] of grouped) {
    // Entries without a phase get rendered as ungrouped ToolCallCards at the end
    if (phaseName === '') continue;

    const startTime = phaseEntries.some((e) => e.startTime != null)
      ? Math.min(...phaseEntries.map((e) => e.startTime ?? Infinity))
      : undefined;

    const endTime = phaseEntries.some((e) => e.endTime != null)
      ? Math.max(...phaseEntries.map((e) => e.endTime ?? -Infinity))
      : undefined;

    phases.push({
      name: phaseName,
      status: derivePhaseStatus(phaseEntries),
      tools: phaseEntries,
      startTime: startTime !== Infinity ? startTime : undefined,
      endTime: endTime !== -Infinity ? endTime : undefined,
    });
  }

  // Ungrouped entries (no phase field) rendered as a flat list at the bottom
  const ungrouped = grouped.get('') ?? [];

  return (
    <div className={cn('space-y-2', className)}>
      {phases.map((phase) => (
        <TaskPhaseSection key={phase.name} phase={phase} />
      ))}

      {ungrouped.map((entry) => (
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
