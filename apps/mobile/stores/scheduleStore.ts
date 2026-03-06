import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import {
  fetchSchedules as apiFetchSchedules,
  createSchedule as apiCreateSchedule,
  updateSchedule as apiUpdateSchedule,
  deleteSchedule as apiDeleteSchedule,
  toggleSchedule as apiToggleSchedule,
  fetchScheduleRuns as apiFetchRuns,
} from '@/services/schedules';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface Schedule {
  id: string;
  name: string;
  prompt: string;
  model: string;
  recurrence: RecurrenceType;
  cronExpression?: string;
  scheduledAt: string | null;
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
  status: 'success' | 'failed' | 'running' | 'pending';
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
  loading: boolean;
  error: string | null;

  fetchSchedules: () => Promise<void>;
  createSchedule: (data: CreateScheduleInput) => Promise<void>;
  updateSchedule: (id: string, data: Partial<Schedule>) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  toggleSchedule: (id: string) => Promise<void>;
  fetchRuns: (scheduleId: string) => Promise<void>;
  getRuns: (scheduleId: string) => ScheduleRun[];
  clearError: () => void;
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      schedules: [],
      runsBySchedule: {},
      loading: false,
      error: null,

      fetchSchedules: async () => {
        set({ loading: true, error: null });
        try {
          const schedules = await apiFetchSchedules();
          set({ schedules });
        } catch (error) {
          console.warn('Failed to fetch schedules:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to load schedules',
          });
        } finally {
          set({ loading: false });
        }
      },

      createSchedule: async (data) => {
        set({ loading: true, error: null });
        try {
          const schedule = await apiCreateSchedule(data);
          set((state) => ({
            schedules: [schedule, ...state.schedules],
          }));
        } catch (error) {
          console.warn('Failed to create schedule:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to create schedule',
          });
          throw error;
        } finally {
          set({ loading: false });
        }
      },

      updateSchedule: async (id, data) => {
        set({ loading: true, error: null });
        try {
          const updated = await apiUpdateSchedule(id, data);
          set((state) => ({
            schedules: state.schedules.map((s) => (s.id === id ? updated : s)),
          }));
        } catch (error) {
          console.warn('Failed to update schedule:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to update schedule',
          });
          throw error;
        } finally {
          set({ loading: false });
        }
      },

      deleteSchedule: async (id) => {
        // Optimistic removal
        const prev = get().schedules;
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
        }));

        try {
          await apiDeleteSchedule(id);
        } catch (error) {
          console.warn('Failed to delete schedule:', error);
          // Revert on failure
          set({ schedules: prev });
          set({
            error: error instanceof Error ? error.message : 'Failed to delete schedule',
          });
        }
      },

      toggleSchedule: async (id) => {
        const schedule = get().schedules.find((s) => s.id === id);
        if (!schedule) return;

        const newActive = !schedule.isActive;

        // Optimistic update
        set((state) => ({
          schedules: state.schedules.map((s) => (s.id === id ? { ...s, isActive: newActive } : s)),
        }));

        try {
          await apiToggleSchedule(id, newActive);
        } catch (error) {
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
        set({ loading: true, error: null });
        try {
          const runs = await apiFetchRuns(scheduleId);
          set((state) => ({
            runsBySchedule: { ...state.runsBySchedule, [scheduleId]: runs },
          }));
        } catch (error) {
          console.warn('Failed to fetch schedule runs:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to load run history',
          });
        } finally {
          set({ loading: false });
        }
      },

      getRuns: (scheduleId) => {
        return get().runsBySchedule[scheduleId] ?? [];
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'schedule-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        // Persist schedules for offline access
        // Do NOT persist loading, error, or runs
        schedules: state.schedules,
      }),
    },
  ),
);
