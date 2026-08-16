// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';
import { toast } from 'sonner';
import { useSettingsStore, selectEnableTimeoutWarnings } from './settingsStore';

export type TaskStatus = 'Queued' | 'Running' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled';
export type TaskPriority = 'Low' | 'Normal' | 'High';

export interface Task {
  id: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  payload: string | null;
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: { error?: string } | null;
  deadline_override_secs: number | null;
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

export interface TimeoutStatus {
  task_id: string;
  task_name: string;
  remaining_seconds: number;
  max_timeout_minutes: number;
  executed_steps: number;
  total_estimated_steps: number | null;
}

export interface TimeoutConfig {
  max_duration_secs: number;
  enable_warnings: boolean;
  enable_checkpoint_on_timeout: boolean;
}

export interface SubmitTaskRequest {
  name: string;
  description?: string;
  priority: TaskPriority;
  payload?: string;
}

export interface ListTasksRequest {
  status?: TaskStatus;
  priority?: TaskPriority;
  limit?: number;
}

interface BackgroundTaskStoreState {
  tasks: Task[];
  stats: TaskStats | null;
  timeoutConfig: TimeoutConfig | null;
  isLoading: boolean;
  error: string | null;

  submitTask: (request: SubmitTaskRequest) => Promise<string | null>;
  cancelTask: (taskId: string) => Promise<boolean>;
  pauseTask: (taskId: string) => Promise<boolean>;
  resumeTask: (taskId: string) => Promise<boolean>;
  getTaskStatus: (taskId: string) => Promise<Task | null>;
  listTasks: (request?: ListTasksRequest) => Promise<Task[]>;
  fetchStats: () => Promise<TaskStats | null>;

  getTimeoutStatus: (taskId: string) => Promise<TimeoutStatus | null>;
  extendTimeout: (taskId: string, additionalMinutes: number) => Promise<boolean>;
  fetchTimeoutConfig: () => Promise<TimeoutConfig | null>;
  setTimeoutConfig: (config: TimeoutConfig) => Promise<boolean>;
  getRecommendedTimeout: (taskType: string) => Promise<number | null>;

  clearError: () => void;
}

export const useBackgroundTaskStore = create<BackgroundTaskStoreState>()(
  devtools(
    immer((set) => ({
      tasks: [],
      stats: null,
      timeoutConfig: null,
      isLoading: false,
      error: null,

      submitTask: async (request) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'bgTask/submit/start',
        );
        try {
          const taskId = await invoke<string>('bg_submit_task', { request });
          set(
            (state) => {
              state.isLoading = false;
            },
            undefined,
            'bgTask/submit/done',
          );
          toast.success(`Task submitted: ${request.name}`);
          return taskId;
        } catch (err) {
          const msg = String(err);
          set(
            (state) => {
              state.error = msg;
              state.isLoading = false;
            },
            undefined,
            'bgTask/submit/error',
          );
          toast.error(`Failed to submit task: ${msg}`);
          return null;
        }
      },

      cancelTask: async (taskId) => {
        try {
          await invoke('bg_cancel_task', { taskId });
          set(
            (state) => {
              const task = state.tasks.find((t) => t.id === taskId);
              if (task) task.status = 'Cancelled';
            },
            undefined,
            'bgTask/cancel/done',
          );
          toast.info('Task cancelled');
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/cancel/error',
          );
          toast.error(`Failed to cancel task: ${err}`);
          return false;
        }
      },

      pauseTask: async (taskId) => {
        try {
          await invoke('bg_pause_task', { taskId });
          set(
            (state) => {
              const task = state.tasks.find((t) => t.id === taskId);
              if (task) task.status = 'Paused';
            },
            undefined,
            'bgTask/pause/done',
          );
          toast.success('Task paused');
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/pause/error',
          );
          toast.error(`Failed to pause task: ${err}`);
          return false;
        }
      },

      resumeTask: async (taskId) => {
        try {
          await invoke('bg_resume_task', { taskId });
          set(
            (state) => {
              const task = state.tasks.find((t) => t.id === taskId);
              if (task) task.status = 'Running';
            },
            undefined,
            'bgTask/resume/done',
          );
          toast.success('Task resumed');
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/resume/error',
          );
          toast.error(`Failed to resume task: ${err}`);
          return false;
        }
      },

