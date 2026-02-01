/**
 * useTimeout Hook
 *
 * Manages task timeout monitoring and provides methods to interact with
 * timeout functionality via Tauri backend commands.
 *
 * Features:
 * - Real-time timeout warning events
 * - Extend timeout duration
 * - Pause/resume tasks
 * - Abort tasks
 * - Get current task timeout status
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, listen, isTauri } from '../lib/tauri-mock';
import type { UnlistenFn } from '../lib/tauri-mock';
import type { TimeoutWarningData } from '../components/Execution/TimeoutWarningDialog';
import { toast } from './useToast';

export interface TimeoutStatus {
  taskId: string;
  taskName: string;
  remainingSeconds: number;
  maxTimeoutMinutes: number;
  executedSteps: number;
  totalEstimatedSteps?: number;
}

export interface UseTimeoutOptions {
  /**
   * Polling interval in milliseconds. Default: 10000ms (10 seconds)
   */
  pollInterval?: number;
  /**
   * Whether to automatically start polling. Default: true
   */
  autoPolling?: boolean;
}

export interface UseTimeoutReturn {
  /**
   * Current timeout status
   */
  timeoutStatus: TimeoutStatus | null;
  /**
   * Whether timeout status is being loaded
   */
  isLoading: boolean;
  /**
   * Last error that occurred
   */
  error: string | null;
  /**
   * Get the current timeout status for a task
   */
  getTimeoutStatus: (taskId: string) => Promise<TimeoutStatus | null>;
  /**
   * Extend the timeout by a specified number of minutes
   */
  extendTimeout: (taskId: string, additionalMinutes: number) => Promise<boolean>;
  /**
   * Pause a task
   */
  pauseTask: (taskId: string) => Promise<boolean>;
  /**
   * Resume a paused task
   */
  resumeTask: (taskId: string) => Promise<boolean>;
  /**
   * Abort a task
   */
  abortTask: (taskId: string) => Promise<boolean>;
}

export function useTimeout(): UseTimeoutReturn {
  const [timeoutStatus, setTimeoutStatus] = useState<TimeoutStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const unlistenFnsRef = useRef<UnlistenFn[]>([]);

  /**
   * Get the current timeout status for a task
   */
  const getTimeoutStatus = useCallback(async (taskId: string): Promise<TimeoutStatus | null> => {
    if (!isTauri) {
      console.debug('[useTimeout] Not in Tauri environment, cannot get timeout status');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await invoke<TimeoutStatus>('agi_get_timeout_status', {
        taskId,
      });

      if (!isMountedRef.current) return null;

      setTimeoutStatus(response);
      return response;
    } catch (err) {
      if (!isMountedRef.current) return null;

      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useTimeout] Failed to get timeout status:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Extend the timeout by a specified number of minutes
   */
  const extendTimeout = useCallback(
    async (taskId: string, additionalMinutes: number): Promise<boolean> => {
      if (!isTauri) {
        console.debug('[useTimeout] Not in Tauri environment, cannot extend timeout');
        return false;
      }

      try {
        await invoke<void>('agi_extend_timeout', {
          taskId,
          additionalMinutes,
        });

        toast({
          title: 'Timeout extended',
          description: `Task timeout extended by ${additionalMinutes} minutes.`,
        });

        // Refresh timeout status
        await getTimeoutStatus(taskId);
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[useTimeout] Failed to extend timeout:', errorMessage);

        toast({
          variant: 'destructive',
          title: 'Failed to extend timeout',
          description: errorMessage,
        });

        return false;
      }
    },
    [getTimeoutStatus],
  );

  /**
   * Pause a task
   */
  const pauseTask = useCallback(async (taskId: string): Promise<boolean> => {
    if (!isTauri) {
      console.debug('[useTimeout] Not in Tauri environment, cannot pause task');
      return false;
    }

    try {
      await invoke<void>('agi_pause_task', {
        taskId,
      });

      toast({
        title: 'Task paused',
        description: 'The task has been paused. You can resume it later.',
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useTimeout] Failed to pause task:', errorMessage);

      toast({
        variant: 'destructive',
        title: 'Failed to pause task',
        description: errorMessage,
      });

      return false;
    }
  }, []);

  /**
   * Resume a paused task
   */
  const resumeTask = useCallback(async (taskId: string): Promise<boolean> => {
    if (!isTauri) {
      console.debug('[useTimeout] Not in Tauri environment, cannot resume task');
      return false;
    }

    try {
      await invoke<void>('agi_resume_task', {
        taskId,
      });

      toast({
        title: 'Task resumed',
        description: 'The task has been resumed.',
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useTimeout] Failed to resume task:', errorMessage);

      toast({
        variant: 'destructive',
        title: 'Failed to resume task',
        description: errorMessage,
      });

      return false;
    }
  }, []);

  /**
   * Abort a task
   */
  const abortTask = useCallback(async (taskId: string): Promise<boolean> => {
    if (!isTauri) {
      console.debug('[useTimeout] Not in Tauri environment, cannot abort task');
      return false;
    }

    try {
      await invoke<void>('agi_abort_task', {
        taskId,
      });

      toast({
        title: 'Task aborted',
        description: 'The task has been cancelled.',
        variant: 'destructive',
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useTimeout] Failed to abort task:', errorMessage);

      toast({
        variant: 'destructive',
        title: 'Failed to abort task',
        description: errorMessage,
      });

      return false;
    }
  }, []);

  // Setup event listeners for real-time updates
  useEffect(() => {
    isMountedRef.current = true;
    unlistenFnsRef.current = [];

    if (!isTauri) return;

    const setupListeners = async () => {
      try {
        // Listen for timeout warning events
        const unlistenWarning = await listen<TimeoutWarningData>('agi:timeout_warning', (event) => {
          if (!isMountedRef.current) return;
          const warningData = event.payload;
          setTimeoutStatus({
            taskId: warningData.taskId,
            taskName: warningData.taskName,
            remainingSeconds: warningData.remainingSeconds,
            maxTimeoutMinutes: warningData.maxTimeoutMinutes,
            executedSteps: warningData.executedSteps,
            totalEstimatedSteps: warningData.totalEstimatedSteps,
          });
        });
        unlistenFnsRef.current.push(unlistenWarning);
      } catch (err) {
        console.error('[useTimeout] Failed to setup listeners:', err);
      }
    };

    void setupListeners();

    return () => {
      isMountedRef.current = false;
      unlistenFnsRef.current.forEach((unlisten) => unlisten());
      unlistenFnsRef.current = [];
    };
  }, []);

  return {
    timeoutStatus,
    isLoading,
    error,
    getTimeoutStatus,
    extendTimeout,
    pauseTask,
    resumeTask,
    abortTask,
  };
}

export default useTimeout;
