/**
 * The in-app notification every surface reads.
 *
 * A row names what it is about (`category`), how loudly to say it
 * (`severity`), and what it points at as `(kind, id)` rather than as a path,
 * so each surface resolves its own link: a web route, a native deep link, or
 * nothing at all when that surface cannot show the target. `NOTIFICATION_
 * CATEGORIES` is the same set migration 0199 constrains the column to.
 */

export const NOTIFICATION_CATEGORIES = [
  'general',
  'agent_run',
  'schedule',
  'media',
  'research',
  'connector',
  'device',
  'security',
  'billing',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'error'] as const;

export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_TARGET_KINDS = [
  'chat',
  'settings',
  'file',
  'artifact',
  'work',
  'research',
  'schedule',
  'browser-task',
] as const;

export type NotificationTargetKind = (typeof NOTIFICATION_TARGET_KINDS)[number];

export interface NotificationTarget {
  kind: NotificationTargetKind;
  id: string;
}

export interface NotificationFeedItem {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationFeedResponse {
  notifications: NotificationFeedItem[];
  unreadCount: number;
}

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return (
    typeof value === 'string' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isNotificationSeverity(value: unknown): value is NotificationSeverity {
  return (
    typeof value === 'string' && (NOTIFICATION_SEVERITIES as readonly string[]).includes(value)
  );
}

export function isNotificationTargetKind(value: unknown): value is NotificationTargetKind {
  return (
    typeof value === 'string' && (NOTIFICATION_TARGET_KINDS as readonly string[]).includes(value)
  );
}
