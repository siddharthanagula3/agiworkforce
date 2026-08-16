import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke, isTauri } from '../lib/tauri-mock';
import { useAgentStore, normalizeBackgroundTask } from '../stores/chat/agentStore';
import type { BackgroundTask, BackgroundTaskSnapshotPayload } from '../stores/chat/agentStore';
import { toast } from 'sonner';

export interface UseBackgroundTasksOptions {
  pollInterval?: number;
  autoPolling?: boolean;
}

export interface UseBackgroundTasksReturn {
  tasks: BackgroundTask[];
  activeTasks: BackgroundTask[];
  activeCount: number;
  isLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
  submitTask: (name: string, description?: string, priority?: string) => Promise<string | null>;
  cancelTask: (taskId: string) => Promise<boolean>;
  pauseTask: (taskId: string) => Promise<boolean>;
  resumeTask: (taskId: string) => Promise<boolean>;
  getTaskStatus: (taskId: string) => Promise<BackgroundTask | null>;
}

export function useBackgroundTasks(
  options: UseBackgroundTasksOptions = {},
): UseBackgroundTasksReturn {
  const { pollInterval = 5000, autoPolling = true } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tasks, addBackgroundTask, updateBackgroundTask } = useAgentStore(
    useShallow((state) => ({
      tasks: state.backgroundTasks,
      addBackgroundTask: state.addBackgroundTask,
      updateBackgroundTask: state.updateBackgroundTask,
    })),
  );

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === 'running' || t.status === 'queued'),
    [tasks],
  );

  const activeCount = activeTasks.length;

  const isMountedRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      if (Array.isArray(response)) {
        const currentTasks = useAgentStore.getState().backgroundTasks;
        for (const task of response) {
          const normalized = normalizeBackgroundTask(task);
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

  const cancelTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      if (!isTauri) {
        return false;
      }

      try {
        await invoke<void>('background_task_cancel', { taskId });

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

  useEffect(() => {
    isMountedRef.current = true;
    void refreshTasks();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTasksRef = useRef(refreshTasks);
  useEffect(() => {
    refreshTasksRef.current = refreshTasks;
  }, [refreshTasks]);

  useEffect(() => {
    if (!autoPolling || pollInterval <= 0 || !isTauri) {
      return;
    }

    const hasActiveTasks = activeCount > 0;

    if (hasActiveTasks && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          refreshTasksRef.current();
        }
      }, pollInterval);
    } else if (!hasActiveTasks && pollIntervalRef.current) {
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
