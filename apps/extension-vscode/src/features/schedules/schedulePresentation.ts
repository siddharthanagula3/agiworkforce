import type {
  ManagedCloudScheduleRun,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';

export type ScheduleStatus = ManagedCloudScheduleTask['status'];
export type ScheduleRunStatus = ManagedCloudScheduleRun['status'];

interface ScheduleStatusFace {
  label: string;
  icon: string;
}

const SCHEDULE_STATUS_FACES: Record<ScheduleStatus, ScheduleStatusFace> = {
  active: { label: 'Active', icon: 'watch' },
  paused: { label: 'Paused', icon: 'debug-pause' },
  completed: { label: 'Completed', icon: 'pass' },
  failed: { label: 'Failed', icon: 'error' },
  expired: { label: 'Expired', icon: 'circle-slash' },
};

const RUN_STATUS_FACES: Record<ScheduleRunStatus, ScheduleStatusFace> = {
  running: { label: 'Running', icon: 'loading~spin' },
  success: { label: 'Succeeded', icon: 'pass' },
  failed: { label: 'Failed', icon: 'error' },
  timeout: { label: 'Timed out', icon: 'clock' },
  cancelled: { label: 'Cancelled', icon: 'circle-slash' },
};

export function scheduleStatusLabel(status: ScheduleStatus): string {
  return SCHEDULE_STATUS_FACES[status].label;
}

export function scheduleStatusIcon(status: ScheduleStatus): string {
  return SCHEDULE_STATUS_FACES[status].icon;
}

export function scheduleRunStatusLabel(status: ScheduleRunStatus): string {
  return RUN_STATUS_FACES[status].label;
}

export function scheduleRunStatusIcon(status: ScheduleRunStatus): string {
  return RUN_STATUS_FACES[status].icon;
}

export function scheduleTitle(task: ManagedCloudScheduleTask): string {
  return task.name.trim() || 'Untitled schedule';
}

export function scheduleCadence(task: ManagedCloudScheduleTask): string {
  if (task.scheduleType === 'cron') return task.cronExpression ?? 'On a cron schedule';
  if (task.scheduleType === 'interval') {
    return task.intervalMs === null ? 'On an interval' : `Every ${formatDuration(task.intervalMs)}`;
  }
  return task.executeAt === null ? 'Once' : `Once at ${formatTimestamp(task.executeAt)}`;
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
}

/**
 * An absent next run is unknown, never "now": a paused or completed schedule
 * reports none, and saying "due" there would claim something nothing checked.
 */
export function scheduleNextRunLabel(task: ManagedCloudScheduleTask, now = Date.now()): string {
  if (task.nextExecutionAt === null) return 'no next run';
  const next = Date.parse(task.nextExecutionAt);
  if (Number.isNaN(next)) return 'no next run';
  return next <= now
    ? `due ${formatDuration(now - next)} ago`
    : `next in ${formatDuration(next - now)}`;
}

export function scheduleLastRunLabel(task: ManagedCloudScheduleTask): string {
  if (task.lastError !== null && task.lastError.trim() !== '') return 'last run failed';
  if (task.lastExecutedAt === null) return 'never run';
  return `last ran ${formatTimestamp(task.lastExecutedAt)}`;
}

export function scheduleDescription(task: ManagedCloudScheduleTask, now = Date.now()): string {
  return [
    scheduleStatusLabel(task.status),
    scheduleCadence(task),
    scheduleNextRunLabel(task, now),
    scheduleLastRunLabel(task),
  ].join(' · ');
}

export function scheduleTooltipLines(task: ManagedCloudScheduleTask, now = Date.now()): string[] {
  const lines = [
    scheduleTitle(task),
    `${scheduleStatusLabel(task.status)} · ${scheduleCadence(task)} · ${task.timezone}`,
    scheduleNextRunLabel(task, now),
    scheduleLastRunLabel(task),
    `${task.executionCount} run${task.executionCount === 1 ? '' : 's'} so far`,
  ];
  if (task.model !== null && task.model.trim() !== '') lines.push(`Model: ${task.model}`);
  if (task.prompt !== null && task.prompt.trim() !== '') lines.push(task.prompt.trim());
  if (task.lastError !== null && task.lastError.trim() !== '') {
    lines.push(`Last error: ${task.lastError.trim()}`);
  }
  return lines;
}

export function scheduleContextValue(task: ManagedCloudScheduleTask): string {
  return task.isEnabled ? 'scheduleActive' : 'schedulePaused';
}

export function scheduleRunLabel(run: ManagedCloudScheduleRun): string {
  return `${scheduleRunStatusLabel(run.status)} · ${formatTimestamp(run.startedAt)}`;
}

export function scheduleRunDetail(run: ManagedCloudScheduleRun): string {
  const parts = [
    run.triggerSource === 'manual' ? 'run now' : run.triggerSource,
    run.durationMs === null ? 'no duration reported' : formatDuration(run.durationMs),
  ];
  if (run.attemptCount > 1) parts.push(`attempt ${run.attemptCount}`);
  if (run.error !== null && run.error.trim() !== '') parts.push(run.error.trim());
  return parts.join(' · ');
}

const SCHEDULE_FAILURE_REASON_MAX_LENGTH = 240;

export function describeScheduleFailure(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401) return 'your AGI Cloud session expired, sign in again';
  if (status === 403) return 'this account cannot manage schedules on its current plan';
  if (status === 404) return 'this schedule no longer exists';
  if (status === 409) return 'this schedule is already running';
  const raw = error instanceof Error ? error.message.trim() : String(error).trim();
  if (raw === '') return 'AGI Cloud gave no reason';
  return raw.length <= SCHEDULE_FAILURE_REASON_MAX_LENGTH
    ? raw
    : `${raw.slice(0, SCHEDULE_FAILURE_REASON_MAX_LENGTH - 1)}…`;
}

export function isRecoverableScheduleFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status !== 403 && status !== 404;
}
