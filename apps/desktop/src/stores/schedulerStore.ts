// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { invoke, isTauri, listen, type UnlistenFn } from '../lib/tauri-mock';
import { getSimpleErrorMessage } from '../lib/errorMessages';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { toast } from 'sonner';

export type SchedulerActionType =
  | 'workflow'
  | 'agiTask'
  | 'shellCommand'
  | 'notification'
  | 'webhook'
  | 'script';

export type JobStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;
  actionType: SchedulerActionType;
  actionData: Record<string, unknown>;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  lastRun?: string | null;
  nextRun?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
  runCount: number;
  failureCount: number;
  description: string | null;
}

export interface NextRunInfo {
  jobId: string;
  nextRun: string;
}

export type JobExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobExecutionRecord {
  id: number;
  jobId: string;
  startedAt: string;
  completedAt: string | null;
  status: JobExecutionStatus;
  error: string | null;
  durationMs: number | null;
}

export type TaskInterval = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type TaskStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface TaskSchedule {
  type: 'once' | 'recurring';
  runAt?: number;
  interval?: TaskInterval;
  cronExpression?: string;
  timezone?: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schedule: TaskSchedule;
  status: TaskStatus;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  lastOutput: string | null;
  modelId?: string;
  createdAt: number;
}

export type CreateTaskInput = Omit<
  ScheduledTask,
  'id' | 'createdAt' | 'runCount' | 'lastRunAt' | 'nextRunAt' | 'lastOutput'
>;

export function inferTaskInterval(cronExpression: string): TaskInterval {
  const fields = cronExpression.trim().split(/\s+/);
  const normalizedFields = fields.length === 6 ? fields.slice(1) : fields;
  if (normalizedFields.length !== 5) return 'custom';

  const [minute, hour, dayOfMonth, month, dayOfWeek] = normalizedFields;
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return 'custom';

  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'hourly';
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return 'daily';
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') return 'weekly';
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') return 'monthly';
  return 'custom';
}

export function taskScheduleFromCronExpression(cronExpression: string): TaskSchedule {
  return {
    type: 'recurring',
    interval: inferTaskInterval(cronExpression),
    cronExpression,
  };
}

function computeNextRunAt(schedule: TaskSchedule): number | null {
  const now = Date.now();

  if (schedule.type === 'once') {
    if (schedule.runAt && schedule.runAt > now) {
      return schedule.runAt;
    }
    return null;
  }

  switch (schedule.interval) {
    case 'hourly':
      return now + 60 * 60 * 1000;
    case 'daily':
      return now + 24 * 60 * 60 * 1000;
    case 'weekly':
      return now + 7 * 24 * 60 * 60 * 1000;
    case 'monthly': {
      const APPROX_DAYS_PER_MONTH = 30;
      return now + APPROX_DAYS_PER_MONTH * 24 * 60 * 60 * 1000;
    }
    default:
      return null;
  }
}

const TASKS_STORAGE_KEY = 'agiworkforce-scheduled-tasks-fallback';

function persistTasksToStorage(tasks: ScheduledTask[]): void {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // ignore storage errors
  }
}

function loadTasksFromStorage(): ScheduledTask[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScheduledTask[]) : [];
  } catch {
    return [];
  }
}

const INTERVAL_LABELS: Record<TaskInterval, string> = {
  hourly: 'Every hour',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
  custom: 'Custom schedule',
};

