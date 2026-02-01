/**
 * React hook for checkpoint management
 *
 * Provides convenient interface for saving, loading, and managing
 * AGI task checkpoints with automatic state synchronization.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Checkpoint,
  CheckpointListResponse,
  CheckpointReason,
  CheckpointSummary,
  TaskId,
  getLatestCheckpoint,
  getRestoreHistory,
  listCheckpoints,
  recordRestore,
  saveCheckpoint,
  cleanupCheckpoints,
  deleteCheckpoint,
} from '@/api/agi_checkpoint';

export interface UseCheckpointsState {
  checkpoints: CheckpointSummary[];
  latestCheckpoint: Checkpoint | null;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  restoreHistory: string[];
}

export interface UseCheckpointsActions {
  saveCheckpoint: (request: any) => Promise<Checkpoint>;
  loadLatestCheckpoint: () => Promise<Checkpoint | null>;
  listCheckpoints: () => Promise<CheckpointListResponse>;
  deleteCheckpoint: (id: string) => Promise<void>;
  cleanup: (keepCount?: number) => Promise<number>;
  recordRestore: (checkpointId: string, resumedSteps: number, error?: string) => Promise<void>;
  refreshCheckpoints: () => Promise<void>;
}

interface UseCheckpointsOptions {
  taskId: TaskId;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

/**
 * Hook for managing AGI task checkpoints
 *
 * Usage:
 * ```tsx
 * const { state, actions } = useCheckpoints({ taskId: 'task-123' });
 *
 * // Save a checkpoint during execution
 * await actions.saveCheckpoint({
 *   task_id: 'task-123',
 *   goal_id: 'goal-1',
 *   goal_description: 'Build a website',
 *   current_step: 5,
 *   completed_steps: [0, 1, 2, 3, 4],
 *   total_steps: 10,
 *   elapsed_time_ms: 30000,
 *   tool_calls_executed: 15,
 *   failure_count: 2,
 *   reason: 'interval',
 * });
 *
 * // Get latest checkpoint to resume from
 * const latest = await actions.loadLatestCheckpoint();
 * if (latest) {
 *   console.log(`Can resume from step ${latest.current_step}`);
 * }
 * ```
 */
