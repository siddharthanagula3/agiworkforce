/**
 * Scheduler Store
 *
 * Manages scheduled jobs for automated tasks including briefings, reminders,
 * agent tasks, and custom actions.
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

// ============================================================================
// Types
// ============================================================================

export type ScheduleType = 'cron' | 'interval' | 'once';
export type ActionType = 'briefing' | 'reminder' | 'agent_task' | 'custom';

export interface ScheduledJob {
  id: string;
  name: string;
  schedule_type: ScheduleType;
  cron_expression?: string;
  interval_seconds?: number;
  run_at?: string;
  timezone: string;
  action_type: ActionType;
  action_data: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
  created_at: string;
}

export interface NextRunInfo {
  jobId: string;
  nextRun: string;
}

interface SchedulerState {
  jobs: ScheduledJob[];
  isLoading: boolean;
  error: string | null;

  // Actions
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

  // Internal actions
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
// Store implementation
// ============================================================================

export const useSchedulerStore = create<SchedulerState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        jobs: [],
        isLoading: false,
        error: null,
        _unlistenFns: [],
        _hasHydrated: false,

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
            const jobId = await invoke<string>('scheduler_add_job', {
              name,
              schedule,
              actionType,
              actionData,
            });

            // Refresh job list after adding
            await get().listJobs();

            set({ isLoading: false }, undefined, 'scheduler/addJob/success');
            return jobId;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to add job:', error);
            set({ error: errorMessage, isLoading: false }, undefined, 'scheduler/addJob/error');
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
            } else {
              set({ isLoading: false }, undefined, 'scheduler/removeJob/notFound');
            }

            return success;
          } catch (error) {
            const errorMessage = getSimpleErrorMessage(error);
            console.error('[schedulerStore] Failed to remove job:', error);
            set({ error: errorMessage, isLoading: false }, undefined, 'scheduler/removeJob/error');
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
                console.log('[schedulerStore] Job executed:', event.payload);
                get().updateJob(event.payload);
              },
            );
            unlistenFns.push(unlistenJobExecuted);

            // Listen for job added events
            const unlistenJobAdded = await listen<ScheduledJob>('scheduler:job_added', (event) => {
              console.log('[schedulerStore] Job added:', event.payload);
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
                console.log('[schedulerStore] Job removed:', event.payload);
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
                console.log('[schedulerStore] Job updated:', event.payload);
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
      })),
      {
        name: 'agiworkforce-scheduler',
        version: SCHEDULER_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          jobs: state.jobs,
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<SchedulerState> | undefined;
          return {
            ...currentState,
            jobs: persisted?.jobs ?? currentState.jobs,
          };
        },
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            console.log('[SchedulerStore] Rehydration complete');
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
// Selectors
// ============================================================================

export const selectJobs = (state: SchedulerState) => state.jobs;
export const selectEnabledJobs = (state: SchedulerState) => state.jobs.filter((job) => job.enabled);
export const selectDisabledJobs = (state: SchedulerState) =>
  state.jobs.filter((job) => !job.enabled);
export const selectJobById = (jobId: string) => (state: SchedulerState) =>
  state.jobs.find((job) => job.id === jobId);
export const selectJobsByActionType = (actionType: ActionType) => (state: SchedulerState) =>
  state.jobs.filter((job) => job.action_type === actionType);
export const selectJobsByScheduleType = (scheduleType: ScheduleType) => (state: SchedulerState) =>
  state.jobs.filter((job) => job.schedule_type === scheduleType);

export const selectSchedulerLoading = (state: SchedulerState) => state.isLoading;
export const selectSchedulerError = (state: SchedulerState) => state.error;
export const selectSchedulerHasHydrated = (state: SchedulerState) => state._hasHydrated;

export const selectJobCount = (state: SchedulerState) => state.jobs.length;
export const selectEnabledJobCount = (state: SchedulerState) =>
  state.jobs.filter((job) => job.enabled).length;

// Derived selector for upcoming jobs sorted by next_run
export const selectUpcomingJobs = (state: SchedulerState) =>
  [...state.jobs]
    .filter((job) => job.enabled && job.next_run)
    .sort((a, b) => {
      if (!a.next_run) return 1;
      if (!b.next_run) return -1;
      return new Date(a.next_run).getTime() - new Date(b.next_run).getTime();
    });