export function getScheduleSummary(schedule: TaskSchedule): string {
  if (schedule.type === 'once') {
    if (schedule.runAt) {
      return `Once: ${new Date(schedule.runAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    return 'Run once (no time set)';
  }
  if (schedule.interval === 'custom' && schedule.cronExpression) {
    return `Custom: ${schedule.cronExpression}`;
  }
  return INTERVAL_LABELS[schedule.interval ?? 'daily'];
}

export function getRelativeTimeDisplay(timestamp: number | null): string {
  if (timestamp === null) return 'Never';
  const diff = timestamp - Date.now();
  const absDiff = Math.abs(diff);
  const past = diff < 0;

  const seconds = Math.floor(absDiff / 1000);
  if (seconds < 60) return past ? 'just now' : 'in a moment';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return past ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return past ? `${days}d ago` : `in ${days}d`;
}

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const SCHEDULER_STORE_VERSION = 1;

interface SchedulerState {
  jobs: ScheduledJob[];
  isLoading: boolean;
  error: string | null;

  addJob: (
    name: string,
    schedule: string,
    actionType: string,
    actionData: string,
  ) => Promise<string>;
  removeJob: (jobId: string) => Promise<boolean>;
  pauseJob: (jobId: string) => Promise<boolean>;
  resumeJob: (jobId: string) => Promise<boolean>;
  listJobs: () => Promise<void>;
  getJob: (jobId: string) => Promise<ScheduledJob | null>;
  getHistory: (jobId?: string) => Promise<JobExecutionRecord[]>;
  getNextRuns: (limit?: number) => Promise<NextRunInfo[]>;
  toggleJob: (jobId: string) => Promise<boolean>;
  runJobNow: (jobId: string) => Promise<boolean>;
  updateJobOnBackend: (
    jobId: string,
    updates: {
      name?: string;
      description?: string;
      schedule?: unknown;
      status?: string;
      prompt?: string;
    },
  ) => Promise<boolean>;
  updateJob: (job: ScheduledJob) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  _unlistenFns: UnlistenFn[];
  initEventListeners: () => Promise<void>;
  cleanupEventListeners: () => void;

  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  tasks: ScheduledTask[];
  createTask: (task: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, updates: Partial<ScheduledTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  runNow: (id: string) => Promise<void>;
  fetchTasks: () => Promise<void>;
}

export const useSchedulerStore = create<SchedulerState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        jobs: [],
        isLoading: false,
        error: null,
        _unlistenFns: [],
        _hasHydrated: false,

        tasks: [],

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state }, undefined, 'scheduler/setHasHydrated');
        },

        addJob: async (
          name: string,
          schedule: string,
          actionType: string,
          actionData: string,
        ): Promise<string> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/addJob/start');

          try {
            let parsedActionData: Record<string, unknown> | undefined;
            try {
              parsedActionData = actionData
                ? (JSON.parse(actionData) as Record<string, unknown>)
                : undefined;
            } catch {
              parsedActionData = actionData ? { raw: actionData } : undefined;
            }

            const jobId = await invoke<string>('scheduler_add_job', {
              name,
              schedule,
              actionType,
              actionData: parsedActionData,
            });

            await get().listJobs();

            set({ isLoading: false }, undefined, 'scheduler/addJob/success');
            toast.success('Scheduled job created');
            return jobId;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to add job:', error);
            set({ error: errorMessage, isLoading: false }, undefined, 'scheduler/addJob/error');
            toast.error(`Failed to create job: ${errorMessage}`);
            throw error;
          }
        },

        removeJob: async (jobId: string): Promise<boolean> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/removeJob/start');

          try {
            const success = await invoke<boolean>('scheduler_remove_job', { jobId });

            if (success) {
              set(
                (state) => ({
                  jobs: state.jobs.filter((job) => job.id !== jobId),
                  isLoading: false,
                }),
                undefined,
                'scheduler/removeJob/success',
              );
              toast.success('Job removed');
            } else {
              set({ isLoading: false }, undefined, 'scheduler/removeJob/notFound');
              toast.error('Job not found');
            }

            return success;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to remove job:', error);
            set({ error: errorMessage, isLoading: false }, undefined, 'scheduler/removeJob/error');
            toast.error(`Failed to remove job: ${errorMessage}`);
            throw error;
          }
        },

        pauseJob: async (jobId: string): Promise<boolean> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/pauseJob/start');

          try {
            const success = await invoke<boolean>('scheduler_pause_job', { jobId });

            if (success) {
              set(
                (state) => ({
                  jobs: state.jobs.map((job) =>
                    job.id === jobId ? { ...job, enabled: false } : job,
                  ),
                  isLoading: false,
                }),
                undefined,
                'scheduler/pauseJob/success',
              );
            } else {
              set({ isLoading: false }, undefined, 'scheduler/pauseJob/notFound');
            }

            return success;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to pause job:', error);
            set({ error: errorMessage, isLoading: false }, undefined, 'scheduler/pauseJob/error');
            toast.error(`Failed to pause job: ${errorMessage}`);
            throw error;
          }
        },

        resumeJob: async (jobId: string): Promise<boolean> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/resumeJob/start');

          try {
            const success = await invoke<boolean>('scheduler_resume_job', { jobId });

            if (success) {
              set(
                (state) => ({
                  jobs: state.jobs.map((job) =>
                    job.id === jobId ? { ...job, enabled: true } : job,
                  ),
                  isLoading: false,
                }),
                undefined,
                'scheduler/resumeJob/success',
              );
            } else {
              set({ isLoading: false }, undefined, 'scheduler/resumeJob/notFound');
            }

            return success;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to resume job:', error);
            set({ error: errorMessage, isLoading: false }, undefined, 'scheduler/resumeJob/error');
            toast.error(`Failed to resume job: ${errorMessage}`);
            throw error;
          }
        },

        listJobs: async (): Promise<void> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/listJobs/start');

          try {
            const jobs = await invoke<ScheduledJob[]>('scheduler_list_jobs');

            set({ jobs, isLoading: false }, undefined, 'scheduler/listJobs/success');
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to list jobs:', error);
            set(
              { error: errorMessage, isLoading: false, jobs: [] },
              undefined,
              'scheduler/listJobs/error',
            );
            throw error;
          }
        },

        getJob: async (jobId: string): Promise<ScheduledJob | null> => {
          try {
            const job = await invoke<ScheduledJob | null>('scheduler_get_job', { jobId });
            return job ?? null;
          } catch (error) {
            console.error('[schedulerStore] Failed to get job:', error);
            throw error;
          }
        },

        // The backend records every run into execution_history; without this
        // there is no way to read it back, so a failed overnight job is
        // invisible in the app.
        getHistory: async (jobId?: string): Promise<JobExecutionRecord[]> => {
          try {
            const history = await invoke<JobExecutionRecord[]>('scheduler_get_history', {
              jobId: jobId ?? null,
            });
            return history;
          } catch (error) {
            console.error('[schedulerStore] Failed to get execution history:', error);
            throw error;
          }
        },

        getNextRuns: async (limit?: number): Promise<NextRunInfo[]> => {
          try {
            const nextRuns = await invoke<NextRunInfo[]>('scheduler_get_next_runs', {
              limit: limit ?? 10,
            });
            return nextRuns;
          } catch (error) {
            console.error('[schedulerStore] Failed to get next runs:', error);
            throw error;
          }
        },

        toggleJob: async (jobId: string): Promise<boolean> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/toggleJob/start');

          try {
            const success = await invoke<boolean>('scheduler_toggle_job', { id: jobId });

            if (success) {
              set(
                (state) => ({
                  jobs: state.jobs.map((job) =>
                    job.id === jobId
                      ? {
                          ...job,
                          status: (job.status === 'active' ? 'paused' : 'active') as JobStatus,
                        }
                      : job,
                  ),
                  isLoading: false,
                }),
                undefined,
                'scheduler/toggleJob/success',
              );
              toast.success('Job toggled');
            } else {
              set({ isLoading: false }, undefined, 'scheduler/toggleJob/notFound');
              toast.error('Job not found');
            }

            return success;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to toggle job:', error);
            set({ error: errorMessage, isLoading: false }, undefined, 'scheduler/toggleJob/error');
            toast.error(`Failed to toggle job: ${errorMessage}`);
            throw error;
          }
        },

        runJobNow: async (jobId: string): Promise<boolean> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/runJobNow/start');

          try {
            const success = await invoke<boolean>('scheduler_run_job_now', { id: jobId });

            set({ isLoading: false }, undefined, 'scheduler/runJobNow/success');

            if (success) {
              toast.success('Job triggered');
              await get().listJobs();
            } else {
              toast.error('Job not found');
            }

            return success;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to run job:', error);
            set({ error: errorMessage, isLoading: false }, undefined, 'scheduler/runJobNow/error');
            toast.error(`Failed to run job: ${errorMessage}`);
            throw error;
          }
        },

        updateJobOnBackend: async (
          jobId: string,
          updates: {
            name?: string;
            description?: string;
            schedule?: unknown;
            status?: string;
            prompt?: string;
          },
        ): Promise<boolean> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/updateJobOnBackend/start');

          try {
            const success = await invoke<boolean>('scheduler_update_job', {
              id: jobId,
              updates,
            });

            if (success) {
              await get().listJobs();
              toast.success('Job updated');
            } else {
              set({ isLoading: false }, undefined, 'scheduler/updateJobOnBackend/notFound');
              toast.error('Job not found');
            }

            return success;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to update job:', error);
            set(
              { error: errorMessage, isLoading: false },
              undefined,
              'scheduler/updateJobOnBackend/error',
            );
            toast.error(`Failed to update job: ${errorMessage}`);
            throw error;
          }
        },

        updateJob: (job: ScheduledJob) => {
          set(
            (state) => ({
              jobs: state.jobs.map((j) => (j.id === job.id ? job : j)),
            }),
            undefined,
            'scheduler/updateJob',
          );
        },

        setError: (error: string | null) => {
          set({ error }, undefined, 'scheduler/setError');
        },

        clearError: () => {
          if (get().error) {
            set({ error: null }, undefined, 'scheduler/clearError');
          }
        },

        initEventListeners: async (): Promise<void> => {
          const unlistenFns: UnlistenFn[] = [];

          try {
            const unlistenJobExecuted = await listen<ScheduledJob>(
              'scheduler:job_executed',
              (event) => {
                console.debug('[schedulerStore] Job executed:', event.payload);
                get().updateJob(event.payload);
              },
            );
            unlistenFns.push(unlistenJobExecuted);

            const unlistenJobAdded = await listen<ScheduledJob>('scheduler:job_added', (event) => {
              console.debug('[schedulerStore] Job added:', event.payload);
              set(
                (state) => {
                  if (state.jobs.some((j) => j.id === event.payload.id)) {
                    return state;
                  }
                  return { jobs: [...state.jobs, event.payload] };
                },
                undefined,
                'scheduler/event/jobAdded',
              );
            });
            unlistenFns.push(unlistenJobAdded);

            const unlistenJobRemoved = await listen<{ jobId: string }>(
              'scheduler:job_removed',
              (event) => {
                console.debug('[schedulerStore] Job removed:', event.payload);
                set(
                  (state) => ({
                    jobs: state.jobs.filter((j) => j.id !== event.payload.jobId),
                  }),
                  undefined,
                  'scheduler/event/jobRemoved',
                );
              },
            );
            unlistenFns.push(unlistenJobRemoved);

            const unlistenJobUpdated = await listen<ScheduledJob>(
              'scheduler:job_updated',
              (event) => {
                console.debug('[schedulerStore] Job updated:', event.payload);
                get().updateJob(event.payload);
              },
            );
            unlistenFns.push(unlistenJobUpdated);

            const unlistenError = await listen<{ jobId: string; error: string }>(
              'scheduler:error',
              (event) => {
                console.error('[schedulerStore] Scheduler error:', event.payload);
                get().setError(`Job ${event.payload.jobId} failed: ${event.payload.error}`);
              },
            );
            unlistenFns.push(unlistenError);

            set({ _unlistenFns: unlistenFns }, undefined, 'scheduler/initEventListeners');
          } catch (error) {
            console.error('[schedulerStore] Failed to initialize event listeners:', error);
            unlistenFns.forEach((fn) => fn());
            throw error;
          }
        },

        cleanupEventListeners: () => {
          const { _unlistenFns } = get();
          _unlistenFns.forEach((fn) => fn());
          set({ _unlistenFns: [] }, undefined, 'scheduler/cleanupEventListeners');
        },

        fetchTasks: async () => {
          set({ isLoading: true }, undefined, 'scheduler/fetchTasks/start');
          try {
            const jobs = await invoke<ScheduledJob[]>('scheduler_list_jobs');
            const tasks: ScheduledTask[] = jobs.map((job) => ({
              id: job.id,
              name: job.name,
              description: job.description ?? '',
              prompt: ((job.actionData as Record<string, unknown>)?.['prompt'] as string) ?? '',
              schedule: taskScheduleFromCronExpression(job.schedule),
              status: job.status as TaskStatus,
              lastRunAt: job.lastExecutedAt
                ? new Date(job.lastExecutedAt).getTime()
                : job.lastRun
                  ? new Date(job.lastRun).getTime()
                  : null,
              nextRunAt: job.nextExecutionAt
                ? new Date(job.nextExecutionAt).getTime()
                : job.nextRun
                  ? new Date(job.nextRun).getTime()
                  : null,
              runCount: job.runCount,
              lastOutput: null,
              createdAt: new Date(job.createdAt).getTime(),
            }));
            set(
              { tasks, isLoading: false, error: null },
              undefined,
              'scheduler/fetchTasks/success',
            );
          } catch (error) {
            if (isTauri) {
              const errorMessage = getSimpleErrorMessage(error);
              console.error('[schedulerStore] Failed to fetch tasks from backend:', error);
              set(
                { error: errorMessage, isLoading: false },
                undefined,
                'scheduler/fetchTasks/error',
              );
              return;
            }
            const tasks = loadTasksFromStorage();
            set({ tasks, isLoading: false }, undefined, 'scheduler/fetchTasks/fallback');
          }
        },

        createTask: async (input: CreateTaskInput) => {
          try {
            await invoke<string>('scheduler_add_job', {
              name: input.name,
              prompt: input.prompt,
              schedule: input.schedule,
            });
            await get().fetchTasks();
          } catch (error) {
            if (isTauri) {
              const errorMessage = getSimpleErrorMessage(error);
              console.error('[schedulerStore] Failed to create task on backend:', error);
              set({ error: errorMessage }, undefined, 'scheduler/createTask/error');
              toast.error(`Failed to create task: ${errorMessage}`);
              throw error;
            }
            const now = Date.now();
            const newTask: ScheduledTask = {
              ...input,
              id: crypto.randomUUID(),
              createdAt: now,
              runCount: 0,
              lastRunAt: null,
              nextRunAt: computeNextRunAt(input.schedule),
              lastOutput: null,
            };
            set(
              (state) => {
                const tasks = [newTask, ...state.tasks];
                persistTasksToStorage(tasks);
                return { tasks };
              },
              undefined,
              'scheduler/createTask/fallback',
            );
          }
        },

        updateTask: async (id: string, updates: Partial<ScheduledTask>) => {
          try {
            await invoke('scheduler_update_job', { id, updates });
            await get().fetchTasks();
          } catch (error) {
            if (isTauri) {
              const errorMessage = getSimpleErrorMessage(error);
              console.error('[schedulerStore] Failed to update task on backend:', error);
              set({ error: errorMessage }, undefined, 'scheduler/updateTask/error');
              toast.error(`Failed to update task: ${errorMessage}`);
              throw error;
            }
            set(
              (state) => {
                const tasks = state.tasks.map((t) =>
                  t.id === id
                    ? {
                        ...t,
                        ...updates,
                        nextRunAt:
                          updates.schedule != null
                            ? computeNextRunAt(updates.schedule)
                            : t.nextRunAt,
                      }
                    : t,
                );
                persistTasksToStorage(tasks);
                return { tasks };
              },
              undefined,
              'scheduler/updateTask/fallback',
            );
          }
        },

        deleteTask: async (id: string) => {
          try {
            await invoke('scheduler_remove_job', { jobId: id });
            await get().fetchTasks();
          } catch (error) {
            if (isTauri) {
              const errorMessage = getSimpleErrorMessage(error);
              console.error('[schedulerStore] Failed to delete task on backend:', error);
              set({ error: errorMessage }, undefined, 'scheduler/deleteTask/error');
              toast.error(`Failed to delete task: ${errorMessage}`);
              throw error;
            }
            set(
              (state) => {
                const tasks = state.tasks.filter((t) => t.id !== id);
                persistTasksToStorage(tasks);
                return { tasks };
              },
              undefined,
              'scheduler/deleteTask/fallback',
            );
          }
        },

        toggleTask: async (id: string) => {
          const task = get().tasks.find((t) => t.id === id);
          if (!task) return;

          const newStatus: TaskStatus = task.status === 'active' ? 'paused' : 'active';

          try {
            await invoke('scheduler_toggle_job', { id });
            await get().fetchTasks();
          } catch (error) {
            if (isTauri) {
              const errorMessage = getSimpleErrorMessage(error);
              console.error('[schedulerStore] Failed to toggle task on backend:', error);
              set({ error: errorMessage }, undefined, 'scheduler/toggleTask/error');
              toast.error(`Failed to toggle task: ${errorMessage}`);
              throw error;
            }
            set(
              (state) => {
                const tasks = state.tasks.map((t) =>
                  t.id === id ? { ...t, status: newStatus } : t,
                );
                persistTasksToStorage(tasks);
                return { tasks };
              },
              undefined,
              'scheduler/toggleTask/fallback',
            );
          }
        },

        runNow: async (id: string) => {
          try {
            await invoke('scheduler_run_job_now', { id });
            await get().fetchTasks();
          } catch (error) {
            if (isTauri) {
              const errorMessage = getSimpleErrorMessage(error);
              console.error('[schedulerStore] Failed to run task on backend:', error);
              set({ error: errorMessage }, undefined, 'scheduler/runNow/error');
              toast.error(`Failed to run task: ${errorMessage}`);
              throw error;
            }
            const now = Date.now();
            set(
              (state) => {
                const tasks = state.tasks.map((t) =>
                  t.id === id
                    ? {
                        ...t,
                        lastRunAt: now,
                        runCount: t.runCount + 1,
                        nextRunAt: computeNextRunAt(t.schedule),
                      }
                    : t,
                );
                persistTasksToStorage(tasks);
                return { tasks };
              },
              undefined,
              'scheduler/runNow/fallback',
            );
          }
        },
      })),
      {
        name: 'agiworkforce-scheduler',
        version: SCHEDULER_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) =>
          isTauri ? { jobs: state.jobs } : { jobs: state.jobs, tasks: state.tasks },
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<SchedulerState> | undefined;
          return {
            ...currentState,
            jobs: persisted?.jobs ?? currentState.jobs,
            tasks: isTauri ? currentState.tasks : (persisted?.tasks ?? currentState.tasks),
          };
        },
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            console.debug('[SchedulerStore] Rehydration complete');
          }
        },
      },
    ),
    { name: 'SchedulerStore', enabled: import.meta.env.DEV },
  ),
);

export function waitForSchedulerHydration(): Promise<void> {
  return new Promise((resolve) => {
    const state = useSchedulerStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useSchedulerStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}

export const selectJobs = (state: SchedulerState) => state.jobs;
export const selectEnabledJobs = (state: SchedulerState) =>
  state.jobs.filter((job) => job.status === 'active');
export const selectDisabledJobs = (state: SchedulerState) =>
  state.jobs.filter((job) => job.status !== 'active');
export const selectJobById = (jobId: string) => (state: SchedulerState) =>
  state.jobs.find((job) => job.id === jobId);
export const selectJobsByActionType =
  (actionType: SchedulerActionType) => (state: SchedulerState) =>
    state.jobs.filter((job) => job.actionType === actionType);

export const selectSchedulerLoading = (state: SchedulerState) => state.isLoading;
export const selectSchedulerError = (state: SchedulerState) => state.error;
export const selectSchedulerHasHydrated = (state: SchedulerState) => state._hasHydrated;

export const selectJobCount = (state: SchedulerState) => state.jobs.length;
export const selectEnabledJobCount = (state: SchedulerState) =>
  state.jobs.filter((job) => job.status === 'active').length;

export const selectUpcomingJobs = (state: SchedulerState) =>
  [...state.jobs]
    .filter((job) => job.status === 'active' && job.nextRun)
    .sort((a, b) => {
      if (!a.nextRun) return 1;
      if (!b.nextRun) return -1;
      return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime();
    });

export const selectTasks = (state: SchedulerState) => state.tasks;
export const selectActiveTasks = (state: SchedulerState) =>
  state.tasks.filter((t) => t.status === 'active');
export const selectTaskById = (id: string) => (state: SchedulerState) =>
  state.tasks.find((t) => t.id === id);

export { useSchedulerStore as useScheduledTaskStore };

/** @deprecated Use SchedulerActionType instead */
export type ActionType = SchedulerActionType;
/** @deprecated No longer needed — jobs use a cron string `schedule` field */
export type ScheduleType = 'cron' | 'interval' | 'once';
