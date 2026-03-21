/**
 * Scheduler Store
 *
 * Manages scheduled jobs and tasks for automated actions including briefings,
 * reminders, agent tasks, and custom actions.
 *
 * This is the single consolidated scheduler store. It was merged from the former
 * scheduledTaskStore (task-oriented, UI-friendly) and the original schedulerStore
 * (job-oriented, Tauri-event-driven). Both called the same Rust scheduler commands,
 * creating duplicate state and potential race conditions.
 *
 * Uses Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version
 * - Tauri event subscription for real-time job updates
 */
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';
import { getSimpleErrorMessage } from '../lib/errorMessages';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { toast } from 'sonner';

// ============================================================================
// Types — Job-oriented (backend wire format)
// ============================================================================

/** Action types matching Rust SchedulerActionType (serde rename_all = "camelCase") */
export type SchedulerActionType =
  | 'workflow'
  | 'agiTask'
  | 'shellCommand'
  | 'notification'
  | 'webhook'
  | 'script';

/** Job status matching Rust JobStatus (serde rename_all = "camelCase") */
export type JobStatus = 'active' | 'paused' | 'completed' | 'failed';

/** Matches Rust ScheduledJob struct wire format (serde rename_all = "camelCase") */
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

// ============================================================================
// Types — Task-oriented (UI-friendly, formerly in scheduledTaskStore)
// ============================================================================

