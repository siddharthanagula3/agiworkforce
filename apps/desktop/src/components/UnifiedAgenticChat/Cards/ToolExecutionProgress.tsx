/**
 * ToolExecutionProgress Component
 *
 * Displays real-time progress for streaming tool executions.
 * Features:
 * - Progress bar for percentage-based progress
 * - Streaming text output display
 * - Expandable/collapsible output
 * - Cancel button for long-running tools
 * - Error and retry handling
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCw,
  Square,
  Terminal,
  FileText,
  Globe,
  Database,
  Code,
  Wrench,
} from 'lucide-react';
import type { ToolStreamStateEntry } from '../../../stores/unifiedChatStore';

export interface ToolExecutionProgressProps {
  /** The tool stream state to display */
  stream: ToolStreamStateEntry;
  /** Optional callback to cancel the tool execution */
  onCancel?: () => void;
  /** Optional callback to retry a failed tool execution */
  onRetry?: () => void;
  /** Whether to auto-scroll the output */
  autoScroll?: boolean;
  /** Initial expanded state */
  defaultExpanded?: boolean;
  /** Maximum height for the output area */
  maxOutputHeight?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Get icon for tool based on name
 */
function getToolIcon(toolName: string): React.ReactNode {
  const name = toolName.toLowerCase();

  if (name.includes('file') || name.includes('read') || name.includes('write')) {
    return <FileText size={16} />;
  }
  if (name.includes('terminal') || name.includes('shell') || name.includes('command')) {
    return <Terminal size={16} />;
  }
  if (name.includes('browser') || name.includes('navigate') || name.includes('web')) {
    return <Globe size={16} />;
  }
  if (name.includes('db') || name.includes('database') || name.includes('sql')) {
    return <Database size={16} />;
  }
  if (name.includes('code') || name.includes('execute')) {
    return <Code size={16} />;
  }

  return <Wrench size={16} />;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export const ToolExecutionProgress: React.FC<ToolExecutionProgressProps> = ({
  stream,
  onCancel,
  onRetry,
  autoScroll = true,
  defaultExpanded = true,
  maxOutputHeight = 300,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  // Auto-scroll output when new content arrives
  useEffect(() => {
    if (autoScroll && expanded && outputRef.current && stream.status === 'running') {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [stream.outputBuffer, autoScroll, expanded, stream.status]);

  // Copy output to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stream.outputBuffer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy output:', err);
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (stream.status) {
      case 'running':
        return 'text-blue-400';
      case 'completed':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'cancelled':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (stream.status) {
      case 'running':
        return <Loader2 size={16} className="animate-spin" />;
      case 'completed':
        return <Check size={16} />;
      case 'error':
      case 'cancelled':
        return <X size={16} />;
      default:
        return null;
    }
  };

  // Calculate progress percentage
  const progressPercent = Math.round(stream.progress * 100);

  // Check if we have byte progress info
  const hasByteProgress = stream.bytesTotal !== undefined && stream.bytesTotal > 0;

  return (
    <div
      className={`tool-execution-progress rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-gray-800/80">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Expand/Collapse Button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-gray-700 rounded transition-colors shrink-0"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronDown size={14} className="text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-gray-400" />
            )}
          </button>

          {/* Tool Icon */}
          <div className={`shrink-0 ${getStatusColor()}`}>{getToolIcon(stream.tool_name)}</div>

          {/* Tool Name */}
          <span className="font-medium text-gray-200 truncate">{stream.tool_name}</span>

          {/* Status Icon */}
          <div className={`shrink-0 ${getStatusColor()}`}>{getStatusIcon()}</div>

          {/* Progress Message */}
          {stream.progressMessage && stream.status === 'running' && (
            <span className="text-xs text-gray-400 truncate">{stream.progressMessage}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Duration */}
          {stream.duration_ms !== undefined && (
            <span className="text-xs text-gray-500 mr-2">{formatDuration(stream.duration_ms)}</span>
          )}

          {/* Cancel button for running tools */}
          {stream.status === 'running' && onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 hover:bg-red-900/50 rounded transition-colors text-red-400 hover:text-red-300"
              title="Cancel execution"
            >
              <Square size={14} />
            </button>
          )}

          {/* Retry button for failed tools */}
          {stream.status === 'error' && stream.retryable && onRetry && (
            <button
              onClick={onRetry}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-300"
              title="Retry execution"
            >
              <RotateCw size={14} />
            </button>
          )}

          {/* Copy button when there's output */}
          {stream.outputBuffer.length > 0 && (
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-300"
              title={copied ? 'Copied!' : 'Copy output'}
            >
              <Copy size={14} className={copied ? 'text-green-400' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {stream.status === 'running' && (
        <div className="px-3 pb-2">
          <div className="relative h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-300 ease-out rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Animated shimmer for indeterminate progress */}
            {stream.progress === 0 && (
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-blue-400/30 to-transparent animate-shimmer" />
            )}
          </div>

          {/* Progress details */}
          <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
            <span>{progressPercent}%</span>
            {hasByteProgress && (
              <span>
                {formatBytes(stream.bytesProcessed || 0)} / {formatBytes(stream.bytesTotal!)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-700">
          {/* Output Area */}
          {stream.outputBuffer.length > 0 && (
            <pre
              ref={outputRef}
              className="p-3 text-xs font-mono text-gray-300 overflow-auto bg-gray-900/50"
              style={{ maxHeight: maxOutputHeight }}
            >
              {stream.outputBuffer}
              {stream.status === 'running' && (
                <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5" />
              )}
            </pre>
          )}

          {stream.error ? (
            <div className="p-3 bg-red-900/20 border-t border-red-800">
              <div className="flex items-start gap-2">
                <X size={14} className="text-red-400 shrink-0 mt-0.5" />
                <div className="text-sm text-red-300 break-words">{stream.error}</div>
              </div>
              {stream.retryable && (
                <p className="text-xs text-red-400/70 mt-1 ml-5">This operation can be retried.</p>
              )}
            </div>
          ) : null}

          {/* Completion Summary */}
          {stream.status === 'completed' &&
          stream.result !== undefined &&
          stream.result !== null ? (
            <div className="p-3 bg-green-900/10 border-t border-green-800/30">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Check size={14} />
                <span>Completed successfully</span>
                {stream.duration_ms !== undefined && (
                  <span className="text-green-400/70">in {formatDuration(stream.duration_ms)}</span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ToolExecutionProgress;
