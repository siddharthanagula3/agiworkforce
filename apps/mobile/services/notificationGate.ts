import type { NotificationEventType } from './notifications';
import type { NotificationPriority } from './notificationChannels';

function prefs(): typeof import('@/stores/notificationPrefsStore') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/stores/notificationPrefsStore') as typeof import('@/stores/notificationPrefsStore');
}

export function notificationAllowed(type: NotificationEventType): boolean {
  try {
    return prefs().useNotificationPrefsStore.getState().shouldNotify(type);
  } catch {
    return true;
  }
}

export function vibrationAllowed(priority: NotificationPriority): boolean {
  try {
    return prefs().useNotificationPrefsStore.getState().vibrationEnabled[priority] !== false;
  } catch {
    return true;
  }
}
