import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUnifiedChatStore, type ToolStreamStateEntry } from '../../../stores/unifiedChatStore';
import { ToolExecutionProgress } from './ToolExecutionProgress';

export interface ActiveToolStreamsProps {
  showCompleted?: boolean;
  maxStreams?: number;
  className?: string;
  onCancelStream?: (toolId: string) => void;
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

  const streams = React.useMemo(() => {
    const allStreams = Array.from(activeToolStreams.values());

    const filtered = showCompleted ? allStreams : allStreams.filter((s) => s.status === 'running');

    return filtered
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, maxStreams);
  }, [activeToolStreams, showCompleted, maxStreams]);

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

export function useActiveToolStreamsCount(): number {
  return useUnifiedChatStore((state) => {
    let count = 0;
    for (const s of state.activeToolStreams.values()) {
      if (s.status === 'running') count++;
    }
    return count;
  });
}

export function useActiveToolStreams(): ToolStreamStateEntry[] {
  const activeToolStreams = useUnifiedChatStore(
    useShallow((state) => {
      return Array.from(state.activeToolStreams.values()).filter((s) => s.status === 'running');
    }),
  );
  return activeToolStreams;
}

export default ActiveToolStreams;