export function useCheckpoints(options: UseCheckpointsOptions): {
  state: UseCheckpointsState;
  actions: UseCheckpointsActions;
} {
  const { taskId, autoRefresh = false, refreshInterval = 5000 } = options;

  // State
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [latestCheckpoint, setLatestCheckpoint] = useState<Checkpoint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [restoreHistory, setRestoreHistory] = useState<string[]>([]);

  // Action: Refresh checkpoints list
  const refreshCheckpoints = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [list, latest, history] = await Promise.all([
        listCheckpoints(taskId),
        getLatestCheckpoint(taskId),
        getRestoreHistory(taskId),
      ]);

      setCheckpoints(list.checkpoints);
      setLatestCheckpoint(latest);
      setRestoreHistory(history);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  // Action: Save checkpoint
  const handleSaveCheckpoint = useCallback(
    async (request: any) => {
      try {
        setIsSaving(true);
        setError(null);
        const checkpoint = await saveCheckpoint(request);
        await refreshCheckpoints();
        return checkpoint;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save checkpoint';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [refreshCheckpoints],
  );

  // Action: Load latest checkpoint
  const handleLoadLatestCheckpoint = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const checkpoint = await getLatestCheckpoint(taskId);
      return checkpoint;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load latest checkpoint';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  // Action: List checkpoints
  const handleListCheckpoints = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      return await listCheckpoints(taskId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list checkpoints';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  // Action: Delete checkpoint
  const handleDeleteCheckpoint = useCallback(
    async (checkpointId: string) => {
      try {
        setError(null);
        await deleteCheckpoint(checkpointId);
        await refreshCheckpoints();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete checkpoint';
        setError(message);
        throw err;
      }
    },
    [refreshCheckpoints],
  );

  // Action: Cleanup old checkpoints
  const handleCleanup = useCallback(
    async (keepCount?: number) => {
      try {
        setError(null);
        const deleted = await cleanupCheckpoints(taskId, keepCount);
        await refreshCheckpoints();
        return deleted;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cleanup checkpoints';
        setError(message);
        throw err;
      }
    },
    [taskId, refreshCheckpoints],
  );

  // Action: Record restore event
  const handleRecordRestore = useCallback(
    async (checkpointId: string, resumedSteps: number, error?: string) => {
      try {
        setError(null);
        await recordRestore(checkpointId, taskId, resumedSteps, error);
        await refreshCheckpoints();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to record restore';
        setError(message);
        throw err;
      }
    },
    [taskId, refreshCheckpoints],
  );

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    // Refresh immediately
    refreshCheckpoints();

    // Set up interval
    const interval = setInterval(refreshCheckpoints, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, refreshCheckpoints]);

  // Initial load
  useEffect(() => {
    refreshCheckpoints();
  }, [refreshCheckpoints]);

  return {
    state: {
      checkpoints,
      latestCheckpoint,
      isLoading,
      error,
      isSaving,
      restoreHistory,
    },
    actions: {
      saveCheckpoint: handleSaveCheckpoint,
      loadLatestCheckpoint: handleLoadLatestCheckpoint,
      listCheckpoints: handleListCheckpoints,
      deleteCheckpoint: handleDeleteCheckpoint,
      cleanup: handleCleanup,
      recordRestore: handleRecordRestore,
      refreshCheckpoints,
    },
  };
}

/**
 * Hook to manage checkpoint-based task resumption
 */
export function useCheckpointResume(taskId: TaskId) {
  const [resumableCheckpoint, setResumableCheckpoint] = useState<Checkpoint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkForResumable = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const checkpoint = await getLatestCheckpoint(taskId);
      setResumableCheckpoint(checkpoint);
      return checkpoint;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check for resumable task';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    checkForResumable();
  }, [checkForResumable]);

  const resume = useCallback(
    async (checkpoint: Checkpoint) => {
      try {
        // Record the restore event
        await recordRestore(checkpoint.id, taskId, checkpoint.completed_steps.length);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to resume from checkpoint';
        setError(message);
        return false;
      }
    },
    [taskId],
  );

  return {
    resumableCheckpoint,
    isLoading,
    error,
    checkForResumable,
    resume,
    hasResumable: resumableCheckpoint !== null,
  };
}

/**
 * Hook to track checkpoint creation during task execution
 */
export function useCheckpointTracking() {
  const [stepsSinceCheckpoint, setStepsSinceCheckpoint] = useState(0);
  const [lastCheckpointTime, setLastCheckpointTime] = useState<number | null>(null);
  const [checkpointMetrics, setCheckpointMetrics] = useState({
    totalCheckpoints: 0,
    lastCheckpointReason: 'none' as CheckpointReason | 'none',
    estimatedTimeToCompletion: 0,
  });

  const recordStep = useCallback(() => {
    setStepsSinceCheckpoint((prev) => prev + 1);
  }, []);

  const recordCheckpoint = useCallback(
    (reason: CheckpointReason, totalCheckpoints: number, estimatedMs: number) => {
      setStepsSinceCheckpoint(0);
      setLastCheckpointTime(Date.now());
      setCheckpointMetrics({
        totalCheckpoints,
        lastCheckpointReason: reason,
        estimatedTimeToCompletion: estimatedMs,
      });
    },
    [],
  );

  const shouldCreateCheckpoint = useCallback(
    (interval: number, timeoutApproaching: boolean) => {
      return stepsSinceCheckpoint >= interval || timeoutApproaching;
    },
    [stepsSinceCheckpoint],
  );

  return {
    stepsSinceCheckpoint,
    lastCheckpointTime,
    checkpointMetrics,
    recordStep,
    recordCheckpoint,
    shouldCreateCheckpoint,
  };
}
