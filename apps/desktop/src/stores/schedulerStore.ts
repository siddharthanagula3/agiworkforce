// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { invoke, isTauri, listen, type UnlistenFn } from '../lib/tauri-mock';
import { getSimpleErrorMessage } from '../lib/errorMessages';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { toast } from 'sonner';

export type SchedulerActionType =
  | 'agiTask'
  | 'notification'
  | 'memorySummarization'
  | 'memoryDecay'
  | 'shellCommand'
  | 'webhook'
  | 'script'
  | 'workflow';

export type JobStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface RunProblem {
  kind: 'failed' | 'skipped';
  reason: string;
}

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;
  plan?: TaskSchedule | null;
  lastProblem?: RunProblem | null;
  lastRunWasDue?: string | null;
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
  lastOutput?: string | null;
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
  output?: string | null;
}

export type TaskInterval = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type TaskStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface TaskSchedule {
  type: 'once' | 'recurring';
  runAt?: number;
  interval?: TaskInterval;
  cronExpression?: string;
  timeOfDay?: string;
  weekday?: number;
  dayOfMonth?: number;
  timezone?: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  actionType: SchedulerActionType;
  schedule: TaskSchedule;
  status: TaskStatus;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  failureCount: number;
  lastProblem: RunProblem | null;
  lastRunWasDueAt: number | null;
  lastOutput: string | null;
  createdAt: number;
}

export type CreateTaskInput = Pick<ScheduledTask, 'name' | 'description' | 'prompt' | 'schedule'>;
export type TaskEdit = Partial<CreateTaskInput>;

export const FAILURES_BEFORE_A_TASK_IS_STOPPED = 3;
export const DEFAULT_TIME_OF_DAY = '09:00';
export const DEFAULT_WEEKDAY = 1;
export const DEFAULT_DAY_OF_MONTH = 1;
export const LAST_DAY_EVERY_MONTH_HAS = 28;
export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const LEGACY_SCHEDULE_TIMEZONE = 'UTC';

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function completeSchedule(schedule: TaskSchedule): TaskSchedule {
  if (schedule.type === 'once') {
    return {
      type: 'once',
      runAt: schedule.runAt,
      timezone: schedule.timezone ?? localTimeZone(),
    };
  }

  const timezone = schedule.timezone ?? localTimeZone();
  const timeOfDay = schedule.timeOfDay ?? DEFAULT_TIME_OF_DAY;
  switch (schedule.interval ?? 'daily') {
    case 'hourly':
      return { type: 'recurring', interval: 'hourly', timezone };
    case 'weekly':
      return {
        type: 'recurring',
        interval: 'weekly',
        timeOfDay,
        weekday: schedule.weekday ?? DEFAULT_WEEKDAY,
        timezone,
      };
    case 'monthly':
      return {
        type: 'recurring',
        interval: 'monthly',
        timeOfDay,
        dayOfMonth: schedule.dayOfMonth ?? DEFAULT_DAY_OF_MONTH,
        timezone,
      };
    case 'custom':
      return {
        type: 'recurring',
        interval: 'custom',
        cronExpression: (schedule.cronExpression ?? '').trim(),
        timezone,
      };
    default:
      return { type: 'recurring', interval: 'daily', timeOfDay, timezone };
  }
}

const ONE_NUMBER = /^\d+$/;
const ONE_WEEKDAY = /^(\d|sun|mon|tue|wed|thu|fri|sat)$/i;

/**
 * The plain repeat a cron expression spells out, or `custom` when it says
 * anything more: a step, a range or a list runs more often than the plain
 * label would claim.
 */
export function inferTaskInterval(cronExpression: string): TaskInterval {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length === 6 && fields[0] !== '0') return 'custom';
  const normalizedFields = fields.length === 6 ? fields.slice(1) : fields;
  if (normalizedFields.length !== 5) return 'custom';

  const [minute, hour, dayOfMonth, month, dayOfWeek] = normalizedFields;
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return 'custom';
  if (!ONE_NUMBER.test(minute) || month !== '*') return 'custom';

  if (hour === '*') {
    return dayOfMonth === '*' && dayOfWeek === '*' ? 'hourly' : 'custom';
  }
  if (!ONE_NUMBER.test(hour)) return 'custom';
  if (dayOfMonth === '*' && dayOfWeek === '*') return 'daily';
  if (dayOfMonth === '*' && ONE_WEEKDAY.test(dayOfWeek)) return 'weekly';
  if (ONE_NUMBER.test(dayOfMonth) && dayOfWeek === '*') return 'monthly';
  return 'custom';
}

function legacySchedule(cronExpression: string): TaskSchedule {
  return {
    type: 'recurring',
    interval: 'custom',
    cronExpression,
    timezone: LEGACY_SCHEDULE_TIMEZONE,
  };
}

