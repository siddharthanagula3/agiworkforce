'use client';

import React, { memo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import type { ToolCall } from '@/stores/chatStore';

interface ToolCallCardProps {
  toolCall: ToolCall;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
}

export const ToolCallCard = memo(function ToolCallCard({
  toolCall,
  onApprove,
  onReject,
  onCancel,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    pending: {
      icon: Clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      label: 'Pending',
    },
    running: {
      icon: Loader2,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      label: 'Running',
    },
    completed: {
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      label: 'Completed',
    },
    failed: {
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      label: 'Failed',
    },
  };

  const status = statusConfig[toolCall.status];
  const StatusIcon = status.icon;

  const formatDuration = (start?: string, end?: string) => {
    if (!start || !end) return null;
    const duration = new Date(end).getTime() - new Date(start).getTime();
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  return (
    <div className={clsx('rounded-lg border p-3 my-2', status.bgColor, status.borderColor)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className={clsx('w-4 h-4', status.color)} />
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {toolCall.name}
          </span>
          <span
            className={clsx(
              'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
              status.color,
              status.bgColor,
            )}
          >
            <StatusIcon
              className={clsx('w-3 h-3', toolCall.status === 'running' && 'animate-spin')}
            />
            {status.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {formatDuration(toolCall.startedAt, toolCall.completedAt) && (
            <span className="text-xs text-gray-500">
              {formatDuration(toolCall.startedAt, toolCall.completedAt)}
            </span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
      </div>

      {/* Arguments (expanded) */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 mb-2">Arguments:</div>
          <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
            {JSON.stringify(toolCall.arguments, null, 2)}
          </pre>
        </div>
      )}

      {/* Actions for pending/awaiting approval */}
      {toolCall.status === 'pending' && onApprove && onReject && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <button
            onClick={() => onApprove(toolCall.id)}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
          >
            <CheckCircle className="w-3 h-3" />
            Approve
          </button>
          <button
            onClick={() => onReject(toolCall.id)}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
          >
            <XCircle className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}

      {/* Cancel button for running */}
      {toolCall.status === 'running' && onCancel && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => onCancel(toolCall.id)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
          >
            <XCircle className="w-3 h-3" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
});

export default ToolCallCard;
