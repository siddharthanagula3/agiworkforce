import type { Schedule } from './store';

export type ScheduleSort = 'next-run' | 'recently-created';

export type ScheduleStatusFilter = 'all' | 'active' | 'paused' | 'completed';

export function matchesScheduleFilter(schedule: Schedule, filter: ScheduleStatusFilter): boolean {
  if (filter === 'all') return true;
  const completed = schedule.status === 'completed';
  if (filter === 'completed') return completed;
  if (completed) return false;
  return schedule.isActive === (filter === 'active');
}

function timestamp(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sortSchedules(schedules: readonly Schedule[], sort: ScheduleSort): Schedule[] {
  return [...schedules].sort((left, right) => {
    if (sort === 'next-run') {
      const nextRunDifference =
        timestamp(left.nextRunAt, Infinity) - timestamp(right.nextRunAt, Infinity);
      if (!Number.isNaN(nextRunDifference) && nextRunDifference !== 0) return nextRunDifference;
    }

    const createdDifference = timestamp(right.createdAt, 0) - timestamp(left.createdAt, 0);
    return createdDifference || left.id.localeCompare(right.id);
  });
}
