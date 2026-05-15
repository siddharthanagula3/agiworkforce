'use client';

import React, { useState, useMemo, memo, useCallback } from 'react';
import { AlertCircle, Copy, Check, Play, X as XIcon } from 'lucide-react';
import { InlineToolCall, type InlineToolCallStatus } from '@agiworkforce/unified-chat';
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

function toInlineStatus(status: ToolCallStatus): InlineToolCallStatus {
  switch (status) {
    case 'running':
    case 'awaiting_approval':
      return 'running';
    case 'complete':
      return 'success';
    case 'error':
      return 'error';
    case 'cancelled':
      return 'partial';
    case 'pending':
    default:
      return 'pending';
  }
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
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

  const needsApproval = toolCall.status === 'awaiting_approval';
  const canCancel = toolCall.status === 'running' && onCancel;
  const hasParameters = toolCall.parameters && Object.keys(toolCall.parameters).length > 0;
  const inlineStatus = useMemo(() => toInlineStatus(toolCall.status), [toolCall.status]);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const text = JSON.stringify(
        { tool: toolCall.name, parameters: toolCall.parameters ?? {}, status: toolCall.status },
        null,
        2,
      );
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [toolCall.name, toolCall.parameters, toolCall.status],
  );

  // The expanded body composes approval prompt + request + response sections,
  // preserving the web-specific behavior the team-lead asked us to retain.
  const body = (
    <div className="space-y-2 -m-4 p-2">
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
  );

  // Right-edge action chips (cancel + copy). These sit visually inside the bar
  // by absolutely positioning them in a wrapping div, since InlineToolCall owns
  // the bar layout. We render them adjacent so they remain part of the same row.
  return (
    <div
      className={cn(
        'group relative my-0.5',
        needsApproval &&
          'rounded-lg border border-yellow-300/40 dark:border-yellow-700/40 bg-yellow-50/30 dark:bg-yellow-950/10 px-1',
        className,
      )}
    >
      <InlineToolCall
        id={toolCall.id}
        label={toolCall.name}
        status={inlineStatus}
        argSummary={
          toolCall.durationMs != null && toolCall.status === 'complete'
            ? formatDuration(toolCall.durationMs)
            : undefined
        }
        open={expanded}
        onOpenChange={setExpanded}
        body={body}
      />

      {/* Hover-revealed action chips, anchored to the top-right of the bar. */}
      <div
        className={cn(
          'pointer-events-none absolute right-1 top-1 flex items-center gap-1.5',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto',
          // Always show cancel button while running (it's actionable, not decorative)
          canCancel && 'opacity-100 pointer-events-auto',
        )}
      >
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
          onClick={handleCopy}
          className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
};

ToolCallCardComponent.displayName = 'ToolCallCard';

export const ToolCallCard = memo(ToolCallCardComponent);
