// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)

import { inferTaskInterval as inferSchedulerTaskInterval } from './schedulerStore';

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface Schedule {
  id: string;
  name: string;
  prompt: string;
  cronExpression: string;
  frequency: Frequency;
  nextRun: number | null;
  lastRun: number | null;
  isActive: boolean;
  createdAt: number;
  weekDays?: number[];
  hour?: number;
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

export function inferFrequency(cronExpression: string): Frequency {
  const interval = inferSchedulerTaskInterval(cronExpression);
  return interval === 'daily' || interval === 'weekly' || interval === 'monthly'
    ? interval
    : 'custom';
}

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
