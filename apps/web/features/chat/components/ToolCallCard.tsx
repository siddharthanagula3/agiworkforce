'use client';

import React, { useState, useMemo, memo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  XCircle,
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
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  result?: string;
  status: ToolCallStatus;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  requiresApproval?: boolean;
  approved?: boolean;
  approvedAt?: string;
  defaultExpanded?: boolean;
}

interface ToolCallCardProps {
  toolCall: ToolCall;
  onCancel?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
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
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status, durationMs }: { status: ToolCallStatus; durationMs?: number }) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </span>
      );
    case 'complete':
      return (
        <span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground bg-muted/60">
          Result
          {durationMs != null && <span className="opacity-60">{formatDuration(durationMs)}</span>}
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
          <XCircle className="h-3 w-3" />
          Error
        </span>
      );
    case 'awaiting_approval':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertCircle className="h-3 w-3" />
          Approval needed
        </span>
      );
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground line-through">
          Cancelled
        </span>
      );
    default:
      return <span className="text-xs text-muted-foreground/60">Pending</span>;
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
  const needsApproval = toolCall.status === 'awaiting_approval';
  const canCancel = toolCall.status === 'running' && onCancel;
  const hasParameters = toolCall.parameters && Object.keys(toolCall.parameters).length > 0;

  const handleCopy = async () => {
    const text = JSON.stringify(
      { tool: toolCall.name, parameters: toolCall.parameters ?? {}, status: toolCall.status },
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
        'group my-0.5',
        needsApproval &&
          'rounded-lg border border-yellow-300/40 dark:border-yellow-700/40 bg-yellow-50/30 dark:bg-yellow-950/10',
        className,
      )}
    >
      {/* ── Header row ── */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${toolCall.name} tool call`}
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer select-none',
          'hover:bg-muted/40 transition-colors duration-100',
          needsApproval && 'px-3',
        )}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
      >
        {/* Chevron */}
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
        )}

        {/* Tool icon */}
        <ToolIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

        {/* Tool name */}
        <span className="flex-1 min-w-0 text-sm text-foreground/80 truncate font-medium">
          {toolCall.name}
        </span>

        {/* Right side: status + action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusPill status={toolCall.status} durationMs={toolCall.durationMs} />

          {canCancel && (
            <button
              type="button"
              aria-label="Cancel"
              onClick={(e) => {
                e.stopPropagation();
                onCancel!(toolCall.id);
              }}
              className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            aria-label={copied ? 'Copied' : 'Copy'}
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {/* Approval prompt */}
          {needsApproval && (onApprove || onReject) && (
            <div className="flex items-center gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
              <AlertCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
              <p className="flex-1 text-xs text-yellow-900 dark:text-yellow-100">
                This tool requires approval before execution.
              </p>
              <div className="flex gap-1.5">
                {onApprove && (
                  <button
                    type="button"
                    onClick={() => onApprove(toolCall.id)}
                    className="flex items-center gap-1 h-6 px-2 text-xs font-medium rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
                  >
                    <Play className="h-2.5 w-2.5" />
                    Approve
                  </button>
                )}
                {onReject && (
                  <button
                    type="button"
                    onClick={() => onReject(toolCall.id)}
                    className="h-6 px-2 text-xs font-medium rounded border border-border bg-background hover:bg-muted transition-colors"
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Parameters / request */}
          {showParameters && hasParameters && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 ml-0.5">
                Request
              </p>
              <pre className="overflow-auto max-h-40 rounded bg-muted/50 p-2.5 text-xs font-mono leading-relaxed scrollbar-thin">
                {JSON.stringify(toolCall.parameters, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {toolCall.result && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 ml-0.5">
                Response
              </p>
              <pre className="overflow-auto max-h-48 rounded bg-muted/50 p-2.5 text-xs font-mono leading-relaxed scrollbar-thin">
                {toolCall.result}
              </pre>
            </div>
          )}

          {showParameters && !hasParameters && !toolCall.result && (
            <p className="text-xs text-muted-foreground/50 italic px-1">No parameters</p>
          )}
        </div>
      )}
    </div>
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
