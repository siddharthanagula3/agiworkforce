import type { NotificationCategory } from '@/stores/notificationPrefsStore';

export interface NotificationCategoryCopy {
  label: string;
  description: string;
}

export const NOTIFICATION_CATEGORY_COPY: Record<NotificationCategory, NotificationCategoryCopy> = {
  approvals: {
    label: 'Approvals',
    description: 'Agent action approval requests',
  },
  task_updates: {
    label: 'Task Updates',
    description: 'Task completed, paused, or resumed',
  },
  errors: {
    label: 'Errors & Stops',
    description: 'Agent failures and emergency stops',
  },
  status: {
    label: 'Status Updates',
    description: 'Heartbeat and connection info',
  },
};

export const NOTIFICATION_CATEGORIES = Object.keys(
  NOTIFICATION_CATEGORY_COPY,
) as NotificationCategory[];

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(NOTIFICATION_CATEGORY_COPY, value)
  );
}