export function scheduledTaskFromJob(job: ScheduledJob): ScheduledTask {
  const lastRun = job.lastExecutedAt ?? job.lastRun;
  const nextRun = job.nextExecutionAt ?? job.nextRun;
  const prompt = job.actionData?.['prompt'];
  return {
    id: job.id,
    name: job.name,
    description: job.description ?? '',
    prompt: typeof prompt === 'string' ? prompt : '',
    actionType: job.actionType,
    schedule: job.plan ?? legacySchedule(job.schedule),
    status: job.status,
    lastRunAt: lastRun ? new Date(lastRun).getTime() : null,
    nextRunAt: nextRun ? new Date(nextRun).getTime() : null,
    runCount: job.runCount,
    failureCount: job.failureCount,
    lastProblem: job.lastProblem ?? null,
    lastRunWasDueAt: job.lastRunWasDue ? new Date(job.lastRunWasDue).getTime() : null,
    lastOutput: job.lastOutput ?? null,
    createdAt: new Date(job.createdAt).getTime(),
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

async function readRunningTaskIds(): Promise<string[] | null> {
  try {
    const ids = await invoke<string[]>('scheduler_running_jobs');
    return Array.isArray(ids) ? ids : null;
  } catch {
    return null;
  }
}

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

function recurringSummary(schedule: TaskSchedule): string {
  const time = schedule.timeOfDay ?? DEFAULT_TIME_OF_DAY;
  switch (schedule.interval ?? 'daily') {
    case 'hourly':
      return INTERVAL_LABELS.hourly;
    case 'weekly':
      return `Every ${WEEKDAY_LABELS[schedule.weekday ?? DEFAULT_WEEKDAY] ?? 'week'} at ${time}`;
    case 'monthly':
      return `Day ${schedule.dayOfMonth ?? DEFAULT_DAY_OF_MONTH} of every month at ${time}`;
    case 'custom': {
      const cron = schedule.cronExpression ?? '';
      const shape = inferTaskInterval(cron);
      return shape === 'custom' ? `Custom: ${cron}` : INTERVAL_LABELS[shape];
    }
    default:
      return `Every day at ${time}`;
  }
}

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
  const summary = recurringSummary(schedule);
  const elsewhere = schedule.timezone && schedule.timezone !== localTimeZone();
  return elsewhere ? `${summary} (${schedule.timezone})` : summary;
}

export function getProblemSummary(task: ScheduledTask): string | null {
  const problem = task.lastProblem;
  if (task.status === 'failed') {
    const stopped = `Stopped after ${FAILURES_BEFORE_A_TASK_IS_STOPPED} failed runs in a row.`;
    return problem ? `${stopped} Last error: ${problem.reason}` : stopped;
  }
  if (!problem) return null;
  return problem.kind === 'skipped'
    ? `Last run skipped: ${problem.reason}`
    : `Last run failed: ${problem.reason}`;
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

interface SchedulerListenerHandlers {
  onRunStarted: (jobId: string) => void;
  onRunEnded: (job: ScheduledJob) => void;
  onJobChanged: (job: ScheduledJob) => void;
  onJobAdded: (job: ScheduledJob) => void;
  onJobRemoved: (jobId: string) => void;
  onError: (jobId: string, error: string) => void;
}

let schedulerListenerUsers = 0;
let schedulerListenerSetup: Promise<UnlistenFn[]> | null = null;

async function registerSchedulerListeners(
  handlers: SchedulerListenerHandlers,
): Promise<UnlistenFn[]> {
  const unlistenFns: UnlistenFn[] = [];
  try {
    unlistenFns.push(
      await listen<{ jobId: string }>('scheduler:run_started', (event) =>
        handlers.onRunStarted(event.payload.jobId),
      ),
      await listen<ScheduledJob>('scheduler:job_executed', (event) =>
        handlers.onRunEnded(event.payload),
      ),
      await listen<ScheduledJob>('scheduler:job_updated', (event) =>
        handlers.onJobChanged(event.payload),
      ),
      await listen<ScheduledJob>('scheduler:job_added', (event) =>
        handlers.onJobAdded(event.payload),
      ),
      await listen<{ jobId: string }>('scheduler:job_removed', (event) =>
        handlers.onJobRemoved(event.payload.jobId),
      ),
      await listen<{ jobId: string; error: string }>('scheduler:error', (event) =>
        handlers.onError(event.payload.jobId, event.payload.error),
      ),
    );
    return unlistenFns;
  } catch (error) {
    unlistenFns.forEach((fn) => fn());
    throw error;
  }
}

interface SchedulerState {
  jobs: ScheduledJob[];
  isLoading: boolean;
  error: string | null;

  listJobs: () => Promise<void>;
  getJob: (jobId: string) => Promise<ScheduledJob | null>;
  getHistory: (jobId?: string) => Promise<JobExecutionRecord[]>;
  getNextRuns: (limit?: number) => Promise<NextRunInfo[]>;
  updateJob: (job: ScheduledJob) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  _unlistenFns: UnlistenFn[];
  initEventListeners: () => Promise<void>;
  cleanupEventListeners: () => void;

  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  tasks: ScheduledTask[];
  runningTaskIds: string[];
  stopRun: (id: string) => Promise<void>;
  createTask: (task: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, updates: TaskEdit) => Promise<void>;
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
        runningTaskIds: [],

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state }, undefined, 'scheduler/setHasHydrated');
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

        updateJob: (job: ScheduledJob) => {
          set(
            (state) => ({
              jobs: state.jobs.map((j) => (j.id === job.id ? job : j)),
              tasks: state.tasks.map((task) =>
                task.id === job.id ? scheduledTaskFromJob(job) : task,
              ),
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
          schedulerListenerUsers += 1;
          schedulerListenerSetup ??= registerSchedulerListeners({
            onRunStarted: (jobId) =>
              set(
                (state) =>
                  state.runningTaskIds.includes(jobId)
                    ? state
                    : { runningTaskIds: [...state.runningTaskIds, jobId] },
                undefined,
                'scheduler/event/runStarted',
              ),
            onRunEnded: (job) => {
              get().updateJob(job);
              set(
                (state) => ({ runningTaskIds: state.runningTaskIds.filter((id) => id !== job.id) }),
                undefined,
                'scheduler/event/runEnded',
              );
            },
            onJobChanged: (job) => get().updateJob(job),
            onJobAdded: (job) =>
              set(
                (state) =>
                  state.jobs.some((j) => j.id === job.id)
                    ? state
                    : {
                        jobs: [...state.jobs, job],
                        tasks: [scheduledTaskFromJob(job), ...state.tasks],
                      },
                undefined,
                'scheduler/event/jobAdded',
              ),
            onJobRemoved: (jobId) =>
              set(
                (state) => ({
                  jobs: state.jobs.filter((j) => j.id !== jobId),
                  tasks: state.tasks.filter((task) => task.id !== jobId),
                  runningTaskIds: state.runningTaskIds.filter((id) => id !== jobId),
                }),
                undefined,
                'scheduler/event/jobRemoved',
              ),
            onError: (jobId, error) => {
              const name = get().tasks.find((task) => task.id === jobId)?.name;
              get().setError(name ? `${name}: ${error}` : error);
            },
          });

          try {
            const unlistenFns = await schedulerListenerSetup;
            set({ _unlistenFns: unlistenFns }, undefined, 'scheduler/initEventListeners');
          } catch (error) {
            console.error('[schedulerStore] Failed to initialize event listeners:', error);
            schedulerListenerUsers = Math.max(0, schedulerListenerUsers - 1);
            schedulerListenerSetup = null;
            throw error;
          }
        },

        cleanupEventListeners: () => {
          schedulerListenerUsers = Math.max(0, schedulerListenerUsers - 1);
          if (schedulerListenerUsers > 0) return;

          const setup = schedulerListenerSetup;
          schedulerListenerSetup = null;
          set({ _unlistenFns: [] }, undefined, 'scheduler/cleanupEventListeners');
          void setup
            ?.then((unlistenFns) => unlistenFns.forEach((fn) => fn()))
            .catch(() => undefined);
        },

        fetchTasks: async () => {
          set({ isLoading: true }, undefined, 'scheduler/fetchTasks/start');
          try {
            const jobs = await invoke<ScheduledJob[]>('scheduler_list_jobs');
            const tasks = jobs.map(scheduledTaskFromJob);
            const running = await readRunningTaskIds();
            set(
              {
                tasks,
                runningTaskIds: running ?? get().runningTaskIds,
                isLoading: false,
                error: null,
              },
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
              description: input.description || null,
              schedule: completeSchedule(input.schedule),
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
              actionType: 'agiTask',
              status: 'active',
              createdAt: now,
              runCount: 0,
              failureCount: 0,
              lastProblem: null,
              lastRunWasDueAt: null,
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

        updateTask: async (id: string, updates: TaskEdit) => {
          try {
            await invoke('scheduler_update_job', {
              id,
              updates: updates.schedule
                ? { ...updates, schedule: completeSchedule(updates.schedule) }
                : updates,
            });
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

        stopRun: async (id: string) => {
          try {
            await invoke<boolean>('scheduler_stop_run', { id });
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to stop the run:', error);
            set({ error: errorMessage }, undefined, 'scheduler/stopRun/error');
            toast.error(`Failed to stop the run: ${errorMessage}`);
            throw error;
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
