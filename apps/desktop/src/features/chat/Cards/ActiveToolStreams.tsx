/**
 * ActiveToolStreams Component
 *
 * Container component that displays all currently active tool streams.
 * Shows real-time progress for running tools and recent completions.
 */
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUnifiedChatStore, type ToolStreamStateEntry } from '../../../stores/unifiedChatStore';
import { ToolExecutionProgress } from './ToolExecutionProgress';

export interface ActiveToolStreamsProps {
  /** Whether to show only running streams or include recent completions */
  showCompleted?: boolean;
  /** Maximum number of streams to display */
  maxStreams?: number;
  /** Custom class name */
  className?: string;
  /** Callback when a stream is cancelled */
  onCancelStream?: (toolId: string) => void;
  /** Callback when a stream is retried */
  onRetryStream?: (toolId: string) => void;
}

export const ActiveToolStreams: React.FC<ActiveToolStreamsProps> = ({
  showCompleted = false,
  maxStreams = 5,
  className = '',
  onCancelStream,
  onRetryStream,
}) => {
  const { activeToolStreams, cancelToolExecution } = useUnifiedChatStore(
    useShallow((state) => ({
      activeToolStreams: state.activeToolStreams,
      cancelToolExecution: state.cancelToolExecution,
    })),
  );

  // Convert Map to array and filter
  const streams = React.useMemo(() => {
    const allStreams = Array.from(activeToolStreams.values());

    // Filter based on showCompleted setting
    const filtered = showCompleted ? allStreams : allStreams.filter((s) => s.status === 'running');

    // Sort by start time (most recent first) and limit
    return filtered
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, maxStreams);
  }, [activeToolStreams, showCompleted, maxStreams]);

  // Don't render if no streams
  if (streams.length === 0) {
    return null;
  }

  const handleCancel = (toolId: string) => {
    if (onCancelStream) {
      onCancelStream(toolId);
    } else {
      cancelToolExecution(toolId);
    }
  };

  const handleRetry = (toolId: string) => {
    if (onRetryStream) {
      onRetryStream(toolId);
    }
    // If no retry handler provided, the button will be disabled
  };

  // Only show retry button if handler is provided
  const canRetry = (stream: ToolStreamStateEntry) =>
    stream.retryable && onRetryStream !== undefined;

  return (
    <div className={`active-tool-streams space-y-2 ${className}`}>
      {streams.map((stream) => (
        <ToolExecutionProgress
          key={stream.tool_id}
          stream={stream}
          onCancel={stream.status === 'running' ? () => handleCancel(stream.tool_id) : undefined}
          onRetry={canRetry(stream) ? () => handleRetry(stream.tool_id) : undefined}
          defaultExpanded={stream.status === 'running'}
        />
      ))}
    </div>
  );
};

/**
 * Hook to get active tool streams count
 * Returns a primitive (number), so no shallow comparison needed.
 */
export function useActiveToolStreamsCount(): number {
  return useUnifiedChatStore((state) => {
    let count = 0;
    for (const s of state.activeToolStreams.values()) {
      if (s.status === 'running') count++;
    }
    return count;
  });
}

/**
 * Hook to get all active tool streams
 * Uses useShallow to avoid re-renders when the returned array is structurally equal.
 */
export function useActiveToolStreams(): ToolStreamStateEntry[] {
  const activeToolStreams = useUnifiedChatStore(
    useShallow((state) => {
      return Array.from(state.activeToolStreams.values()).filter((s) => s.status === 'running');
    }),
  );
  return activeToolStreams;
}

export default ActiveToolStreams;
