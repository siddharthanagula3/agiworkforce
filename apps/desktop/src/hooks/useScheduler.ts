/**
 * useScheduler Hook
 *
 * Custom hook for managing scheduled jobs and cron tasks.
 * Wraps the schedulerStore and provides a clean API for scheduler operations.
 *
 * @example
 * ```tsx
 * const { jobs, isLoading, createJob, deleteJob, toggleJob, runNow } = useScheduler();
 *
 * // Create a new job
 * await createJob({
 *   name: 'Daily Backup',
 *   schedule: '0 0 9 * * *',
 *   actionType: 'shell_command',
 *   actionData: { command: 'backup.sh' }
 * });
 *
 * // Toggle job (pause/resume)
 * await toggleJob('job-id', true); // enable
 * await toggleJob('job-id', false); // disable
 *
 * // Run job immediately
 * await runNow('job-id');
 * ```
 */
import { invoke } from '../lib/tauri-mock';
import { useCallback, useEffect, useMemo } from 'react';

import {
  selectEnabledJobs,
  selectJobCount,
  selectJobs,
  selectSchedulerError,
  selectSchedulerLoading,
  selectUpcomingJobs,
  useSchedulerStore,
  type ScheduledJob as StoreScheduledJob,
} from '@/stores/schedulerStore';

// ============================================================================
// Types
// ============================================================================

/**
 * Scheduler action types matching the Rust backend
 */
export type SchedulerActionType =
  | 'workflow'
  | 'agi_task'
  | 'shell_command'
  | 'notification'
  | 'webhook'
  | 'script';

/**
 * Job status types matching the Rust backend
 */
export type JobStatus = 'active' | 'paused' | 'completed' | 'failed';

/**
 * Scheduled job interface matching the Rust backend
 */
export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;
  action_type: SchedulerActionType;
  action_data: Record<string, unknown>;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  last_run?: string;
  next_run?: string;
  run_count: number;
  failure_count: number;
  description?: string;
}

/**
 * Next run entry from the backend
 */
export interface NextRunEntry {
  job_id: string;
  next_run: string;
}

/**
 * Job execution history entry.
 * Matches Rust JobExecutionRecord (serde rename_all = "camelCase")
 * with ExecutionStatus (serde rename_all = "lowercase"): "running" | "completed" | "failed" | "cancelled"
 */
export interface JobHistoryEntry {
  id: number;
  jobId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  durationMs?: number;
}

/**
 * Parameters for creating a new job
 */
export interface CreateJobParams {
  name: string;
  schedule: string;
  actionType: SchedulerActionType;
  actionData: Record<string, unknown>;
  description?: string;
}

/**
 * Parameters for updating an existing job
 */
export interface UpdateJobParams {
  name?: string;
  schedule?: string;
  actionType?: SchedulerActionType;
  actionData?: Record<string, unknown>;
  description?: string;
}

// ============================================================================
// Type Adapter
// ============================================================================

/**
 * Map a store job to the hook's ScheduledJob type.
 * Now that the store type matches the Rust wire format, this is a direct mapping
 * with only null→undefined conversions for optional fields.
 */
