/**
 * ToolCallCard Component
 *
 * Display an individual tool invocation with parameters, status, and timing.
 * Shows what tool is being called, with what parameters, and execution status.
 */

import { useState } from 'react';
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
  Box,
  FolderOpen,
  Globe,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '@/lib/utils';
import { JsonViewer } from './JsonViewer';
import type { ToolCallUI } from '@/types/toolCalling';

interface ToolCallCardProps {
  toolCall: ToolCallUI;
  onCancel?: (toolCallId: string) => void;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  className?: string;
  showParameters?: boolean;
  defaultExpanded?: boolean;
}

function formatDuration(ms?: number): string | null {
  if (!ms) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

function formatTimestamp(isoString?: string): string {
  if (!isoString) return '-';
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
}

function stringifyValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() ? value : null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getSourceBadge(
  toolCall: ToolCallUI,
): { label: string; Icon: React.ElementType; tone: string } | null {
  const rawId = (toolCall.tool_id || toolCall.id || '').toLowerCase();
  const rawName = (toolCall.tool_name || toolCall.name || '').toLowerCase();
  const fingerprint = `${rawId} ${rawName}`;

  if (fingerprint.includes('mcp__filesystem__')) {
    return {
      label: 'Filesystem',
      Icon: FolderOpen,
      tone: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    };
  }
  if (fingerprint.includes('mcp__')) {
    return {
      label: 'MCP',
      Icon: Box,
      tone: 'bg-primary/10 text-primary border-primary/20',
    };
  }
  if (
    fingerprint.includes('browser') ||
    fingerprint.includes('ui_click') ||
    fingerprint.includes('ui_type') ||
    fingerprint.includes('playwright')
  ) {
    return {
      label: 'Browser',
      Icon: Globe,
      tone: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
    };
  }
  if (fingerprint.includes('search') || fingerprint.includes('web_')) {
    return {
      label: 'Search',
      Icon: Search,
      tone: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    };
  }
  if (
    fingerprint.includes('terminal') ||
    fingerprint.includes('shell') ||
    fingerprint.includes('bash') ||
    fingerprint.includes('command')
  ) {
    return {
      label: 'Terminal',
      Icon: Terminal,
      tone: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
    };
  }

  return null;
}

function ArgsBlock({ args }: { args: Record<string, unknown> }) {
  if (Object.keys(args).length === 0) return null;
  const json = stringifyValue(args);
  if (!json) return null;
  const lines = json.split('\n');
  const preview = lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n…' : '');

  return (
    <pre className="mt-2 rounded-md bg-background/50 px-2 py-1.5 font-mono text-[10px] leading-snug text-muted-foreground">
      {preview}
    </pre>
  );
}

function CollapsibleSection({
  label,
  content,
  tone = 'text-foreground/80',
  defaultOpen = false,
}: {
  label: string;
  content: string;
  tone?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre
          className={cn(
            'max-h-48 overflow-auto rounded-md bg-background/60 px-2 py-1.5 font-mono text-[10px] leading-snug whitespace-pre-wrap',
            tone,
          )}
        >
          {content}
        </pre>
      )}
    </div>
  );
}

