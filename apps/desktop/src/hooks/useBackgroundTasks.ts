/**
 * useBackgroundTasks Hook
 *
 * Manages background task state and provides functions to interact with
 * background tasks via Tauri backend commands.
 *
 * Features:
 * - List all background tasks
 * - Cancel specific tasks
 * - Get task status
 * - Auto-polling for updates when tasks are active
 * - Real-time event listening for task updates
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke, listen, isTauri } from '../lib/tauri-mock';
import type { UnlistenFn } from '../lib/tauri-mock';
import { useAgentStore } from '../stores/chat/agentStore';
import type { BackgroundTask, BackgroundTaskStatus } from '../stores/chat/agentStore';
import { toast } from './useToast';

/**
 * Backend task response structure (snake_case from Rust)
 */
interface BackendTaskResponse {
  id: string;
  name: string;
  description?: string;
  status: string;
  progress: number;
  priority?: string;
  created_at?: number | string;
  started_at?: number | string;
  completed_at?: number | string;
  error?: string;
}

/**
 * Task progress event payload from backend
 */
interface TaskProgressEvent {
  task: BackendTaskResponse;
}

/**
 * Normalize backend task response to frontend BackgroundTask type
 */
function normalizeTask(task: BackendTaskResponse): BackgroundTask {
  const normalizeStatus = (status: string): BackgroundTaskStatus => {
    const normalized = status.toLowerCase();
    if (
      normalized === 'queued' ||
      normalized === 'running' ||
      normalized === 'paused' ||
      normalized === 'completed' ||
      normalized === 'failed' ||
      normalized === 'cancelled'
    ) {
      return normalized as BackgroundTaskStatus;
    }
    return 'queued';
  };

  const normalizePriority = (priority?: string): 'low' | 'normal' | 'high' => {
    if (!priority) return 'normal';
    const normalized = priority.toLowerCase();
    if (normalized === 'low' || normalized === 'normal' || normalized === 'high') {
      return normalized;
    }
    return 'normal';
  };

  const normalizeTimestamp = (value?: number | string): Date | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') {
      // Unix timestamp in seconds or milliseconds
      const ms = value > 1_000_000_000_000 ? value : value * 1000;
      return new Date(ms);
    }
    return new Date(value);
  };

  return {
    id: task.id,
    name: task.name,
    description: task.description,
    status: normalizeStatus(task.status),
    progress: Math.min(100, Math.max(0, task.progress)),
    priority: normalizePriority(task.priority),
    createdAt: normalizeTimestamp(task.created_at) ?? new Date(),
    startedAt: normalizeTimestamp(task.started_at),
    completedAt: normalizeTimestamp(task.completed_at),
    error: task.error,
  };
}

export interface UseBackgroundTasksOptions {
  /**
   * Polling interval in milliseconds when tasks are active.
   * Set to 0 to disable polling. Default: 5000ms
   */
  pollInterval?: number;
  /**
   * Whether to automatically start polling when tasks are active.
   * Default: true
   */
  autoPolling?: boolean;
}

export interface UseBackgroundTasksReturn {
  /**
   * All background tasks
   */
  tasks: BackgroundTask[];
  /**
   * Only active (running or queued) tasks
   */
  activeTasks: BackgroundTask[];
  /**
   * Count of active tasks
   */
  activeCount: number;
  /**
   * Whether tasks are currently being loaded
   */
  isLoading: boolean;
  /**
   * Last error that occurred
   */
  error: string | null;
  /**
   * Refresh the task list from backend
   */
  refreshTasks: () => Promise<void>;
  /**
   * Cancel a specific task
   */
  cancelTask: (taskId: string) => Promise<boolean>;
  /**
   * Get status of a specific task
   */
  getTaskStatus: (taskId: string) => Promise<BackgroundTask | null>;
}