function mapStoreJobToScheduledJob(storeJob: StoreScheduledJob): ScheduledJob {
  return {
    id: storeJob.id,
    name: storeJob.name,
    schedule: storeJob.schedule,
    action_type: storeJob.action_type as SchedulerActionType,
    action_data: storeJob.action_data,
    status: storeJob.status as JobStatus,
    created_at: storeJob.created_at,
    updated_at: storeJob.updated_at,
    last_run: storeJob.last_run ?? undefined,
    next_run: storeJob.next_run ?? undefined,
    run_count: storeJob.run_count,
    failure_count: storeJob.failure_count,
    description: storeJob.description ?? undefined,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useScheduler() {
  // Store selectors
  const storeJobs = useSchedulerStore(selectJobs);
  const storeEnabledJobs = useSchedulerStore(selectEnabledJobs);
  const storeUpcomingJobs = useSchedulerStore(selectUpcomingJobs);
  const jobCount = useSchedulerStore(selectJobCount);
  const isLoading = useSchedulerStore(selectSchedulerLoading);
  const error = useSchedulerStore(selectSchedulerError);

  // Map store jobs to our type
  const jobs = useMemo(() => storeJobs.map(mapStoreJobToScheduledJob), [storeJobs]);
  const enabledJobs = useMemo(
    () => storeEnabledJobs.map(mapStoreJobToScheduledJob),
    [storeEnabledJobs],
  );
  const upcomingJobs = useMemo(
    () => storeUpcomingJobs.map(mapStoreJobToScheduledJob),
    [storeUpcomingJobs],
  );

  // Store actions
  const storeAddJob = useSchedulerStore((state) => state.addJob);
  const storeRemoveJob = useSchedulerStore((state) => state.removeJob);
  const storePauseJob = useSchedulerStore((state) => state.pauseJob);
  const storeResumeJob = useSchedulerStore((state) => state.resumeJob);
  const storeListJobs = useSchedulerStore((state) => state.listJobs);
  const storeGetNextRuns = useSchedulerStore((state) => state.getNextRuns);
  const storeClearError = useSchedulerStore((state) => state.clearError);
  const storeInitEventListeners = useSchedulerStore((state) => state.initEventListeners);
  const storeCleanupEventListeners = useSchedulerStore((state) => state.cleanupEventListeners);

  // Initialize on mount
  useEffect(() => {
    storeListJobs().catch(console.error);
    storeInitEventListeners().catch(console.error);

    return () => {
      storeCleanupEventListeners();
    };
  }, [storeListJobs, storeInitEventListeners, storeCleanupEventListeners]);

  /**
   * List all scheduled jobs
   */
  const listJobs = useCallback(async (): Promise<ScheduledJob[]> => {
    await storeListJobs();
    return useSchedulerStore.getState().jobs.map(mapStoreJobToScheduledJob);
  }, [storeListJobs]);

  /**
   * Create a new scheduled job
   */
  const createJob = useCallback(
    async (params: CreateJobParams): Promise<string> => {
      const { name, schedule, actionType, actionData } = params;
      const actionDataStr = JSON.stringify(actionData);
      return storeAddJob(name, schedule, actionType, actionDataStr);
    },
    [storeAddJob],
  );

  const storeUpdateJobOnBackend = useSchedulerStore((state) => state.updateJobOnBackend);

  /**
   * Update an existing job via the backend
   */
  const updateJob = useCallback(
    async (jobId: string, params: UpdateJobParams): Promise<string> => {
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates['name'] = params.name;
      if (params.description !== undefined) updates['description'] = params.description;
      if (params.schedule !== undefined) updates['schedule'] = { cron_expression: params.schedule };
      if (params.actionType !== undefined) updates['action_type'] = params.actionType;

      await storeUpdateJobOnBackend(jobId, updates);
      return jobId;
    },
    [storeUpdateJobOnBackend],
  );

  /**
   * Delete a scheduled job
   */
  const deleteJob = useCallback(
    async (jobId: string): Promise<boolean> => {
      return storeRemoveJob(jobId);
    },
    [storeRemoveJob],
  );

  /**
   * Enable a job (resume it)
   */
  const enableJob = useCallback(
    async (jobId: string): Promise<boolean> => {
      return storeResumeJob(jobId);
    },
    [storeResumeJob],
  );

  /**
   * Disable a job (pause it)
   */
  const disableJob = useCallback(
    async (jobId: string): Promise<boolean> => {
      return storePauseJob(jobId);
    },
    [storePauseJob],
  );

  const storeToggleJob = useSchedulerStore((state) => state.toggleJob);

  /**
   * Toggle job enabled state
   */
  const toggleJob = useCallback(
    async (jobId: string, _enabled?: boolean): Promise<boolean> => {
      return storeToggleJob(jobId);
    },
    [storeToggleJob],
  );

  const storeRunJobNow = useSchedulerStore((state) => state.runJobNow);

  /**
   * Run a job immediately
   */
  const runNow = useCallback(
    async (jobId: string): Promise<boolean> => {
      return storeRunJobNow(jobId);
    },
    [storeRunJobNow],
  );

  /**
   * Get job execution history from the backend
   */
  const getHistory = useCallback(
    async (jobId?: string, limit?: number): Promise<JobHistoryEntry[]> => {
      try {
        const records = await invoke<JobHistoryEntry[]>('scheduler_get_history', {
          jobId: jobId ?? null,
        });
        return limit ? records.slice(0, limit) : records;
      } catch (error) {
        console.error('[useScheduler] Failed to get history:', error);
        return [];
      }
    },
    [],
  );

  /**
   * Get upcoming scheduled runs
   */
  const getNextRuns = useCallback(
    async (limit?: number): Promise<NextRunEntry[]> => {
      const runs = await storeGetNextRuns(limit);
      return runs.map((r) => ({
        job_id: r.job_id,
        next_run: r.next_run,
      }));
    },
    [storeGetNextRuns],
  );

  /**
   * Get a specific job by ID
   */
  const getJob = useCallback(async (jobId: string): Promise<ScheduledJob | null> => {
    return invoke<ScheduledJob | null>('scheduler_get_job', { jobId });
  }, []);

  /**
   * Clear any error state
   */
  const clearError = useCallback(() => {
    storeClearError();
  }, [storeClearError]);

  /**
   * Refresh the jobs list
   */
  const refresh = useCallback(async () => {
    await storeListJobs();
  }, [storeListJobs]);

  // Computed values
  const activeJobCount = useMemo(() => enabledJobs.length, [enabledJobs]);

  const pausedJobCount = useMemo(() => jobCount - enabledJobs.length, [jobCount, enabledJobs]);

  const nextScheduledRun = useMemo(() => {
    if (upcomingJobs.length === 0) return null;
    const firstJob = upcomingJobs[0];
    return firstJob?.next_run ? new Date(firstJob.next_run) : null;
  }, [upcomingJobs]);

  return {
    // State
    jobs,
    enabledJobs,
    upcomingJobs,
    isLoading,
    error,

    // Computed
    jobCount,
    activeJobCount,
    pausedJobCount,
    nextScheduledRun,

    // Actions
    listJobs,
    createJob,
    updateJob,
    deleteJob,
    enableJob,
    disableJob,
    toggleJob,
    runNow,
    getHistory,
    getNextRuns,
    getJob,
    clearError,
    refresh,
  };
}

export default useScheduler;
