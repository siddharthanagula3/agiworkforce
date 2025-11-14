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
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { JsonViewer } from './JsonViewer';
import type { ToolCallUI } from '../../types/toolCalling';

interface ToolCallCardProps {
  toolCall: ToolCallUI;
  onCancel?: (toolCallId: string) => void;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  className?: string;
  showParameters?: boolean;
  defaultExpanded?: boolean;
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

  const handleCopy = async () => {
    const text = JSON.stringify(
      {
        tool: toolCall.tool_name,
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

  // Format duration
  const formatDuration = (ms?: number): string => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  // Format timestamp
  const formatTimestamp = (isoString?: string): string => {
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
  };

  const hasParameters = Object.keys(toolCall.parameters).length > 0;
  const canCancel = toolCall.status === 'in_progress' && onCancel;
  const needsApproval = toolCall.status === 'awaiting_approval';

  return (
    <div
      className={cn(
        'border border-border rounded-lg overflow-hidden bg-muted/20',
        toolCall.highlighted && 'ring-2 ring-primary',
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors',
          needsApproval && 'bg-yellow-50 dark:bg-yellow-950/20',
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}

          <div className={cn('flex items-center gap-2', status.color)}>
            {status.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{toolCall.tool_name}</span>
              {toolCall.streaming && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  Streaming
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{toolCall.tool_description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-xs text-muted-foreground">
            <span className={status.color}>{status.label}</span>
            {toolCall.duration_ms && (
              <span className="ml-2">{formatDuration(toolCall.duration_ms)}</span>
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
            {toolCall.duration_ms && (
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <span className="ml-2 font-mono">{formatDuration(toolCall.duration_ms)}</span>
              </div>
            )}
          </div>

          {/* Approval Information */}
          {toolCall.approved !== undefined && (
            <div className="text-xs">
              <span className="text-muted-foreground">Approved:</span>
              <span className={cn('ml-2 font-medium', toolCall.approved ? 'text-green-600' : 'text-red-600')}>
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
