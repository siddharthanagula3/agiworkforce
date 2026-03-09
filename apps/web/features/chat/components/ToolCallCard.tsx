'use client';

/**
 * ToolCallCard - Web-compatible tool call display
 *
 * Renders individual tool invocations with 4 states:
 * pending | running | complete | error
 *
 * No Tauri or framer-motion dependencies — plain Tailwind + React.
 */

import React, { useState, useMemo, memo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Copy,
  Check,
  Play,
  X as XIcon,
  FileText,
  Terminal,
  Globe,
  Search,
  Database,
  Wrench,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolCallStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'awaiting_approval'
  | 'cancelled';

export interface ToolCall {
  id: string;
  /** Display name of the tool */
  name: string;
  /** Short description of what the tool does */
  description?: string;
  /** Key/value parameters passed to the tool */
  parameters?: Record<string, unknown>;
  /** Current execution status */
  status: ToolCallStatus;
  /** ISO timestamp when the call was created */
  createdAt?: string;
  /** ISO timestamp when execution started */
  startedAt?: string;
  /** ISO timestamp when execution finished */
  completedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Whether the tool requires user approval */
  requiresApproval?: boolean;
  /** Whether the user approved the action */
  approved?: boolean;
  /** ISO timestamp of approval */
  approvedAt?: string;
  /** Whether the card starts expanded */
  defaultExpanded?: boolean;
}

interface ToolCallCardProps {
  toolCall: ToolCall;
  onCancel?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  /** Whether to show the parameters section */
  showParameters?: boolean;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToolIcon(name: string): React.ElementType {
  const lower = name.toLowerCase();
  if (
    lower.includes('read') ||
    lower.includes('write') ||
    lower.includes('edit') ||
    lower.includes('file')
  )
    return FileText;
  if (
    lower.includes('bash') ||
    lower.includes('terminal') ||
    lower.includes('shell') ||
    lower.includes('exec')
  )
    return Terminal;
  if (
    lower.includes('web') ||
    lower.includes('fetch') ||
    lower.includes('browse') ||
    lower.includes('http')
  )
    return Globe;
  if (lower.includes('search')) return Search;
  if (lower.includes('memory') || lower.includes('database') || lower.includes('db'))
    return Database;
  return Wrench;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(2)}m`;
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '–';
  }
}

// ─── Status config ────────────────────────────────────────────────────────────

function getStatusConfig(status: ToolCallStatus) {
  switch (status) {
    case 'pending':
      return {
        icon: <Clock className="h-4 w-4" />,
        colorClass: 'text-muted-foreground',
        label: 'Pending',
      };
    case 'running':
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        colorClass: 'text-blue-600 dark:text-blue-400',
        label: 'Running',
      };
    case 'complete':
      return {
        icon: <CheckCircle2 className="h-4 w-4" />,
        colorClass: 'text-green-600 dark:text-green-400',
        label: 'Complete',
      };
    case 'error':
      return {
        icon: <XCircle className="h-4 w-4" />,
        colorClass: 'text-red-600 dark:text-red-400',
        label: 'Error',
      };
    case 'cancelled':
      return {
        icon: <XCircle className="h-4 w-4" />,
        colorClass: 'text-orange-600 dark:text-orange-400',
        label: 'Cancelled',
      };
    case 'awaiting_approval':
      return {
        icon: <AlertCircle className="h-4 w-4" />,
        colorClass: 'text-yellow-600 dark:text-yellow-400',
        label: 'Awaiting Approval',
      };
    default:
      return {
        icon: <Clock className="h-4 w-4" />,
        colorClass: 'text-muted-foreground',
        label: status,
      };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const ToolCallCardComponent: React.FC<ToolCallCardProps> = ({
  toolCall,
  onCancel,
  onApprove,
  onReject,
  showParameters = true,
  className,
}) => {
  const [expanded, setExpanded] = useState(
    toolCall.defaultExpanded ?? toolCall.status === 'awaiting_approval',
  );
  const [copied, setCopied] = useState(false);

  const ToolIcon = useMemo(() => getToolIcon(toolCall.name), [toolCall.name]);
  const statusConfig = useMemo(() => getStatusConfig(toolCall.status), [toolCall.status]);
  const hasParameters = toolCall.parameters && Object.keys(toolCall.parameters).length > 0;
  const needsApproval = toolCall.status === 'awaiting_approval';
  const canCancel = toolCall.status === 'running' && onCancel;

  const handleCopy = async () => {
    const text = JSON.stringify(
      {
        tool: toolCall.name,
        parameters: toolCall.parameters ?? {},
        status: toolCall.status,
        durationMs: toolCall.durationMs,
      },
      null,
      2,
    );
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'border border-border rounded-lg overflow-hidden bg-muted/20',
        needsApproval && 'ring-2 ring-yellow-400/50 dark:ring-yellow-500/40',
        className,
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${toolCall.name} – ${statusConfig.label}`}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors select-none',
          needsApproval && 'bg-yellow-50 dark:bg-yellow-950/20',
        )}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        {/* Expand chevron */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        {/* Status icon */}
        <span className={statusConfig.colorClass}>{statusConfig.icon}</span>

        {/* Tool icon + name */}
        {}
        <ToolIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{toolCall.name}</span>
            {toolCall.status === 'running' && (
              <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                Running
              </span>
            )}
          </div>
          {toolCall.description && (
            <p className="text-xs text-muted-foreground truncate">{toolCall.description}</p>
          )}
        </div>

        {/* Right: duration + status label + action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('text-xs', statusConfig.colorClass)}>
            {statusConfig.label}
            {toolCall.durationMs != null && (
              <span className="ml-2 text-muted-foreground">
                {formatDuration(toolCall.durationMs)}
              </span>
            )}
          </span>

          {canCancel && (
            <button
              type="button"
              aria-label="Cancel tool execution"
              onClick={(e) => {
                e.stopPropagation();
                onCancel!(toolCall.id);
              }}
              className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            aria-label={copied ? 'Copied' : 'Copy tool call details'}
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ── Expanded Body ───────────────────────────────────────────────── */}
      {expanded && (
        <div className="p-3 space-y-3 border-t border-border bg-background/50">
          {/* Approval prompt */}
          {needsApproval && (onApprove || onReject) && (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded border border-yellow-200 dark:border-yellow-900">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
              <p className="flex-1 text-sm text-yellow-900 dark:text-yellow-100">
                This tool requires your approval before execution.
              </p>
              <div className="flex gap-2">
                {onApprove && (
                  <button
                    type="button"
                    onClick={() => onApprove(toolCall.id)}
                    className="flex items-center gap-1 h-7 px-3 text-xs font-medium rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                  >
                    <Play className="h-3 w-3" />
                    Approve
                  </button>
                )}
                {onReject && (
                  <button
                    type="button"
                    onClick={() => onReject(toolCall.id)}
                    className="flex items-center gap-1 h-7 px-3 text-xs font-medium rounded border border-border bg-background hover:bg-muted transition-colors"
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Timing info */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {toolCall.createdAt && (
              <div>
                <span className="text-muted-foreground">Created:</span>
                <span className="ml-2 font-mono">{formatTimestamp(toolCall.createdAt)}</span>
              </div>
            )}
            {toolCall.startedAt && (
              <div>
                <span className="text-muted-foreground">Started:</span>
                <span className="ml-2 font-mono">{formatTimestamp(toolCall.startedAt)}</span>
              </div>
            )}
            {toolCall.completedAt && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <span className="ml-2 font-mono">{formatTimestamp(toolCall.completedAt)}</span>
              </div>
            )}
            {toolCall.durationMs != null && (
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <span className="ml-2 font-mono">{formatDuration(toolCall.durationMs)}</span>
              </div>
            )}
          </div>

          {/* Approval status */}
          {toolCall.approved !== undefined && (
            <div className="text-xs">
              <span className="text-muted-foreground">Approved:</span>
              <span
                className={cn(
                  'ml-2 font-medium',
                  toolCall.approved ? 'text-green-600' : 'text-red-600',
                )}
              >
                {toolCall.approved ? 'Yes' : 'No'}
              </span>
              {toolCall.approvedAt && (
                <span className="ml-2 text-muted-foreground">
                  at {formatTimestamp(toolCall.approvedAt)}
                </span>
              )}
            </div>
          )}

          {/* Parameters */}
          {showParameters && hasParameters && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Parameters</div>
              <pre className="overflow-auto max-h-48 rounded bg-muted/50 p-3 text-xs font-mono leading-relaxed">
                {JSON.stringify(toolCall.parameters, null, 2)}
              </pre>
            </div>
          )}

          {showParameters && !hasParameters && (
            <p className="text-xs text-muted-foreground italic">No parameters</p>
          )}
        </div>
      )}
    </div>
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
