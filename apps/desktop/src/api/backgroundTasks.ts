
import { invoke } from '../lib/tauri-mock';

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

export interface TaskProgress {
  task_id: string;
  task_name: string;
  remaining_seconds: number;
  max_timeout_minutes: number;
  executed_steps: number;
  total_estimated_steps: number | null;
}

export interface TaskStats {
  total: number;
  queued: number;
  running: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
}

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

export const getBackgroundTask = async (taskId: string): Promise<PersistentTask> => {
  return invoke<PersistentTask>('bg_get_task_status', { taskId });
};

export const getTaskProgress = async (taskId: string): Promise<TaskProgress> => {
  return invoke<TaskProgress>('agi_get_timeout_status', { taskId });
};

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

export const pauseBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('bg_pause_task', { taskId });
};

export const resumeBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('bg_resume_task', { taskId });
};

export const cancelBackgroundTask = async (taskId: string): Promise<void> => {
  return invoke<void>('bg_cancel_task', { taskId });
};

export const extendTaskTimeout = async (
  taskId: string,
  additionalMinutes: number,
): Promise<void> => {
  return invoke<void>('agi_extend_timeout', { taskId, additionalMinutes });
};

export const getTaskStats = async (): Promise<TaskStats> => {
  return invoke<TaskStats>('bg_get_task_stats');
};

export const agiPauseTask = async (taskId: string): Promise<void> => {
  return invoke<void>('agi_pause_task', { taskId });
};

export const agiResumeTask = async (taskId: string): Promise<void> => {
  return invoke<void>('agi_resume_task', { taskId });
};

export const agiAbortTask = async (taskId: string): Promise<void> => {
  return invoke<void>('agi_abort_task', { taskId });
};

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

export const backgroundTaskCancel = async (taskId: string): Promise<void> => {
  return invoke<void>('background_task_cancel', { taskId });
};

export const backgroundTaskStatus = async (taskId: string): Promise<PersistentTask> => {
  return invoke<PersistentTask>('background_task_status', { taskId });
};
