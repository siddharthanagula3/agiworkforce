/**
 * BackgroundTasksPanel Component
 *
 * A panel that displays all background tasks with their status, progress,
 * and elapsed time. Provides cancel functionality for active tasks.
 */
import React, { useMemo } from 'react';
import { Clock, X, AlertCircle, CheckCircle2, Pause, Loader2, XCircle } from 'lucide-react';
import { cn, formatDuration } from '../../lib/utils';
import { useBackgroundTasks } from '../../hooks/useBackgroundTasks';
import type { BackgroundTask, BackgroundTaskStatus } from '../../stores/chat/agentStore';
import { Button } from '../ui/Button';
import { Progress } from '../ui/Progress';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';

interface BackgroundTasksPanelProps {
  className?: string;
  onClose?: () => void;
  maxHeight?: string;
}

/**
 * Get the status icon for a task
 */
function TaskStatusIcon({ status }: { status: BackgroundTaskStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'queued':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'paused':
      return <Pause className="h-4 w-4 text-orange-500" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-gray-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

/**
 * Get the status badge variant
 */
function getStatusBadgeVariant(
  status: BackgroundTaskStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'running':
      return 'default';
    case 'queued':
      return 'secondary';
    case 'completed':
      return 'outline';
    case 'failed':
    case 'cancelled':
      return 'destructive';
    default:
      return 'secondary';
  }
}

/**
 * Format elapsed time from start date to now (or completion)
 */
function formatElapsedTime(startedAt?: Date, completedAt?: Date): string {
  if (!startedAt) return '--';

  const endTime = completedAt ? new Date(completedAt) : new Date();
  const elapsedMs = endTime.getTime() - new Date(startedAt).getTime();

  // Use formatDuration from utils if available, otherwise fallback
  if (typeof formatDuration === 'function') {
    return formatDuration(elapsedMs);
  }

  // Fallback formatting
  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Individual task item component
 */
interface TaskItemProps {
  task: BackgroundTask;
  onCancel: (taskId: string) => void;
  isCancelling: boolean;
}

function TaskItem({ task, onCancel, isCancelling }: TaskItemProps) {
  const isActive = task.status === 'running' || task.status === 'queued';
  const canCancel = isActive && !isCancelling;

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 dark:border-gray-700 p-3 transition-colors',
        isActive ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TaskStatusIcon status={task.status} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
              {task.name}
            </p>
            {task.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {task.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={getStatusBadgeVariant(task.status)} className="text-xs capitalize">
            {task.status}
          </Badge>

          {canCancel && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onCancel(task.id)}
              disabled={isCancelling}
              className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
              aria-label="Cancel task"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar for active tasks */}
      {isActive && (
        <div className="mt-2">
          <Progress value={task.progress} max={100} className="h-1.5" />
        </div>
      )}

      {/* Footer with time info */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{formatElapsedTime(task.startedAt, task.completedAt)}</span>
        </div>
        {task.progress > 0 && task.progress < 100 && (
          <span className="font-medium">{Math.round(task.progress)}%</span>
        )}
      </div>

      {/* Error message for failed tasks */}
      {task.status === 'failed' && task.error && (
        <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-xs text-red-700 dark:text-red-300 break-words">{task.error}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Empty state when no tasks exist
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-3 mb-3">
        <CheckCircle2 className="h-6 w-6 text-gray-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No background tasks</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Tasks will appear here when running in the background.
      </p>
    </div>
  );
}

/**
 * BackgroundTasksPanel - displays all background tasks
 */
export function BackgroundTasksPanel({
  className,
  onClose,
  maxHeight = '400px',
}: BackgroundTasksPanelProps) {
  const { tasks, activeTasks, isLoading, refreshTasks, cancelTask } = useBackgroundTasks();

  const [cancellingTaskId, setCancellingTaskId] = React.useState<string | null>(null);

  // Sort tasks: active first, then by creation date (newest first)
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // Active tasks first
      const aActive = a.status === 'running' || a.status === 'queued';
      const bActive = b.status === 'running' || b.status === 'queued';

      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      // Then by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tasks]);

  const handleCancel = async (taskId: string) => {
    setCancellingTaskId(taskId);
    await cancelTask(taskId);
    setCancellingTaskId(null);
  };

  return (
    <div
      className={cn(
        'flex flex-col bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            Background Tasks
          </h3>
          {activeTasks.length > 0 && (
            <Badge variant="default" className="text-xs">
              {activeTasks.length} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={refreshTasks}
            disabled={isLoading}
            className="h-7 px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="text-xs">Refresh</span>
            )}
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onClose}
              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1" style={{ maxHeight }}>
        <div className="p-3 space-y-2">
          {sortedTasks.length === 0 ? (
            <EmptyState />
          ) : (
            sortedTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onCancel={handleCancel}
                isCancelling={cancellingTaskId === task.id}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default BackgroundTasksPanel;
