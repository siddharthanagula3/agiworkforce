import { command } from '@agiworkforce/client-runtime';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationType =
  | 'system'
  | 'task_complete'
  | 'task_failed'
  | 'agent_activity'
  | 'mcp_server'
  | 'reminder'
  | 'achievement'
  | 'team'
  | 'info'
  | 'warning'
  | 'error';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  read: boolean;
  createdAt: string;
  readAt: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  icon: string | null;
  metadata: Record<string, unknown> | null;
  dismissible: boolean;
  expiresAt: string | null;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  badgeEnabled: boolean;
  desktopNotifications: boolean;
  enabledTypes: NotificationType[];
  doNotDisturb: boolean;
  dndStartTime: string | null;
  dndEndTime: string | null;
}

export async function notificationGetSettings(): Promise<NotificationSettings> {
  return command<NotificationSettings>('notification_get_settings');
}
export async function notificationSetSettings(settings: NotificationSettings): Promise<void> {
  return command<void>('notification_set_settings', { settings });
}