export type TaskInterval = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type TaskStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface TaskSchedule {
  type: 'once' | 'recurring';
  runAt?: number; // Unix timestamp (ms) for 'once'
  interval?: TaskInterval;
  cronExpression?: string; // for 'custom' interval
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

// ============================================================================
// Task helper utilities (formerly in scheduledTaskStore)
// ============================================================================

/** Compute the next run timestamp from a schedule (client-side approximation). */
function computeNextRunAt(schedule: TaskSchedule): number | null {
  const now = Date.now();

  if (schedule.type === 'once') {
    if (schedule.runAt && schedule.runAt > now) {
      return schedule.runAt;
    }
    return null;
  }

  // recurring
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

/** Persist scheduled tasks to localStorage as a fallback when Tauri isn't available. */
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

// ============================================================================
// Storage fallback for SSR
// ============================================================================

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

// ============================================================================
// Store version for migrations
// ============================================================================

const SCHEDULER_STORE_VERSION = 1;

// ============================================================================
// Combined store state interface
// ============================================================================

interface SchedulerState {
  // ── Job state (backend wire format) ──────────────────────────────────────
  jobs: ScheduledJob[];
  isLoading: boolean;
  error: string | null;

  // Job actions
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

  // Event listener management
  _unlistenFns: UnlistenFn[];
  initEventListeners: () => Promise<void>;
  cleanupEventListeners: () => void;

  // Hydration tracking
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // ── Task state (UI-friendly, formerly scheduledTaskStore) ─────────────────
  tasks: ScheduledTask[];
  createTask: (task: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, updates: Partial<ScheduledTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  runNow: (id: string) => Promise<void>;
  fetchTasks: () => Promise<void>;
}

// ============================================================================
// Store implementation
// ============================================================================

export const useSchedulerStore = create<SchedulerState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // ── Job state ──────────────────────────────────────────────────────
        jobs: [],
        isLoading: false,
        error: null,
        _unlistenFns: [],
        _hasHydrated: false,

        // ── Task state ─────────────────────────────────────────────────────
        tasks: [],

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state }, undefined, 'scheduler/setHasHydrated');
        },

        // ── Job actions ────────────────────────────────────────────────────

        addJob: async (
          name: string,
          schedule: string,
          actionType: string,
          actionData: string,
        ): Promise<string> => {
          set({ isLoading: true, error: null }, undefined, 'scheduler/addJob/start');

          try {
            // Parse actionData from JSON string to object so Rust receives
            // serde_json::Value as an object, not a string literal.
            let parsedActionData: Record<string, unknown> | undefined;
            try {
              parsedActionData = actionData
                ? (JSON.parse(actionData) as Record<string, unknown>)
                : undefined;
            } catch {
              // If actionData is not valid JSON, wrap it as a plain object
              parsedActionData = actionData ? { raw: actionData } : undefined;
            }

            const jobId = await invoke<string>('scheduler_add_job', {
              name,
              schedule,
              actionType,
              actionData: parsedActionData,
            });

            // Refresh job list after adding
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
              // Toggle the local state
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
              // Refresh to pick up updated last_run
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
              // Refresh full job list to get the updated data from backend
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
            // Listen for job execution events
            const unlistenJobExecuted = await listen<ScheduledJob>(
              'scheduler:job_executed',
              (event) => {
                console.debug('[schedulerStore] Job executed:', event.payload);
                get().updateJob(event.payload);
              },
            );
            unlistenFns.push(unlistenJobExecuted);

            // Listen for job added events
            const unlistenJobAdded = await listen<ScheduledJob>('scheduler:job_added', (event) => {
              console.debug('[schedulerStore] Job added:', event.payload);
              set(
                (state) => {
                  // Avoid duplicates
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

            // Listen for job removed events
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

            // Listen for job updated events (pause/resume/etc)
            const unlistenJobUpdated = await listen<ScheduledJob>(
              'scheduler:job_updated',
              (event) => {
                console.debug('[schedulerStore] Job updated:', event.payload);
                get().updateJob(event.payload);
              },
            );
            unlistenFns.push(unlistenJobUpdated);

            // Listen for scheduler errors
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
            // Clean up any listeners that were successfully registered
            unlistenFns.forEach((fn) => fn());
            throw error;
          }
        },

        cleanupEventListeners: () => {
          const { _unlistenFns } = get();
          _unlistenFns.forEach((fn) => fn());
          set({ _unlistenFns: [] }, undefined, 'scheduler/cleanupEventListeners');
        },

        // ── Task actions (formerly scheduledTaskStore) ─────────────────────

        fetchTasks: async () => {
          set({ isLoading: true }, undefined, 'scheduler/fetchTasks/start');
          try {
            const jobs = await invoke<ScheduledJob[]>('scheduler_list_jobs');
            // Map Rust ScheduledJob wire format → UI ScheduledTask
            const tasks: ScheduledTask[] = jobs.map((job) => ({
              id: job.id,
              name: job.name,
              description: job.description ?? '',
              prompt: ((job.actionData as Record<string, unknown>)?.['prompt'] as string) ?? '',
              schedule: {
                type: 'recurring' as const,
                cronExpression: job.schedule,
              },
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
            set({ tasks, isLoading: false }, undefined, 'scheduler/fetchTasks/success');
          } catch {
            // Tauri command not available — fall back to localStorage
            const tasks = loadTasksFromStorage();
            set({ tasks, isLoading: false }, undefined, 'scheduler/fetchTasks/fallback');
          }
        },

        createTask: async (input: CreateTaskInput) => {
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

          try {
            const id = await invoke<string>('scheduler_add_job', {
              name: input.name,
              prompt: input.prompt,
              schedule: input.schedule,
            });
            const taskWithBackendId: ScheduledTask = { ...newTask, id };
            set(
              (state) => {
                const tasks = [taskWithBackendId, ...state.tasks];
                persistTasksToStorage(tasks);
                return { tasks };
              },
              undefined,
              'scheduler/createTask/success',
            );
          } catch {
            // Fallback: store locally
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
          } catch {
            // Fallback: update locally only
          }
          set(
            (state) => {
              const tasks = state.tasks.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      ...updates,
                      nextRunAt:
                        updates.schedule != null ? computeNextRunAt(updates.schedule) : t.nextRunAt,
                    }
                  : t,
              );
              persistTasksToStorage(tasks);
              return { tasks };
            },
            undefined,
            'scheduler/updateTask',
          );
        },

        deleteTask: async (id: string) => {
          try {
            await invoke('scheduler_remove_job', { jobId: id });
          } catch {
            // Fallback: delete locally
          }
          set(
            (state) => {
              const tasks = state.tasks.filter((t) => t.id !== id);
              persistTasksToStorage(tasks);
              return { tasks };
            },
            undefined,
            'scheduler/deleteTask',
          );
        },

        toggleTask: async (id: string) => {
          const task = get().tasks.find((t) => t.id === id);
          if (!task) return;

          const newStatus: TaskStatus = task.status === 'active' ? 'paused' : 'active';

          try {
            await invoke('scheduler_toggle_job', { id });
          } catch {
            // Fallback: toggle locally
          }
          set(
            (state) => {
              const tasks = state.tasks.map((t) => (t.id === id ? { ...t, status: newStatus } : t));
              persistTasksToStorage(tasks);
              return { tasks };
            },
            undefined,
            'scheduler/toggleTask',
          );
        },

        runNow: async (id: string) => {
          try {
            await invoke('scheduler_run_job_now', { id });
          } catch {
            // Fallback: record local run attempt
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
            'scheduler/runNow',
          );
        },
      })),
      {
        name: 'agiworkforce-scheduler',
        version: SCHEDULER_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          jobs: state.jobs,
          tasks: state.tasks,
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<SchedulerState> | undefined;
          return {
            ...currentState,
            jobs: persisted?.jobs ?? currentState.jobs,
            tasks: persisted?.tasks ?? currentState.tasks,
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

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Wait for scheduler store to finish hydrating from localStorage.
 * Use this before accessing jobs that depend on persisted values.
 */
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

// ============================================================================
// Selectors — Job-oriented
// ============================================================================

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

// Derived selector for upcoming jobs sorted by next_run
export const selectUpcomingJobs = (state: SchedulerState) =>
  [...state.jobs]
    .filter((job) => job.status === 'active' && job.nextRun)
    .sort((a, b) => {
      if (!a.nextRun) return 1;
      if (!b.nextRun) return -1;
      return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime();
    });

// ============================================================================
// Selectors — Task-oriented
// ============================================================================

export const selectTasks = (state: SchedulerState) => state.tasks;
export const selectActiveTasks = (state: SchedulerState) =>
  state.tasks.filter((t) => t.status === 'active');
export const selectTaskById = (id: string) => (state: SchedulerState) =>
  state.tasks.find((t) => t.id === id);

// Re-export the formerly-separate store as an alias so any code that
// grabbed useScheduledTaskStore directly still works during migration.
export { useSchedulerStore as useScheduledTaskStore };

// Backward-compat type aliases for components that used the old type names
/** @deprecated Use SchedulerActionType instead */
export type ActionType = SchedulerActionType;
/** @deprecated No longer needed — jobs use a cron string `schedule` field */
export type ScheduleType = 'cron' | 'interval' | 'once';