      getTaskStatus: async (taskId) => {
        try {
          const task = await invoke<Task>('bg_get_task_status', { taskId });
          set(
            (state) => {
              const idx = state.tasks.findIndex((t) => t.id === taskId);
              if (idx !== -1) {
                state.tasks[idx] = task;
              }
            },
            undefined,
            'bgTask/getStatus/done',
          );
          return task;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/getStatus/error',
          );
          return null;
        }
      },

      listTasks: async (request) => {
        set(
          (state) => {
            state.isLoading = true;
          },
          undefined,
          'bgTask/list/start',
        );
        try {
          const tasks = await invoke<Task[]>('bg_list_tasks', {
            request: {
              status: request?.status ?? null,
              priority: request?.priority ?? null,
              limit: request?.limit ?? null,
            },
          });
          set(
            (state) => {
              state.tasks = tasks;
              state.isLoading = false;
            },
            undefined,
            'bgTask/list/done',
          );
          return tasks;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
              state.isLoading = false;
            },
            undefined,
            'bgTask/list/error',
          );
          return [];
        }
      },

      fetchStats: async () => {
        try {
          const stats = await invoke<TaskStats>('bg_get_task_stats');
          set(
            (state) => {
              state.stats = stats;
            },
            undefined,
            'bgTask/stats/done',
          );
          return stats;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/stats/error',
          );
          return null;
        }
      },

      getTimeoutStatus: async (taskId) => {
        try {
          const status = await invoke<TimeoutStatus>('agi_get_timeout_status', { taskId });
          return status;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/timeoutStatus/error',
          );
          return null;
        }
      },

      extendTimeout: async (taskId, additionalMinutes) => {
        try {
          await invoke('agi_extend_timeout', { taskId, additionalMinutes });
          toast.success(`Timeout extended by ${additionalMinutes} minutes`);
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/extendTimeout/error',
          );
          toast.error(`Failed to extend timeout: ${err}`);
          return false;
        }
      },

      fetchTimeoutConfig: async () => {
        try {
          const config = await invoke<TimeoutConfig>('timeout_get_config');
          set(
            (state) => {
              state.timeoutConfig = config;
            },
            undefined,
            'bgTask/timeoutConfig/done',
          );
          return config;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/timeoutConfig/error',
          );
          return null;
        }
      },

      setTimeoutConfig: async (config) => {
        try {
          await invoke('timeout_set_config', { config });
          set(
            (state) => {
              state.timeoutConfig = config;
            },
            undefined,
            'bgTask/setTimeoutConfig/done',
          );
          return true;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/setTimeoutConfig/error',
          );
          return false;
        }
      },

      getRecommendedTimeout: async (taskType) => {
        try {
          const secs = await invoke<number>('timeout_get_recommended', { taskType });
          return secs;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'bgTask/recommended/error',
          );
          return null;
        }
      },

      clearError: () =>
        set(
          (state) => {
            state.error = null;
          },
          undefined,
          'bgTask/clearError',
        ),
    })),
    { name: 'BackgroundTaskStore', enabled: import.meta.env.DEV },
  ),
);

let _generation = 0;
let _listenerCleanup: (() => void) | null = null;

export function subscribeToTimeoutWarnings(): () => void {
  if (_listenerCleanup) {
    _listenerCleanup();
  }

  const myGeneration = ++_generation;
  const unlisteners: Promise<UnlistenFn>[] = [];

  unlisteners.push(
    listen<{
      taskId: string;
      taskName: string;
      remainingSeconds: number;
      maxTimeoutMinutes: number;
    }>('agi:timeout_warning', (event) => {
      if (_generation !== myGeneration) return;
      if (!selectEnableTimeoutWarnings(useSettingsStore.getState())) return;
      const { taskName, remainingSeconds } = event.payload;
      const mins = Math.ceil(remainingSeconds / 60);
      toast.warning(`Task "${taskName}" has ${mins}min remaining before timeout`, {
        duration: 10000,
      });
    }),
  );

  const cleanup = () => {
    if (_generation === myGeneration) {
      _generation++;
    }
    unlisteners.forEach((p) =>
      p
        .then((fn) => fn())
        .catch((err) => console.warn('[backgroundTaskStore] Unlisten failed:', err)),
    );
    _listenerCleanup = null;
  };

  _listenerCleanup = cleanup;
  return cleanup;
}

export const selectAllTasks = (state: BackgroundTaskStoreState) => state.tasks;
export const selectTaskStats = (state: BackgroundTaskStoreState) => state.stats;
export const selectTimeoutConfig = (state: BackgroundTaskStoreState) => state.timeoutConfig;
export const selectTaskLoading = (state: BackgroundTaskStoreState) => state.isLoading;
export const selectTaskError = (state: BackgroundTaskStoreState) => state.error;
export const selectRunningTasks = (state: BackgroundTaskStoreState) =>
  state.tasks.filter((t) => t.status === 'Running');
export const selectQueuedTasks = (state: BackgroundTaskStoreState) =>
  state.tasks.filter((t) => t.status === 'Queued');
export const selectActiveTasks = (state: BackgroundTaskStoreState) =>
  state.tasks.filter((t) => t.status === 'Running' || t.status === 'Queued');
