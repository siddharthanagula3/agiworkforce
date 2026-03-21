/**
 * CheckpointManager Component
 *
 * Displays and manages AGI task checkpoints, enabling:
 * - Viewing checkpoint history
 * - Resuming from previous checkpoints
 * - Estimating time to completion
 * - Cleaning up old checkpoints
 */

import { useState } from 'react';
import { useCheckpoints, useCheckpointResume } from '@/hooks/useCheckpoints';
import { TaskId } from '@/api/agi_checkpoint';
import { format } from 'date-fns';

interface CheckpointManagerProps {
  taskId: TaskId;
  goalDescription?: string;
  onResumeClick?: (checkpointId: string) => void;
  autoRefresh?: boolean;
}

/**
 * Component displaying "Resume interrupted task" option
 */
export function CheckpointResume({
  taskId,
  onResumeClick,
}: {
  taskId: TaskId;
  onResumeClick?: (checkpointId: string) => void;
}) {
  const { resumableCheckpoint, isLoading, resume } = useCheckpointResume(taskId);

  if (!resumableCheckpoint) {
    return null;
  }

  const handleResume = async () => {
    const success = await resume(resumableCheckpoint);
    if (success && onResumeClick) {
      onResumeClick(resumableCheckpoint.id);
    }
  };

  const stepsCompleted = resumableCheckpoint.completed_steps.length;
  const totalSteps = resumableCheckpoint.metadata.total_steps;
  const progress = resumableCheckpoint.metadata.progress_percent;

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900">Interrupted Task</h3>
          <p className="text-sm text-amber-700 mt-1">
            {stepsCompleted} of {totalSteps} steps completed ({progress.toFixed(1)}%)
          </p>
          <div className="mt-2 w-full bg-amber-200 rounded-full h-2">
            <div
              className="bg-amber-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {resumableCheckpoint.metadata.estimated_remaining_ms && (
            <p className="text-xs text-amber-600 mt-2">
              Estimated time to complete:{' '}
              {formatDuration(resumableCheckpoint.metadata.estimated_remaining_ms)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleResume}
          disabled={isLoading}
          className="ml-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
        >
          {isLoading ? 'Resuming...' : 'Resume'}
        </button>
      </div>
    </div>
  );
}

/**
 * Component displaying checkpoint list and controls
 */
export function CheckpointList({
  taskId,
  onResumeClick,
}: {
  taskId: TaskId;
  onResumeClick?: (checkpointId: string) => void;
}) {
  const { state, actions } = useCheckpoints({ taskId, autoRefresh: true });
  const [expanding, setExpanding] = useState<string | null>(null);

  if (state.isLoading && state.checkpoints.length === 0) {
    return <div className="text-sm text-gray-500">Loading checkpoints...</div>;
  }

  if (state.error) {
    return <div className="text-sm text-red-600">Error loading checkpoints: {state.error}</div>;
  }

  if (state.checkpoints.length === 0) {
    return <div className="text-sm text-gray-500">No checkpoints yet</div>;
  }

  return (
    <div className="space-y-2">
      {state.checkpoints.map((cp) => (
        <div key={cp.id} className="border rounded-lg p-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  Step {cp.current_step}/{cp.total_steps}
                </span>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                  {cp.reason}
                </span>
                {cp.is_latest && (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                    Latest
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {format(new Date(cp.created_at_ms), 'MMM d, HH:mm:ss')}
              </p>
              <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${cp.progress_percent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {cp.progress_percent.toFixed(1)}% complete
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpanding(expanding === cp.id ? null : cp.id)}
              className="ml-2 px-2 py-1 text-xs text-blue-600 hover:text-blue-700"
            >
              {expanding === cp.id ? 'Hide' : 'Show'} Details
            </button>
          </div>

          {expanding === cp.id && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <div className="text-xs space-y-1">
                <p>
                  <span className="font-semibold">Elapsed:</span>{' '}
                  {formatDuration(cp.created_at_ms ? Date.now() - cp.created_at_ms : 0)}
                </p>
                <p>
                  <span className="font-semibold">Remaining:</span>{' '}
                  {cp.estimated_remaining_ms
                    ? formatDuration(cp.estimated_remaining_ms)
                    : 'Unknown'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResumeClick?.(cp.id);
                  }}
                  className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => actions.deleteCheckpoint(cp.id)}
                  className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => actions.refreshCheckpoints()}
          disabled={state.isLoading}
          className="text-xs px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => actions.cleanup(10)}
          disabled={state.isLoading}
          className="text-xs px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
        >
          Cleanup Old
        </button>
      </div>
    </div>
  );
}

/**
 * Main checkpoint manager component
 */
export function CheckpointManager({
  taskId,
  goalDescription,
  onResumeClick,
}: CheckpointManagerProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-2">Task Checkpoints</h2>
        {goalDescription && <p className="text-sm text-gray-600 mb-3">{goalDescription}</p>}
      </div>

      <CheckpointResume taskId={taskId} onResumeClick={onResumeClick} />

      <div className="border rounded-lg p-4 bg-white">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {showDetails ? 'Hide' : 'Show'} Checkpoint History
        </button>

        {showDetails && (
          <div className="mt-4">
            <CheckpointList taskId={taskId} onResumeClick={onResumeClick} />
          </div>
        )}
      </div>
    </div>
  );
}

/// Helper to format milliseconds to human-readable duration
function formatDuration(ms: number): string {
  if (ms === 0) return '0s';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

export default CheckpointManager;
