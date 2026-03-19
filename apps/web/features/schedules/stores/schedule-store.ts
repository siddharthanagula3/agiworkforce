'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { toast } from 'sonner';
import { getCsrfToken } from '@/lib/client/csrf';
import type { Schedule, ScheduleRun, ScheduleFormData } from '../types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ScheduleState {
  schedules: Schedule[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  deleting: boolean;
  // Dialog state
  dialogOpen: boolean;
  editingId: string | null;
  // Run history
  expandedHistoryId: string | null;
  runHistory: Record<string, ScheduleRun[]>;
  loadingHistoryId: string | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface ScheduleActions {
  fetchSchedules: () => Promise<void>;
  saveSchedule: (form: ScheduleFormData) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  toggleActive: (id: string, isActive: boolean) => Promise<void>;
  triggerRun: (id: string) => Promise<void>;
  duplicateSchedule: (schedule: Schedule) => void;
  openCreate: () => void;
  openEdit: (schedule: Schedule) => void;
  closeDialog: () => void;
  toggleHistory: (id: string) => Promise<void>;
  rerunFromHistory: (scheduleId: string, run: ScheduleRun) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: ScheduleState = {
  schedules: [],
  loading: true,
  error: null,
  saving: false,
  deleting: false,
  dialogOpen: false,
  editingId: null,
  expandedHistoryId: null,
  runHistory: {},
  loadingHistoryId: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useScheduleStore = create<ScheduleState & ScheduleActions>()(
  immer((set, get) => ({
    ...INITIAL_STATE,

    fetchSchedules: async () => {
      set((state) => {
        state.loading = true;
        state.error = null;
      });
      try {
        const res = await fetch('/api/schedules', { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`);
        const data = await res.json();
        set((state) => {
          state.schedules = data.schedules || [];
          state.loading = false;
        });
      } catch (err) {
        set((state) => {
          state.error = err instanceof Error ? err.message : 'Failed to load schedules';
          state.loading = false;
        });
      }
    },

    saveSchedule: async (form) => {
      const { editingId } = get();
      if (!form.name.trim()) {
        toast.error('Name is required');
        return;
      }
      if (!form.prompt.trim()) {
        toast.error('Prompt is required');
        return;
      }

      set((state) => {
        state.saving = true;
      });
      try {
        const csrfToken = await getCsrfToken();
        const isEdit = editingId !== null;
        const url = isEdit ? `/api/schedules/${editingId}` : '/api/schedules';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify(form),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { message?: string }).message ||
              `Failed to ${isEdit ? 'update' : 'create'} schedule`,
          );
        }

        toast.success(isEdit ? 'Schedule updated' : 'Schedule created');
        set((state) => {
          state.dialogOpen = false;
          state.editingId = null;
          state.saving = false;
        });
        await get().fetchSchedules();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Operation failed');
        set((state) => {
          state.saving = false;
        });
      }
    },

    deleteSchedule: async (id) => {
      set((state) => {
        state.deleting = true;
      });
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/schedules/${id}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'x-csrf-token': csrfToken },
        });
        if (!res.ok) throw new Error('Failed to delete schedule');
        toast.success('Schedule deleted');
        set((state) => {
          state.schedules = state.schedules.filter((s) => s.id !== id);
          state.deleting = false;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed');
        set((state) => {
          state.deleting = false;
        });
      }
    },

    toggleActive: async (id, isActive) => {
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/schedules/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({ isActive }),
        });
        if (!res.ok) throw new Error('Failed to toggle schedule');
        set((state) => {
          const s = state.schedules.find((sc) => sc.id === id);
          if (s) s.isActive = isActive;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Toggle failed');
      }
    },

    triggerRun: async (id) => {
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/schedules/${id}/runs`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
        });
        if (!res.ok) throw new Error('Failed to trigger run');
        toast.success('Run triggered');
        await get().fetchSchedules();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Trigger failed');
      }
    },

    duplicateSchedule: (schedule) => {
      set((state) => {
        state.editingId = null;
        state.dialogOpen = true;
      });
      // Return the form data pre-filled — SchedulesPage will pick this up
      // via openCreate with prefill. We expose it via a special key.
      // Since the form lives in the page, we signal via store state.
      // We store the prefill data on the store so ScheduleForm can read it.
      set((state) => {
        (state as ScheduleState & { _prefill?: Partial<ScheduleFormData> })._prefill = {
          name: `${schedule.name} (copy)`,
          prompt: schedule.prompt,
          model: schedule.model,
          recurrence: schedule.recurrence,
          timeOfDay: schedule.timeOfDay,
          timezone: schedule.timezone,
          isActive: false,
          cronExpression: schedule.cronExpression || '',
          daysOfWeek: schedule.daysOfWeek || [],
          dayOfMonth: schedule.dayOfMonth,
          notificationSettings: schedule.notificationSettings,
        };
      });
    },

    openCreate: () => {
      set((state) => {
        state.editingId = null;
        state.dialogOpen = true;
        (state as ScheduleState & { _prefill?: unknown })._prefill = undefined;
      });
    },

    openEdit: (schedule) => {
      set((state) => {
        state.editingId = schedule.id;
        state.dialogOpen = true;
        (state as ScheduleState & { _prefill?: unknown })._prefill = undefined;
      });
    },

    closeDialog: () => {
      set((state) => {
        state.dialogOpen = false;
        state.editingId = null;
        (state as ScheduleState & { _prefill?: unknown })._prefill = undefined;
      });
    },

    toggleHistory: async (id) => {
      const { expandedHistoryId, runHistory } = get();
      if (expandedHistoryId === id) {
        set((state) => {
          state.expandedHistoryId = null;
        });
        return;
      }
      set((state) => {
        state.expandedHistoryId = id;
      });
      if (runHistory[id]) return; // already cached

      set((state) => {
        state.loadingHistoryId = id;
      });
      try {
        const res = await fetch(`/api/schedules/${id}/runs?limit=10`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Failed to load history: ${res.statusText}`);
        const data = await res.json();
        set((state) => {
          state.runHistory[id] = data.runs || [];
          state.loadingHistoryId = null;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load run history');
        set((state) => {
          state.loadingHistoryId = null;
        });
      }
    },

    rerunFromHistory: async (scheduleId, _run) => {
      // Re-trigger the schedule immediately using the same prompt/config
      await get().triggerRun(scheduleId);
      // Invalidate cached history so next open refetches
      set((state) => {
        delete state.runHistory[scheduleId];
      });
    },
  })),
);

// ---------------------------------------------------------------------------
// Selector helpers
// ---------------------------------------------------------------------------

export function selectScheduleById(schedules: Schedule[], id: string): Schedule | undefined {
  return schedules.find((s) => s.id === id);
}
