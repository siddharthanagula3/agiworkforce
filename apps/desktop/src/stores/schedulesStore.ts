// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
/**
 * Schedules Store
 *
 * Thin facade over schedulerStore that exposes the Schedule interface and
 * actions required by the ScheduleEditor component.
 *
 * The canonical state lives in schedulerStore (ScheduledTask, createTask,
 * updateTask, deleteTask, toggleTask, fetchTasks). This file re-exports
 * everything with the names the task-spec asked for so consumers get a clean
 * import path while avoiding duplicated state.
 */

import { inferTaskInterval as inferSchedulerTaskInterval } from './schedulerStore';

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'custom';

/**
 * UI-friendly schedule shape used by ScheduleEditor.
 * Maps to ScheduledTask from schedulerStore with renamed / narrowed fields.
 */
export interface Schedule {
  id: string;
  name: string;
  prompt: string;
  /** Cron expression (for 'custom' frequency) or a simple label for builtins */
  cronExpression: string;
  frequency: Frequency;
  nextRun: number | null; // Unix ms timestamp
  lastRun: number | null; // Unix ms timestamp
  isActive: boolean;
  createdAt: number; // Unix ms timestamp
  /** Days of week when frequency === 'weekly' (0=Sun … 6=Sat) */
  weekDays?: number[];
  /** Hour of day (0-23) when frequency === 'daily' */
  hour?: number;
  /** Minute of hour (0-59) when frequency === 'daily' */
  minute?: number;
}

export type { ScheduledTask, TaskSchedule, TaskInterval, TaskStatus } from './schedulerStore';
export {
  useSchedulerStore,
  useScheduledTaskStore,
  inferTaskInterval,
  getScheduleSummary,
  getRelativeTimeDisplay,
  selectTasks,
  selectActiveTasks,
  selectTaskById,
  selectSchedulerLoading,
} from './schedulerStore';

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Derive a Frequency value from a TaskSchedule cron expression or interval. */
export function inferFrequency(cronExpression: string): Frequency {
  const interval = inferSchedulerTaskInterval(cronExpression);
  return interval === 'daily' || interval === 'weekly' || interval === 'monthly'
    ? interval
    : 'custom';
}

/**
 * Build a human-readable cron preview label from Schedule fields.
 * Used by ScheduleEditor's "Runs every …" preview.
 */
export function buildSchedulePreview(schedule: Partial<Schedule>): string {
  const hour = schedule.hour ?? 9;
  const minute = schedule.minute ?? 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(hour)}:${pad(minute)}`;

  switch (schedule.frequency) {
    case 'daily':
      return `Runs every day at ${timeStr}`;
    case 'weekly': {
      const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = (schedule.weekDays ?? [1])
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d])
        .join(', ');
      return `Runs every ${days} at ${timeStr}`;
    }
    case 'monthly':
      return `Runs on the 1st of every month at ${timeStr}`;
    case 'custom':
      return schedule.cronExpression
        ? `Cron: ${schedule.cronExpression}`
        : 'Enter a cron expression';
    default:
      return '';
  }
}