export function useBackgroundTasks(
  options: UseBackgroundTasksOptions = {},
): UseBackgroundTasksReturn {
  const { pollInterval = 5000, autoPolling = true } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use a single store selector with shallow comparison to get all needed values at once
  // This prevents multiple subscriptions and re-renders from object reference changes
  const { tasks, addBackgroundTask, updateBackgroundTask } = useAgentStore(
    useShallow((state) => ({
      tasks: state.backgroundTasks,
      addBackgroundTask: state.addBackgroundTask,
      updateBackgroundTask: state.updateBackgroundTask,
    })),
  );

  // Memoize activeTasks to prevent new array references on every render
  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === 'running' || t.status === 'queued'),
    [tasks],
  );

  // Memoize activeCount to use as a stable dependency
  const activeCount = activeTasks.length;

  const isMountedRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unlistenFnsRef = useRef<UnlistenFn[]>([]);

  /**
   * Fetch all background tasks from the backend
   */
  const refreshTasks = useCallback(async () => {
    if (!isTauri) {
      console.debug('[useBackgroundTasks] Not in Tauri environment, skipping refresh');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await invoke<BackendTaskResponse[]>('background_task_list');

      if (!isMountedRef.current) return;

      // Update store with normalized tasks
      if (Array.isArray(response)) {
        // Get current tasks from store without causing dependency loop
        const currentTasks = useAgentStore.getState().backgroundTasks;
        for (const task of response) {
          const normalized = normalizeTask(task);
          // Check if task exists, then update or add
          const existingTask = currentTasks.find((t) => t.id === normalized.id);
          if (existingTask) {
            updateBackgroundTask(normalized.id, normalized);
          } else {
            addBackgroundTask(normalized);
          }
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useBackgroundTasks] Failed to fetch tasks:', errorMessage);
      setError(errorMessage);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [addBackgroundTask, updateBackgroundTask]);

  /**
   * Cancel a specific background task
   */
  const cancelTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      if (!isTauri) {
        console.debug('[useBackgroundTasks] Not in Tauri environment, cannot cancel task');
        return false;
      }

      try {
        await invoke<void>('background_task_cancel', { taskId });

        // Optimistically update the task status
        updateBackgroundTask(taskId, {
          status: 'cancelled',
          completedAt: new Date(),
        });

        toast({
          title: 'Task cancelled',
          description: 'The background task has been cancelled.',
        });

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[useBackgroundTasks] Failed to cancel task:', errorMessage);

        toast({
          variant: 'destructive',
          title: 'Failed to cancel task',
          description: errorMessage,
        });

        return false;
      }
    },
    [updateBackgroundTask],
  );

  /**
   * Get the status of a specific task
   */
  const getTaskStatus = useCallback(async (taskId: string): Promise<BackgroundTask | null> => {
    if (!isTauri) {
      console.debug('[useBackgroundTasks] Not in Tauri environment, cannot get task status');
      return null;
    }

    try {
      const response = await invoke<BackendTaskResponse | null>('background_task_status', {
        taskId,
      });

      if (!response) return null;

      return normalizeTask(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useBackgroundTasks] Failed to get task status:', errorMessage);
      return null;
    }
  }, []);

  // Setup event listeners for real-time updates
  useEffect(() => {
    isMountedRef.current = true;
    unlistenFnsRef.current = [];

    if (!isTauri) return;

    const setupListeners = async () => {
      try {
        // Listen for task progress events
        const unlistenProgress = await listen<TaskProgressEvent>('task:progress', (event) => {
          if (!isMountedRef.current) return;
          const normalized = normalizeTask(event.payload.task);
          updateBackgroundTask(normalized.id, normalized);
        });
        unlistenFnsRef.current.push(unlistenProgress);

        // Listen for task completion events
        const unlistenCompleted = await listen<TaskProgressEvent>('task:completed', (event) => {
          if (!isMountedRef.current) return;
          const normalized = normalizeTask(event.payload.task);
          updateBackgroundTask(normalized.id, {
            ...normalized,
            status: 'completed',
            completedAt: new Date(),
          });
        });
        unlistenFnsRef.current.push(unlistenCompleted);

        // Listen for task failure events
        const unlistenFailed = await listen<TaskProgressEvent>('task:failed', (event) => {
          if (!isMountedRef.current) return;
          const normalized = normalizeTask(event.payload.task);
          updateBackgroundTask(normalized.id, {
            ...normalized,
            status: 'failed',
            completedAt: new Date(),
          });
        });
        unlistenFnsRef.current.push(unlistenFailed);
      } catch (err) {
        console.error('[useBackgroundTasks] Failed to setup listeners:', err);
      }
    };

    setupListeners();

    // Initial fetch
    refreshTasks();

    return () => {
      isMountedRef.current = false;
      unlistenFnsRef.current.forEach((unlisten) => unlisten());
      unlistenFnsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store refreshTasks in a ref to avoid dependency in polling effect
  const refreshTasksRef = useRef(refreshTasks);
  useEffect(() => {
    refreshTasksRef.current = refreshTasks;
  }, [refreshTasks]);

  // Setup polling when tasks are active
  useEffect(() => {
    if (!autoPolling || pollInterval <= 0 || !isTauri) {
      return;
    }

    const hasActiveTasks = activeCount > 0;

    if (hasActiveTasks && !pollIntervalRef.current) {
      // Start polling
      pollIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          refreshTasksRef.current();
        }
      }, pollInterval);
    } else if (!hasActiveTasks && pollIntervalRef.current) {
      // Stop polling when no active tasks
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [activeCount, autoPolling, pollInterval]);

  return {
    tasks,
    activeTasks,
    activeCount,
    isLoading,
    error,
    refreshTasks,
    cancelTask,
    getTaskStatus,
  };
}

export default useBackgroundTasks;
