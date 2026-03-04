import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

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

type CreateTaskInput = Omit<
  ScheduledTask,
  'id' | 'createdAt' | 'runCount' | 'lastRunAt' | 'nextRunAt' | 'lastOutput'
>;

interface ScheduledTaskState {
  tasks: ScheduledTask[];
  isLoading: boolean;
  createTask: (task: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, updates: Partial<ScheduledTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  runNow: (id: string) => Promise<void>;
  fetchTasks: () => Promise<void>;
}

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
const STORAGE_KEY = 'agiworkforce-scheduled-tasks-fallback';

function persistToStorage(tasks: ScheduledTask[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // ignore storage errors
  }
}

function loadFromStorage(): ScheduledTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScheduledTask[]) : [];
  } catch {
    return [];
  }
}

export const useScheduledTaskStore = create<ScheduledTaskState>()(
  devtools(
    persist(
      (set, get) => ({
        tasks: [],
        isLoading: false,

        fetchTasks: async () => {
          set({ isLoading: true });
          try {
            const tasks = await invoke<ScheduledTask[]>('scheduler_list_jobs');
            set({ tasks, isLoading: false });
          } catch {
            // Tauri command not available — fall back to localStorage
            const tasks = loadFromStorage();
            set({ tasks, isLoading: false });
          }
        },

        createTask: async (input) => {
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
            set((state) => {
              const tasks = [taskWithBackendId, ...state.tasks];
              persistToStorage(tasks);
              return { tasks };
            });
          } catch {
            // Fallback: store locally
            set((state) => {
              const tasks = [newTask, ...state.tasks];
              persistToStorage(tasks);
              return { tasks };
            });
          }
        },

        updateTask: async (id, updates) => {
          try {
            await invoke('scheduler_update_job', { id, updates });
          } catch {
            // Fallback: update locally only
          }
          set((state) => {
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
            persistToStorage(tasks);
            return { tasks };
          });
        },

        deleteTask: async (id) => {
          try {
            await invoke('scheduler_remove_job', { id });
          } catch {
            // Fallback: delete locally
          }
          set((state) => {
            const tasks = state.tasks.filter((t) => t.id !== id);
            persistToStorage(tasks);
            return { tasks };
          });
        },

        toggleTask: async (id) => {
          const task = get().tasks.find((t) => t.id === id);
          if (!task) return;

          const newStatus: TaskStatus = task.status === 'active' ? 'paused' : 'active';

          try {
            await invoke('scheduler_toggle_job', { id });
          } catch {
            // Fallback: toggle locally
          }
          set((state) => {
            const tasks = state.tasks.map((t) => (t.id === id ? { ...t, status: newStatus } : t));
            persistToStorage(tasks);
            return { tasks };
          });
        },

        runNow: async (id) => {
          try {
            await invoke('scheduler_run_job_now', { id });
          } catch {
            // Fallback: record local run attempt
          }
          const now = Date.now();
          set((state) => {
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
            persistToStorage(tasks);
            return { tasks };
          });
        },
      }),
      { name: 'agiworkforce-scheduled-tasks' },
    ),
    { name: 'ScheduledTaskStore' },
  ),
);

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
