import { getAutoRoutingProfiles, getCoreManualModelOptions } from '@agiworkforce/types';
import type {
  ManagedCloudScheduleRecurrence,
  ManagedCloudScheduleRun,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import type { ProductRecurrence } from '@/lib/schedules/schedule-time';

export type ScheduleStatus = ManagedCloudScheduleTask['status'];
export type ScheduleRunStatus = ManagedCloudScheduleRun['status'];
export type ScheduleTriggerSource = ManagedCloudScheduleRun['triggerSource'];

/** Canonical client representation returned by /api/schedules. */
export type ScheduleTask = ManagedCloudScheduleTask;

/** Canonical client representation returned by /api/schedules/[id]/runs. */
export type ScheduleRun = ManagedCloudScheduleRun;

export type IntervalUnit = 'minutes' | 'hours' | 'days';

/** UI-only editable state. It is converted to ScheduleMutation before transport. */
export interface ScheduleDraft {
  name: string;
  description: string;
  prompt: string;
  model: string;
  recurrence: ProductRecurrence;
  cronExpression: string;
  scheduledLocal: string;
  intervalValue: string;
  intervalUnit: IntervalUnit;
  timeOfDay: string;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  timezone: string;
  isActive: boolean;
  expiresLocal: string;
  maxExecutions: string;
}

/** Exact body accepted by the canonical schedule create/update service. */
export interface ScheduleMutation {
  name: string;
  description: string | null;
  prompt: string;
  model: string;
  recurrence: ManagedCloudScheduleRecurrence;
  cronExpression: string | null;
  scheduledAt: string | null;
  intervalMs: number | null;
  timeOfDay: string;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  timezone: string;
  isActive: boolean;
  expiresAt: string | null;
  maxExecutions: number | null;
}

export type ScheduleFormErrors = Partial<Record<keyof ScheduleDraft | 'form', string>>;

export const AVAILABLE_MODELS = [
  ...getAutoRoutingProfiles().map((profile) => ({
    value: profile.id,
    label: profile.label,
  })),
  ...getCoreManualModelOptions().map((model) => ({ value: model.id, label: model.label })),
];

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', longLabel: 'Sunday' },
  { value: 1, label: 'Mon', longLabel: 'Monday' },
  { value: 2, label: 'Tue', longLabel: 'Tuesday' },
  { value: 3, label: 'Wed', longLabel: 'Wednesday' },
  { value: 4, label: 'Thu', longLabel: 'Thursday' },
  { value: 5, label: 'Fri', longLabel: 'Friday' },
  { value: 6, label: 'Sat', longLabel: 'Saturday' },
] as const;

export function formatDateTime(value: string | null, timezone?: string): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(date);
  }
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return 'In progress';
  if (durationMs < 1_000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  return `${minutes} m ${seconds} s`;
}

export function recurrenceLabel(recurrence: ProductRecurrence): string {
  const labels: Record<ProductRecurrence, string> = {
    once: 'One Time',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    custom: 'Custom Cron',
    interval: 'Interval',
  };
  return labels[recurrence];
}

export function taskRecurrence(task: ScheduleTask): ProductRecurrence {
  const stored = task.metadata?.['productRecurrence'];
  if (['once', 'daily', 'weekly', 'monthly', 'custom', 'interval'].includes(String(stored))) {
    return stored as ProductRecurrence;
  }
  return task.scheduleType === 'cron' ? 'custom' : task.scheduleType;
}

export function scheduleResultText(run: ScheduleRun): string | null {
  const value = run.result?.['text'];
  return typeof value === 'string' && value.trim() ? value : null;
}
