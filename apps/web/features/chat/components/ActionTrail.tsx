'use client';

/**
 * ActionTrail
 *
 * Vertical timeline showing agent action steps with colored dots, icons,
 * timestamps, durations, and collapsible tool call details.
 *
 * Inspired by the desktop CurrentActionBadge / AgenticLoopStatusBar.
 */

import React, { useState } from 'react';
import {
  Brain,
  Search,
  Code,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Wrench,
  Terminal,
  FileEdit,
  Globe,
  FileText,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionStatus = 'pending' | 'running' | 'completed' | 'error';

export type ActionType =
  | 'thinking'
  | 'searching'
  | 'coding'
  | 'running'
  | 'completed'
  | 'error'
  | 'tool_call'
  | 'unknown';

export interface ActionTrailEntry {
  id: string;
  type: ActionType;
  status: ActionStatus;
  description: string;
  timestamp: Date;
  /** Duration in milliseconds (if completed) */
  durationMs?: number;
  /** Optional tool call details (JSON string or object) */
  toolCallDetails?: string;
  /** Icon override via display name (e.g. "Read", "Bash", "WebSearch") */
  displayName?: string;
}

export interface ActionTrailProps {
  entries: ActionTrailEntry[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Icon + color mappings
// ---------------------------------------------------------------------------

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  Read: FileText,
  Write: FileText,
  Edit: FileEdit,
  Search: Search,
  Bash: Terminal,
  WebSearch: Globe,
  WebFetch: Globe,
  Tool: Wrench,
};

const TYPE_ICON_MAP: Record<ActionType, LucideIcon> = {
  thinking: Brain,
  searching: Search,
  coding: Code,
  running: Play,
  completed: CheckCircle,
  error: XCircle,
  tool_call: Wrench,
  unknown: Play,
};

function getIcon(entry: ActionTrailEntry): LucideIcon {
  if (entry.displayName && TOOL_ICON_MAP[entry.displayName]) {
    return TOOL_ICON_MAP[entry.displayName]!;
  }
  return TYPE_ICON_MAP[entry.type] ?? Play;
}

/** Dot color for the vertical timeline */
function getDotColor(status: ActionStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'running':
      return 'bg-blue-500';
    case 'error':
      return 'bg-rose-500';
    case 'pending':
    default:
      return 'bg-zinc-400 dark:bg-zinc-600';
  }
}

/** Text/icon color by status */
function getStatusColor(status: ActionStatus): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-500';
    case 'running':
      return 'text-blue-500';
    case 'error':
      return 'text-rose-500';
    case 'pending':
    default:
      return 'text-muted-foreground';
  }
}

/** Status suffix icon */
function getStatusIcon(status: ActionStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-3 w-3 text-emerald-500" />;
    case 'running':
      return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
    case 'error':
      return <XCircle className="h-3 w-3 text-rose-500" />;
    default:
      return <Clock className="h-3 w-3 text-muted-foreground" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.round(secs % 60);
  return `${mins}m ${remSecs}s`;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// Individual entry
// ---------------------------------------------------------------------------

interface ActionTrailItemProps {
  entry: ActionTrailEntry;
  isLast: boolean;
}

const ActionTrailItem: React.FC<ActionTrailItemProps> = ({ entry, isLast }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = getIcon(entry);
  const hasDetails = Boolean(entry.toolCallDetails);

  return (
    <div className="relative flex gap-3">
      {/* Timeline connector line */}
      {!isLast && <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border/60" />}

      {/* Dot */}
      <div
        className={cn(
          'relative z-10 mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-background',
          getDotColor(entry.status),
        )}
      />

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        {/* Main row: timestamp + icon + description + duration + status */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatTimestamp(entry.timestamp)}
          </span>
          <Icon className={cn('h-3.5 w-3.5 shrink-0', getStatusColor(entry.status))} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {entry.description}
          </span>
          {entry.durationMs !== undefined && (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(entry.durationMs)}
            </span>
          )}
          {getStatusIcon(entry.status)}
        </div>

        {/* Collapsible tool call details */}
        {hasDetails && (
          <div className="mt-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {expanded ? 'Hide details' : 'Show details'}
            </button>
            {expanded && (
              <pre className="mt-1 max-h-[200px] overflow-auto rounded-md bg-muted/50 p-2 text-[10px] leading-relaxed text-muted-foreground">
                {entry.toolCallDetails}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ActionTrail component
// ---------------------------------------------------------------------------

export const ActionTrail: React.FC<ActionTrailProps> = ({ entries, className }) => {
  if (entries.length === 0) return null;

  return (
    <div className={cn('relative', className)}>
      {entries.map((entry, index) => (
        <ActionTrailItem key={entry.id} entry={entry} isLast={index === entries.length - 1} />
      ))}
    </div>
  );
};

ActionTrail.displayName = 'ActionTrail';
