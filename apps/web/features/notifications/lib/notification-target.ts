import { isProductLinkId, isProductLinkTarget, productLinkPath } from '@agiworkforce/types';
import {
  SETTINGS_DEEP_LINK_QUERY_KEY,
  isWebSettingsSection,
} from '@/features/settings/lib/web-settings-sections';

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

export type NotificationTargetKind =
  'chat' | 'settings' | 'file' | 'artifact' | 'work' | 'research' | 'schedule' | 'browser-task';

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

export function notificationTargetHref(
  kind: string | null | undefined,
  id: string | null | undefined,
): string | null {
  if (!kind || !id || !isProductLinkId(id)) return null;
  if (kind === 'chat') return `/chat/${encodeURIComponent(id)}`;
  if (kind === 'settings') {
    return isWebSettingsSection(id)
      ? `/chat?${SETTINGS_DEEP_LINK_QUERY_KEY}=${encodeURIComponent(id)}`
      : null;
  }
  return isProductLinkTarget(kind) ? productLinkPath(kind, id) : null;
}
