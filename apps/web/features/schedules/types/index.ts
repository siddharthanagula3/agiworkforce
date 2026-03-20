// ---------------------------------------------------------------------------
// Shared types for the schedules feature
// ---------------------------------------------------------------------------

export interface Schedule {
  id: string;
  name: string;
  prompt: string;
  model: string;
  recurrence: string;
  cronExpression: string | null;
  scheduledAt: string | null;
  daysOfWeek: number[] | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  timezone: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: string | null;
  createdAt: string;
  updatedAt: string;
  // Notification preferences stored on the schedule
  notificationSettings?: NotificationSettings;
}

export interface ScheduleRun {
  id: string;
  scheduleId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  result: string | null;
  error: string | null;
  durationMs?: number | null;
}

export interface NotificationSettings {
  emailOnComplete: boolean;
  emailOnFailure: boolean;
  pushNotification: boolean;
  webhookUrl?: string;
}

export interface ScheduleFormData {
  name: string;
  prompt: string;
  model: string;
  recurrence: string;
  timeOfDay: string;
  timezone: string;
  isActive: boolean;
  // Advanced recurrence
  cronExpression: string;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  // Notifications
  notificationSettings: NotificationSettings;
}

export const INITIAL_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailOnComplete: false,
  emailOnFailure: true,
  pushNotification: false,
  webhookUrl: '',
};

export const INITIAL_FORM: ScheduleFormData = {
  name: '',
  prompt: '',
  model: 'auto-balanced',
  recurrence: 'daily',
  timeOfDay: '09:00',
  timezone:
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC',
  isActive: true,
  cronExpression: '',
  daysOfWeek: [],
  dayOfMonth: null,
  notificationSettings: INITIAL_NOTIFICATION_SETTINGS,
};

export const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Sao_Paulo', label: 'BRT' },
  { value: 'Europe/London', label: 'GMT' },
  { value: 'Europe/Paris', label: 'CET' },
  { value: 'Europe/Berlin', label: 'CET/Berlin' },
  { value: 'Asia/Dubai', label: 'GST' },
  { value: 'Asia/Kolkata', label: 'IST' },
  { value: 'Asia/Singapore', label: 'SGT' },
  { value: 'Asia/Tokyo', label: 'JST' },
  { value: 'Australia/Sydney', label: 'AEDT' },
  { value: 'UTC', label: 'UTC' },
];

export const AVAILABLE_MODELS = [
  { value: 'auto-balanced', label: 'Auto (Balanced)' },
  { value: 'auto-fast', label: 'Auto (Fast)' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
];

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function recurrenceLabel(r: string): string {
  const labels: Record<string, string> = {
    once: 'One-time',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    custom: 'Custom Cron',
  };
  return labels[r] || r;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function getNextRunCountdown(nextRunAt: string | null): string {
  if (!nextRunAt) return '';
  const diff = new Date(nextRunAt).getTime() - Date.now();
  if (diff <= 0) return 'overdue';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}
