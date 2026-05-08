// packages/unified-chat/src/components/TaskPhaseSection.tsx
// Ported from apps/desktop/src/components/UnifiedAgenticChat/TaskPhaseSection.tsx
// No Tauri, no desktop stores.

import { useState } from 'react';
import { Loader2, CheckCircle2, XCircle, ChevronRight, ChevronDown, Wrench } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ToolLabelEntry } from '@agiworkforce/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskPhase {
  name: string;
  status: 'running' | 'completed' | 'failed';
  tools: ToolLabelEntry[];
  summary?: string;
  startTime?: number;
  endTime?: number;
}

export interface TaskPhaseSectionProps {
  phase: TaskPhase;
  defaultExpanded?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function borderAccent(status: TaskPhase['status']): string {
  switch (status) {
    case 'running':
      return 'border-l-2 border-teal-500';
    case 'completed':
      return 'border-l-2 border-emerald-500';
    case 'failed':
      return 'border-l-2 border-red-500';
  }
}

function statusIconColor(status: TaskPhase['status']): string {
  switch (status) {
    case 'running':
      return 'text-teal-400';
    case 'completed':
      return 'text-emerald-400';
    case 'failed':
      return 'text-red-400';
  }
}

function StatusIcon({ status }: { status: TaskPhase['status'] }) {
  const colorClass = statusIconColor(status);
  switch (status) {
    case 'running':
      return <Loader2 className={cn('w-3.5 h-3.5 animate-spin shrink-0', colorClass)} />;
    case 'completed':
      return <CheckCircle2 className={cn('w-3.5 h-3.5 shrink-0', colorClass)} />;
    case 'failed':
      return <XCircle className={cn('w-3.5 h-3.5 shrink-0', colorClass)} />;
  }
}

function toolStatusDot(status: ToolLabelEntry['status']): string {
  switch (status) {
    case 'running':
      return 'bg-amber-400';
    case 'completed':
      return 'bg-emerald-400';
    case 'error':
      return 'bg-red-400';
    default:
      return 'bg-muted-foreground';
  }
}

function ToolPill({ entry }: { entry: ToolLabelEntry }) {
  const dotColor = toolStatusDot(entry.status);
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px]',
        'bg-muted/40 border border-border/30 text-muted-foreground font-mono',
        'max-w-[240px]',
      )}
    >
      <Wrench className="w-2.5 h-2.5 shrink-0" />
      <span className="truncate">{entry.displayName}</span>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskPhaseSection
// ─────────────────────────────────────────────────────────────────────────────

export function TaskPhaseSection({ phase, defaultExpanded }: TaskPhaseSectionProps) {
  const initialExpanded = defaultExpanded ?? phase.status === 'running';
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const duration =
    phase.startTime != null && phase.endTime != null ? phase.endTime - phase.startTime : undefined;

  const toolCount = phase.tools.length;

  return (
    <div className={cn('rounded-lg overflow-hidden bg-muted/10', borderAccent(phase.status))}>
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1.5 text-xs',
          'hover:bg-muted/20 transition-colors text-left',
        )}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground/70 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground/70 shrink-0" />
        )}

        <StatusIcon status={phase.status} />

        <span className="font-semibold text-foreground/90 truncate flex-1 min-w-0">
          {phase.name}
        </span>

        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground shrink-0">
          {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
        </span>

        {duration != null && duration > 0 && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
            {formatDuration(duration)}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-2 pt-1 border-t border-border/20 space-y-2">
          {toolCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {phase.tools.map((entry) => (
                <ToolPill key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {phase.summary && (
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{phase.summary}</p>
          )}
        </div>
      )}
    </div>
  );
}
