import { getNextExecutionAt, type ScheduleTiming } from '@/lib/schedules/schedule-time';
import type { ScheduleTask } from '../types';

const LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;
const SAMPLE_LIMIT = 8;

export function upcomingRuns(schedule: ScheduleTask, now: Date = new Date()): Date[] {
  if (!schedule.isEnabled || !schedule.nextExecutionAt || schedule.scheduleType === 'event') {
    return [];
  }
  const first = new Date(schedule.nextExecutionAt);
  if (!Number.isFinite(first.getTime())) return [];
  const runs = [first];
  if (schedule.scheduleType === 'once') return runs;

  const timing: ScheduleTiming = {
    scheduleType: schedule.scheduleType,
    cronExpression: schedule.cronExpression,
    executeAt: schedule.executeAt,
    intervalMs: schedule.intervalMs,
    recurrenceRule: schedule.recurrenceRule,
    dayparts: schedule.dayparts,
    timezone: schedule.timezone,
  };
  const horizon = now.getTime() + LOOKAHEAD_MS;
  let cursor = first;
  while (runs.length < SAMPLE_LIMIT) {
    let next: Date;
    try {
      next = getNextExecutionAt(timing, cursor, now);
    } catch {
      break;
    }
    if (next.getTime() <= cursor.getTime() || next.getTime() > horizon) break;
    runs.push(next);
    cursor = next;
  }
  return runs;
}

export function formatUpcomingRun(run: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: timezone }).format(run);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(run);
  }
}
