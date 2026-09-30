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
  resolveScheduleRunApproval as apiResolveRunApproval,
} from './service';
import type {
  ManagedCloudScheduleRunApproval,
  ManagedCloudScheduleRunPendingApproval,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import { isMobileScheduleRecurrenceSupported } from './policy';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

export type RecurrenceType =
  'once' | 'daily' | 'weekly' | 'monthly' | 'custom' | 'interval' | 'rrule' | 'event';

export interface Schedule {
  id: string;
  name: string;
  prompt: string;
  model: string;
  recurrence: RecurrenceType;
  recurrenceRule?: string;
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
  pausedReason?: ManagedCloudScheduleTask['pausedReason'];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  status: 'success' | 'failed' | 'running' | 'timeout' | 'cancelled' | 'awaiting_approval';
  startedAt: string;
  completedAt: string | null;
  result: string | null;
  error: string | null;
  pendingApproval?: ManagedCloudScheduleRunPendingApproval | null;
  timingNote: string | null;
}

export type CreateScheduleInput = Omit<
  Schedule,
  'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt' | 'lastRunStatus' | 'pausedReason'
>;

interface ScheduleState {
  schedules: Schedule[];
  runsBySchedule: Record<string, ScheduleRun[]>;
  runsLoadingBySchedule: Record<string, boolean>;
  runsErrorBySchedule: Record<string, string | null>;
  approvalPendingByRun: Record<string, boolean>;
  loading: boolean;
  error: string | null;

  fetchSchedules: () => Promise<void>;
  createSchedule: (data: CreateScheduleInput) => Promise<boolean>;
  updateSchedule: (id: string, data: Partial<CreateScheduleInput>) => Promise<void>;
  deleteSchedule: (id: string) => Promise<boolean>;
  toggleSchedule: (id: string) => Promise<void>;
  fetchRuns: (scheduleId: string) => Promise<void>;
  resolveRunApproval: (
    scheduleId: string,
    runId: string,
    decision: ManagedCloudScheduleRunApproval['decision'],
  ) => Promise<void>;
  getRuns: (scheduleId: string) => ScheduleRun[];
  clearError: () => void;
  clearAccountSchedules: () => void;
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      schedules: [],
      runsBySchedule: {},
      runsLoadingBySchedule: {},
      runsErrorBySchedule: {},
      approvalPendingByRun: {},
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
          set({ error: 'Could not load scheduled tasks. Check your connection and retry.' });
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ loading: false });
        }
      },

      createSchedule: async (data) => {
        const account = captureCloudAccountEpoch();
        if (!account) return false;
        set({ loading: true, error: null });
        try {
          const schedule = await apiCreateSchedule(data);
          if (!isCloudAccountEpochCurrent(account)) return false;
          set((state) => ({
            schedules: [schedule, ...state.schedules],
          }));
          return true;
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return false;
          console.warn('Failed to create schedule:', error);
          set({ error: 'Could not create this task. Check your connection and retry.' });
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
          set({ error: 'Could not save this task. Check your connection and retry.' });
          throw error;
        } finally {
          if (isCloudAccountEpochCurrent(account)) set({ loading: false });
        }
      },

      deleteSchedule: async (id) => {
        const account = captureCloudAccountEpoch();
        if (!account) return false;
        const previousSchedules = get().schedules;
        const removedSchedule = previousSchedules.find((schedule) => schedule.id === id);
        const removedIndex = previousSchedules.findIndex((schedule) => schedule.id === id);
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
        }));

        try {
          await apiDeleteSchedule(id);
          if (!isCloudAccountEpochCurrent(account)) return false;
          return true;
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return false;
          console.warn('Failed to delete schedule:', error);
          if (removedSchedule) {
            set((state) => {
              if (state.schedules.some((schedule) => schedule.id === id)) return state;
              const schedules = [...state.schedules];
              schedules.splice(Math.min(removedIndex, schedules.length), 0, removedSchedule);
              return { schedules };
            });
          }
          set({ error: 'Could not delete this task. Check your connection and retry.' });
          return false;
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

        set((state) => ({
          schedules: state.schedules.map((s) => (s.id === id ? { ...s, isActive: newActive } : s)),
        }));

        try {
          const updated = await apiToggleSchedule(id, newActive);
          if (!isCloudAccountEpochCurrent(account)) return;
          set((state) => ({
            schedules: state.schedules.map((item) =>
              item.id === id && item.isActive === newActive ? updated : item,
            ),
          }));
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          console.warn('Failed to toggle schedule:', error);
          set((state) => ({
            schedules: state.schedules.map((s) =>
              s.id === id && s.isActive === newActive ? { ...s, isActive: schedule.isActive } : s,
            ),
          }));
          set({ error: 'Could not change this task. Check your connection and retry.' });
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
              [scheduleId]: 'Could not load run history. Check your connection and retry.',
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

      resolveRunApproval: async (scheduleId, runId, decision) => {
        const account = captureCloudAccountEpoch();
        if (!account) return;
        const pending = get().runsBySchedule[scheduleId]?.find(
          (run) => run.id === runId,
        )?.pendingApproval;
        if (!pending) return;
        set((state) => ({
          approvalPendingByRun: { ...state.approvalPendingByRun, [runId]: true },
          runsErrorBySchedule: { ...state.runsErrorBySchedule, [scheduleId]: null },
        }));
        try {
          const resolved = await apiResolveRunApproval(scheduleId, runId, {
            decision,
            toolCallIds: pending.toolCalls.map((call) => call.id),
          });
          if (!isCloudAccountEpochCurrent(account)) return;
          set((state) => ({
            runsBySchedule: {
              ...state.runsBySchedule,
              [scheduleId]: (state.runsBySchedule[scheduleId] ?? []).map((run) =>
                run.id === resolved.id ? resolved : run,
              ),
            },
          }));
          await get().fetchSchedules();
        } catch (error) {
          if (!isCloudAccountEpochCurrent(account)) return;
          set((state) => ({
            runsErrorBySchedule: {
              ...state.runsErrorBySchedule,
              [scheduleId]:
                error instanceof Error ? error.message : 'The approval could not be sent',
            },
          }));
        } finally {
          if (isCloudAccountEpochCurrent(account)) {
            set((state) => ({
              approvalPendingByRun: { ...state.approvalPendingByRun, [runId]: false },
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
          approvalPendingByRun: {},
          loading: false,
          error: null,
        });
      },
    }),
    {
      name: 'schedule-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[scheduleStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        schedules: state.schedules,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useScheduleStore, 'schedule-store');
