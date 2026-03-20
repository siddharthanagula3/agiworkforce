/**
 * Notifications API — typed wrappers for notification_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface NotificationAction {
  id: string;
  title: string;
}
export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  scheduledAt: string;
  category?: string;
}
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}
export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  hasMore: boolean;
}
export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  types: Record<string, boolean>;
}
export interface CreateNotificationInput {
  type: string;
  title: string;
  body: string;
  [key: string]: unknown;
}

// ---- System Notifications ----

export async function notificationCheckPermission(): Promise<boolean> {
  return command<boolean>('notification_check_permission');
}
export async function notificationRequestPermission(): Promise<string> {
  return command<string>('notification_request_permission');
}
export async function notificationShow(title: string, body: string, icon?: string): Promise<void> {
  return command<void>('notification_show', { title, body, icon });
}
export async function notificationShowWithActions(
  title: string,
  body: string,
  actions: NotificationAction[],
): Promise<string> {
  return command<string>('notification_show_with_actions', { title, body, actions });
}
export async function notificationSchedule(
  title: string,
  body: string,
  at: string,
  icon?: string,
  category?: string,
): Promise<string> {
  return command<string>('notification_schedule', { title, body, at, icon, category });
}
export async function notificationScheduleReminder(
  title: string,
  body: string,
  at: string,
  actions?: NotificationAction[],
): Promise<string> {
  return command<string>('notification_schedule_reminder', { title, body, at, actions });
}
export async function notificationCancel(notificationId: string): Promise<void> {
  return command<void>('notification_cancel', { notificationId });
}
export async function notificationCancelAll(): Promise<number> {
  return command<number>('notification_cancel_all');
}
export async function notificationGetScheduled(): Promise<ScheduledNotification[]> {
  return command<ScheduledNotification[]>('notification_get_scheduled');
}
export async function notificationGet(
  notificationId: string,
): Promise<ScheduledNotification | null> {
  return command<ScheduledNotification | null>('notification_get', { notificationId });
}
export async function notificationUpdate(
  notificationId: string,
  title?: string,
  body?: string,
  at?: string,
): Promise<ScheduledNotification> {
  return command<ScheduledNotification>('notification_update', { notificationId, title, body, at });
}
export async function notificationRegisterActions(actions: NotificationAction[]): Promise<void> {
  return command<void>('notification_register_actions', { actions });
}

// ---- Notification Center ----

export async function notificationList(
  page?: number,
  pageSize?: number,
  unreadOnly?: boolean,
  notificationType?: string,
): Promise<NotificationListResponse> {
  return command<NotificationListResponse>('notification_list', {
    page,
    pageSize,
    unreadOnly,
    notificationType,
  });
}
export async function notificationMarkRead(notificationId: string): Promise<boolean> {
  return command<boolean>('notification_mark_read', { notificationId });
}
export async function notificationMarkAllRead(): Promise<number> {
  return command<number>('notification_mark_all_read');
}
export async function notificationDelete(notificationId: string): Promise<boolean> {
  return command<boolean>('notification_delete', { notificationId });
}
export async function notificationDeleteAllRead(): Promise<number> {
  return command<number>('notification_delete_all_read');
}
export async function notificationGetSettings(): Promise<NotificationSettings> {
  return command<NotificationSettings>('notification_get_settings');
}
export async function notificationSetSettings(settings: NotificationSettings): Promise<void> {
  return command<void>('notification_set_settings', { settings });
}
export async function notificationCreate(input: CreateNotificationInput): Promise<Notification> {
  return command<Notification>('notification_create', { input });
}
export async function notificationUnreadCount(): Promise<number> {
  return command<number>('notification_unread_count');
}
