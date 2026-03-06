/**
 * Background Tasks API
 *
 * Provides interfaces for managing persistent background tasks.
 */

import { invoke } from '../lib/tauri-mock';

export interface PersistentTask {
  id: string;
  description: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  timeoutSecs: number;
  elapsedSecs: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  priority: number; // 0-3
  notes?: string;
}

export interface TaskProgress {
  taskId: string;
  status: string;
  progressPercent: number;
  currentStep: number;
  totalSteps: number;
  elapsedSecs: number;
  estimatedRemainingSecs?: number;
}

/**
 * List all background tasks with optional status filter
 */
export const listBackgroundTasks = async (status?: string): Promise<PersistentTask[]> => {
  return invoke<PersistentTask[]>('background_tasks_list', { status });
};

/**
 * Get details for a specific task
 */
export const getBackgroundTask = async (taskId: string): Promise<PersistentTask | null> => {
  return invoke<PersistentTask | null>('background_tasks_get', { taskId });
};

/**
 * Get progress for a running task
 */
export const getTaskProgress = async (taskId: string): Promise<TaskProgress> => {
  return invoke<TaskProgress>('background_tasks_get_progress', { taskId });
};

/**
 * Create a new background task
 */
export const createBackgroundTask = async (
  description: string,
  timeoutMinutes: number,
  priority?: number,
): Promise<string> => {
  return invoke<string>('background_tasks_create', {
    description,
    timeoutMinutes,
    priority: priority ?? 1,
  });
};

/**
 * Pause a running task
 */
export const pauseBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('background_tasks_pause', { taskId });
};

/**
 * Resume a paused task
 */
export const resumeBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('background_tasks_resume', { taskId });
};

/**
 * Cancel a background task
 */
export const cancelBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('background_tasks_cancel', { taskId });
};

/**
 * Extend the timeout for a running task
 */
export const extendTaskTimeout = async (
  taskId: string,
  additionalMinutes: number,
): Promise<void> => {
  return invoke<void>('background_tasks_extend_timeout', {
    taskId,
    additionalMinutes,
  });
};

/**
 * Get task history (completed/failed tasks)
 */
export const getTaskHistory = async (limitDays?: number): Promise<PersistentTask[]> => {
  return invoke<PersistentTask[]>('background_tasks_history', { limitDays });
};

/**
 * Delete a task from history
 */
export const deleteBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('background_tasks_delete', { taskId });
};

/**
 * Get list of tasks that can be resumed on app restart
 */
export const getResumableTasks = async (): Promise<PersistentTask[]> => {
  return invoke<PersistentTask[]>('background_tasks_resumable');
};

/**
 * Resume all resumable tasks automatically
 */
export const resumeAllTasks = async (): Promise<string[]> => {
  return invoke<string[]>('background_tasks_resume_all');
};
