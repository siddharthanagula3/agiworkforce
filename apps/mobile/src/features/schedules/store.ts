import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  fetchSchedules as apiFetchSchedules,
  createSchedule as apiCreateSchedule,
  updateSchedule as apiUpdateSchedule,
  deleteSchedule as apiDeleteSchedule,
  toggleSchedule as apiToggleSchedule,
  fetchScheduleRuns as apiFetchRuns,
} from './service';
import { isMobileScheduleRecurrenceSupported } from './policy';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom' | 'interval';

export interface Schedule {
  id: string;
  name: string;
  prompt: string;
  model: string;
  recurrence: RecurrenceType;
  cronExpression?: string;
  scheduledAt: string | null;
  intervalMs?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  timeOfDay: string;
  timezone: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | 'pending' | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  status: 'success' | 'failed' | 'running' | 'timeout' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  result: string | null;
  error: string | null;
}

export type CreateScheduleInput = Omit<
  Schedule,
  'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt' | 'lastRunStatus'
>;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ScheduleState {
  schedules: Schedule[];
  /** Runs keyed by scheduleId to avoid data loss on schedule switch */
  runsBySchedule: Record<string, ScheduleRun[]>;
  runsLoadingBySchedule: Record<string, boolean>;
  runsErrorBySchedule: Record<string, string | null>;
  loading: boolean;
  error: string | null;

  fetchSchedules: () => Promise<void>;
  createSchedule: (data: CreateScheduleInput) => Promise<void>;
  updateSchedule: (id: string, data: Partial<CreateScheduleInput>) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  toggleSchedule: (id: string) => Promise<void>;
  fetchRuns: (scheduleId: string) => Promise<void>;
  getRuns: (scheduleId: string) => ScheduleRun[];
  clearError: () => void;
  /** Clear every Clerk-account schedule cache on sign-out/account switch. */
  clearAccountSchedules: () => void;
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      schedules: [],
      runsBySchedule: {},
      runsLoadingBySchedule: {},
      runsErrorBySchedule: {},
      loading: false,
      error: null,

      fetchSchedules: async () => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        set({ loading: true, error: null });
        try {
          const schedules = await apiFetchSchedules();
          if (!isCloudAccountEpochCurrent(account)) return;
          set({ schedules });
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          console.warn('Failed to fetch schedules:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to load schedules',
          });
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ loading: false });
        }
      },

      createSchedule: async (data) => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        set({ loading: true, error: null });
        try {
          const schedule = await apiCreateSchedule(data);
          if (!isCloudAccountEpochCurrent(account)) return;
          set((state) => ({
            schedules: [schedule, ...state.schedules],
          }));
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          console.warn('Failed to create schedule:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to create schedule',
          });
          throw error;
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ loading: false });
        }
      },

      updateSchedule: async (id, data) => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        set({ loading: true, error: null });
        try {
          const updated = await apiUpdateSchedule(id, data);
          if (!isCloudAccountEpochCurrent(account)) return;
          set((state) => ({
            schedules: state.schedules.map((s) => (s.id === id ? updated : s)),
          }));
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          console.warn('Failed to update schedule:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to update schedule',
          });
          throw error;
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ loading: false });
        }
      },

      deleteSchedule: async (id) => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        // Optimistic removal
        const prev = get().schedules;
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
        }));

        try {
          await apiDeleteSchedule(id);
          if (!isCloudAccountEpochCurrent(account)) return;
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          console.warn('Failed to delete schedule:', error);
          // Revert on failure
          set({ schedules: prev });
          set({
            error: error instanceof Error ? error.message : 'Failed to delete schedule',
          });
        }
      },

      toggleSchedule: async (id) => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        const schedule = get().schedules.find((s) => s.id === id);
        if (!schedule) return;

        const newActive = !schedule.isActive;
        if (newActive && !isMobileScheduleRecurrenceSupported(schedule.recurrence)) {
          set({
            error: 'Choose Once, Daily, Weekly, or Monthly before activating this legacy schedule.',
          });
          return;
        }

        // Optimistic update
        set((state) => ({
          schedules: state.schedules.map((s) => (s.id === id ? { ...s, isActive: newActive } : s)),
        }));

        try {
          await apiToggleSchedule(id, newActive);
          if (!isCloudAccountEpochCurrent(account)) return;
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          console.warn('Failed to toggle schedule:', error);
          // Revert on failure
          set((state) => ({
            schedules: state.schedules.map((s) =>
              s.id === id ? { ...s, isActive: !newActive } : s,
            ),
          }));
          set({
            error: error instanceof Error ? error.message : 'Failed to toggle schedule',
          });
        }
      },

      fetchRuns: async (scheduleId) => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        set((state) => ({
          runsLoadingBySchedule: {
            ...state.runsLoadingBySchedule,
            [scheduleId]: true,
          },
          runsErrorBySchedule: {
            ...state.runsErrorBySchedule,
            [scheduleId]: null,
          },
        }));
        try {
          const runs = await apiFetchRuns(scheduleId);
          if (!isCloudAccountEpochCurrent(account)) return;
          set((state) => {
            const updated = { ...state.runsBySchedule, [scheduleId]: runs };
            // Evict runs for deleted schedules to prevent unbounded growth
            const activeIds = new Set(state.schedules.map((s) => s.id));
            for (const key of Object.keys(updated)) {
              if (!activeIds.has(key)) delete updated[key];
            }
            return { runsBySchedule: updated };
          });
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          console.warn('Failed to fetch schedule runs:', error);
          set((state) => ({
            runsErrorBySchedule: {
              ...state.runsErrorBySchedule,
              [scheduleId]: error instanceof Error ? error.message : 'Failed to load run history',
            },
          }));
        } finally {
          if (isCloudAccountEpochCurrent(account)) {
            set((state) => ({
              runsLoadingBySchedule: {
                ...state.runsLoadingBySchedule,
                [scheduleId]: false,
              },
            }));
          }
        }
      },

      getRuns: (scheduleId) => {
        return get().runsBySchedule[scheduleId] ?? [];
      },

      clearError: () => {
        set({ error: null });
      },

      clearAccountSchedules: () => {
        set({
          schedules: [],
          runsBySchedule: {},
          runsLoadingBySchedule: {},
          runsErrorBySchedule: {},
          loading: false,
          error: null,
        });
      },
    }),
    {
      name: 'schedule-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[scheduleStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        // Persist schedules for offline access
        // Do NOT persist loading, error, or runs
        schedules: state.schedules,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useScheduleStore, 'schedule-store');
