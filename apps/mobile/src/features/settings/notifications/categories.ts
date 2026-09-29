import type { NotificationCategory } from '@/stores/notificationPrefsStore';

export interface NotificationCategoryCopy {
  label: string;
  description: string;
}

export const NOTIFICATION_CATEGORY_COPY: Record<NotificationCategory, NotificationCategoryCopy> = {
  chat_replies: {
    label: 'Chat replies',
    description: 'When a reply to your message is ready',
  },
  tasks: {
    label: 'Task and approval updates',
    description: 'Approval requests, finished or failed tasks, and scheduled runs',
  },
  product: {
    label: 'Product',
    description: 'Service status and connection info',
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

const LEGACY_NOTIFICATION_CATEGORY: Readonly<Record<string, NotificationCategory>> = {
  approvals: 'tasks',
  task_updates: 'tasks',
  errors: 'tasks',
  status: 'product',
};

export function resolveNotificationCategory(value: unknown): NotificationCategory | null {
  if (isNotificationCategory(value)) return value;
  if (typeof value !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(LEGACY_NOTIFICATION_CATEGORY, value)
    ? (LEGACY_NOTIFICATION_CATEGORY[value] ?? null)
    : null;
}