export function ToolCallCard({
  toolCall,
  onCancel,
  onApprove,
  onReject,
  className,
  showParameters = true,
  defaultExpanded = false,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || toolCall.expanded || false);
  const [copied, setCopied] = useState(false);
  const toolName = toolCall.tool_name || toolCall.name || 'Unknown Tool';
  const durationLabel = formatDuration(toolCall.duration_ms ?? toolCall.duration);
  const sourceBadge = getSourceBadge(toolCall);
  const resultText = stringifyValue(toolCall.result);
  const errorText = stringifyValue(toolCall.error);

  const handleCopy = async () => {
    const text = JSON.stringify(
      {
        tool: toolName,
        parameters: toolCall.parameters,
        status: toolCall.status,
        duration_ms: toolCall.duration_ms,
      },
      null,
      2,
    );
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get status icon and color
  const getStatusDisplay = () => {
    switch (toolCall.status) {
      case 'pending':
        return {
          icon: <Clock className="h-4 w-4" />,
          color: 'text-muted-foreground',
          label: 'Pending',
        };
      case 'in_progress':
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          color: 'text-blue-600 dark:text-blue-400',
          label: 'Running',
        };
      case 'completed':
        return {
          icon: <CheckCircle2 className="h-4 w-4" />,
          color: 'text-green-600 dark:text-green-400',
          label: 'Completed',
        };
      case 'failed':
        return {
          icon: <XCircle className="h-4 w-4" />,
          color: 'text-red-600 dark:text-red-400',
          label: 'Failed',
        };
      case 'cancelled':
        return {
          icon: <XCircle className="h-4 w-4" />,
          color: 'text-orange-600 dark:text-orange-400',
          label: 'Cancelled',
        };
      case 'awaiting_approval':
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          color: 'text-yellow-600 dark:text-yellow-400',
          label: 'Awaiting Approval',
        };
      default:
        return {
          icon: <Clock className="h-4 w-4" />,
          color: 'text-muted-foreground',
          label: toolCall.status,
        };
    }
  };

  const status = getStatusDisplay();
  const hasParameters = Object.keys(toolCall.parameters).length > 0;
  const canCancel = toolCall.status === 'in_progress' && onCancel;
  const needsApproval = toolCall.status === 'awaiting_approval';

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden bg-muted/20',
        toolCall.status === 'completed' && 'border-emerald-500/30',
        toolCall.status === 'failed' && 'border-red-500/30',
        toolCall.status === 'cancelled' && 'border-orange-500/30',
        (toolCall.status === 'in_progress' || toolCall.status === 'awaiting_approval') &&
          'border-amber-500/30',
        toolCall.status === 'pending' && 'border-border',
        toolCall.highlighted && 'ring-2 ring-primary',
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'cursor-pointer bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted/60',
          needsApproval && 'bg-yellow-50 dark:bg-yellow-950/20',
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className={cn('flex items-center gap-2', status.color)}>{status.icon}</div>
            <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-mono text-xs font-medium text-foreground">
                {toolName}
              </span>
              {sourceBadge && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    sourceBadge.tone,
                  )}
                >
                  <sourceBadge.Icon className="h-3 w-3" />
                  {sourceBadge.label}
                </span>
              )}
              {toolCall.streaming && (
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  Streaming
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {toolCall.tool_description || 'Executing tool'}
            </p>
            {showParameters && hasParameters && <ArgsBlock args={toolCall.parameters} />}
          </div>

          <div className="flex shrink-0 items-start gap-2 pl-2">
            <div className="text-right text-[10px]">
              <div className={cn('font-medium', status.color)}>{status.label}</div>
              {durationLabel && (
                <div className="font-mono text-muted-foreground">{durationLabel}</div>
              )}
            </div>

            {canCancel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel(toolCall.id);
                }}
                className="h-7 px-2"
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="h-7 px-2"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-3 space-y-3 border-t border-border bg-background/50">
          {/* Approval Actions */}
          {needsApproval && (onApprove || onReject) && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded border border-yellow-200 dark:border-yellow-900">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
              <div className="flex-1 text-sm text-yellow-900 dark:text-yellow-100">
                This tool requires your approval before execution.
              </div>
              <div className="flex gap-2">
                {onApprove && (
                  <Button
                    size="sm"
                    onClick={() => onApprove(toolCall.id)}
                    className="h-7 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                )}
                {onReject && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReject(toolCall.id)}
                    className="h-7"
                  >
                    Reject
                  </Button>
                )}
              </div>
            </div>
          )}

          {toolCall.status === 'completed' && resultText && (
            <CollapsibleSection label="Result" content={resultText} />
          )}

          {(toolCall.status === 'failed' || toolCall.status === 'cancelled') && errorText && (
            <CollapsibleSection label="Error detail" content={errorText} tone="text-red-300" />
          )}

          {/* Timing Information */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-2 font-mono">{formatTimestamp(toolCall.created_at)}</span>
            </div>
            {toolCall.started_at && (
              <div>
                <span className="text-muted-foreground">Started:</span>
                <span className="ml-2 font-mono">{formatTimestamp(toolCall.started_at)}</span>
              </div>
            )}
            {toolCall.completed_at && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <span className="ml-2 font-mono">{formatTimestamp(toolCall.completed_at)}</span>
              </div>
            )}
            {durationLabel && (
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <span className="ml-2 font-mono">{durationLabel}</span>
              </div>
            )}
          </div>

          {/* Approval Information */}
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
              {toolCall.approved_at && (
                <span className="ml-2 text-muted-foreground">
                  at {formatTimestamp(toolCall.approved_at)}
                </span>
              )}
            </div>
          )}

          {/* Parameters */}
          {showParameters && hasParameters && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Parameters</div>
              <JsonViewer
                data={toolCall.parameters}
                maxHeight="200px"
                defaultExpanded={false}
                searchable={false}
              />
            </div>
          )}

          {!hasParameters && showParameters && (
            <div className="text-xs text-muted-foreground italic">No parameters</div>
          )}
        </div>
      )}
    </div>
  );
}
