// packages/unified-chat/src/components/TaskPhaseTimeline.tsx
// Ported from apps/desktop/src/components/UnifiedAgenticChat/TaskPhaseTimeline.tsx
// No Tauri, no desktop stores. Uses local ToolCallCard and TaskPhaseSection.

import { useMemo } from 'react';
import { cn } from '../lib/utils';
import type { ToolLabelEntry } from '@agiworkforce/types';
import { TaskPhaseSection } from './TaskPhaseSection';
import type { TaskPhase } from './TaskPhaseSection';
import { ToolCallCard } from './ToolCallCard';
import type { ToolCallStatus } from './ToolCallCard';

// ─────────────────────────────────────────────────────────────────────────────
// Extended entry type — ToolLabelEntry augmented with optional phase metadata.
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

export interface TaskPhaseTimelineProps {
  entries: ToolLabelEntryWithPhase[];
  isStreaming?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function derivePhaseStatus(tools: ToolLabelEntryWithPhase[]): TaskPhase['status'] {
  if (tools.some((t) => t.status === 'running')) return 'running';
  if (tools.some((t) => t.status === 'error')) return 'failed';
  return 'completed';
}

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

  const hasPhaseMetadata = useMemo(
    () => entries.some((e) => e.phase != null && e.phase !== ''),
    [entries],
  );

  if (!hasPhaseMetadata) {
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

  const phases: TaskPhase[] = [];

  for (const [phaseName, phaseEntries] of grouped) {
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
