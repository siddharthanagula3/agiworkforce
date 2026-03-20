/**
 * Background Tasks API
 *
 * Provides interfaces for managing persistent background tasks.
 * Uses the actual registered Rust commands:
 *   bg_submit_task, bg_cancel_task, bg_pause_task, bg_resume_task,
 *   bg_get_task_status, bg_list_tasks, bg_get_task_stats
 *   background_task_list, background_task_cancel, background_task_status (aliases)
 *   agi_extend_timeout, agi_get_timeout_status
 */

import { invoke } from '../lib/tauri-mock';

/**
 * Task fields use snake_case to match the Rust struct
 * (no `#[serde(rename_all = "camelCase")]` on Task in features/tasks/types.rs).
 */
export interface PersistentTask {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  payload: string | null;
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: { error?: string } | null;
  deadline_override_secs: number | null;
}

/**
 * TimeoutStatusResponse fields use snake_case (no rename_all in Rust).
 */
export interface TaskProgress {
  task_id: string;
  task_name: string;
  remaining_seconds: number;
  max_timeout_minutes: number;
  executed_steps: number;
  total_estimated_steps: number | null;
}

/**
 * TaskStats fields match Rust struct in features/tasks/persistence.rs.
 */
export interface TaskStats {
  total: number;
  queued: number;
  running: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
}

/**
 * List all background tasks with optional status/priority filter
 */
export const listBackgroundTasks = async (
  status?: string,
  priority?: string,
  limit?: number,
): Promise<PersistentTask[]> => {
  return invoke<PersistentTask[]>('bg_list_tasks', {
    request: {
      status: status ?? null,
      priority: priority ?? null,
      limit: limit ?? null,
    },
  });
};

/**
 * Get details for a specific task
 */
export const getBackgroundTask = async (taskId: string): Promise<PersistentTask> => {
  return invoke<PersistentTask>('bg_get_task_status', { taskId });
};

/**
 * Get timeout/progress info for a running task
 */
export const getTaskProgress = async (taskId: string): Promise<TaskProgress> => {
  return invoke<TaskProgress>('agi_get_timeout_status', { taskId });
};

/**
 * Submit a new background task
 */
export const createBackgroundTask = async (
  name: string,
  description?: string,
  priority: string = 'Normal',
  payload?: string,
): Promise<string> => {
  return invoke<string>('bg_submit_task', {
    request: {
      name,
      description: description ?? null,
      priority,
      payload: payload ?? null,
    },
  });
};

/**
 * Pause a running task
 */
export const pauseBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('bg_pause_task', { taskId });
};

/**
 * Resume a paused task
 */
export const resumeBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('bg_resume_task', { taskId });
};

/**
 * Cancel a background task
 */
export const cancelBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('bg_cancel_task', { taskId });
};

/**
 * Extend the timeout for a running task
 */
export const extendTaskTimeout = async (
  taskId: string,
  additionalMinutes: number,
): Promise<void> => {
  return invoke<void>('agi_extend_timeout', { taskId, additionalMinutes });
};

/**
 * Get aggregate task stats
 */
export const getTaskStats = async (): Promise<TaskStats> => {
  return invoke<TaskStats>('bg_get_task_stats');
};

// ============================================================================
// AGI Task Control Aliases
// ============================================================================

/**
 * Pause a running task (AGI alias)
 */
export const agiPauseTask = async (taskId: string): Promise<void> => {
  return invoke<void>('agi_pause_task', { taskId });
};

/**
 * Resume a paused task (AGI alias)
 */
export const agiResumeTask = async (taskId: string): Promise<void> => {
  return invoke<void>('agi_resume_task', { taskId });
};

/**
 * Abort a running task (AGI alias)
 */
export const agiAbortTask = async (taskId: string): Promise<void> => {
  return invoke<void>('agi_abort_task', { taskId });
};

// ============================================================================
// Frontend-Compatibility Aliases
// ============================================================================

/**
 * List background tasks using the frontend-compatibility alias command
 */
export const backgroundTaskList = async (
  status?: string,
  priority?: string,
  limit?: number,
): Promise<PersistentTask[]> => {
  return invoke<PersistentTask[]>('background_task_list', {
    request: {
      status: status ?? null,
      priority: priority ?? null,
      limit: limit ?? null,
    },
  });
};

/**
 * Cancel a task using the frontend-compatibility alias command
 */
export const backgroundTaskCancel = async (taskId: string): Promise<void> => {
  return invoke<void>('background_task_cancel', { taskId });
};

/**
 * Get task status using the frontend-compatibility alias command
 */
export const backgroundTaskStatus = async (taskId: string): Promise<PersistentTask> => {
  return invoke<PersistentTask>('background_task_status', { taskId });
};
