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
 * - Read from the canonical background-task store
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke, isTauri } from '../lib/tauri-mock';
import { useAgentStore, normalizeBackgroundTask } from '../stores/chat/agentStore';
import type { BackgroundTask, BackgroundTaskSnapshotPayload } from '../stores/chat/agentStore';
import { toast } from 'sonner';

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
   * Submit a new background task (bg_submit_task)
   */
  submitTask: (name: string, description?: string, priority?: string) => Promise<string | null>;
  /**
   * Cancel a specific task
   */
  cancelTask: (taskId: string) => Promise<boolean>;
  /**
   * Pause a running task (bg_pause_task)
   */
  pauseTask: (taskId: string) => Promise<boolean>;
  /**
   * Resume a paused task (bg_resume_task)
   */
  resumeTask: (taskId: string) => Promise<boolean>;
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

  /**
   * Fetch all background tasks from the backend
   */
  const refreshTasks = useCallback(async () => {
    if (!isTauri) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await invoke<BackgroundTaskSnapshotPayload[]>('background_task_list', {
        request: { status: null, priority: null, limit: null },
      });

      if (!isMountedRef.current) return;

      // Update store with normalized tasks
      if (Array.isArray(response)) {
        // Get current tasks from store without causing dependency loop
        const currentTasks = useAgentStore.getState().backgroundTasks;
        for (const task of response) {
          const normalized = normalizeBackgroundTask(task);
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
        return false;
      }

      try {
        await invoke<void>('background_task_cancel', { taskId });

        // Optimistically update the task status
        updateBackgroundTask(taskId, {
          status: 'cancelled',
          completedAt: new Date(),
        });

        toast.success('Task cancelled', {
          description: 'The background task has been cancelled.',
        });

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[useBackgroundTasks] Failed to cancel task:', errorMessage);

        toast.error('Failed to cancel task', {
          description: errorMessage,
        });

        return false;
      }
    },
    [updateBackgroundTask],
  );

  /**
   * Submit a new background task (bg_submit_task)
   */
  const submitTask = useCallback(
    async (
      name: string,
      description?: string,
      priority: string = 'Normal',
    ): Promise<string | null> => {
      if (!isTauri) {
        return null;
      }

      try {
        const taskId = await invoke<string>('bg_submit_task', {
          request: {
            name,
            description: description ?? null,
            priority,
            payload: null,
          },
        });

        // Refresh the task list to pick up the new task
        await refreshTasks();

        toast.success('Task submitted', {
          description: `Background task "${name}" has been queued.`,
        });

        return taskId;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[useBackgroundTasks] Failed to submit task:', errorMessage);

        toast.error('Failed to submit task', {
          description: errorMessage,
        });

        return null;
      }
    },
    [refreshTasks],
  );

  /**
   * Pause a running task (bg_pause_task)
   */
  const pauseTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      if (!isTauri) {
        return false;
      }

      try {
        await invoke<void>('bg_pause_task', { taskId });

        updateBackgroundTask(taskId, { status: 'paused' });

        toast.success('Task paused', {
          description: 'The background task has been paused.',
        });

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[useBackgroundTasks] Failed to pause task:', errorMessage);

        toast.error('Failed to pause task', {
          description: errorMessage,
        });

        return false;
      }
    },
    [updateBackgroundTask],
  );

  /**
   * Resume a paused task (bg_resume_task)
   */
  const resumeTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      if (!isTauri) {
        return false;
      }

      try {
        await invoke<void>('bg_resume_task', { taskId });

        updateBackgroundTask(taskId, { status: 'running' });

        toast.success('Task resumed', {
          description: 'The background task has been resumed.',
        });

        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[useBackgroundTasks] Failed to resume task:', errorMessage);

        toast.error('Failed to resume task', {
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
      return null;
    }

    try {
      const response = await invoke<BackgroundTaskSnapshotPayload | null>(
        'background_task_status',
        {
          taskId,
        },
      );

      if (!response) return null;

      return normalizeBackgroundTask(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useBackgroundTasks] Failed to get task status:', errorMessage);
      return null;
    }
  }, []);

  // Refresh from backend on mount; the canonical store listener handles live task events.
  useEffect(() => {
    isMountedRef.current = true;
    void refreshTasks();

    return () => {
      isMountedRef.current = false;
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
    submitTask,
    cancelTask,
    pauseTask,
    resumeTask,
    getTaskStatus,
  };
}

export default useBackgroundTasks;
