import { QUIET_HOURS_EXEMPT_EVENT_TYPES } from './notificationEventTypes';
import type { NotificationEventType } from './notifications';
import type { NotificationPriority } from './notificationChannels';

function prefs(): typeof import('@/stores/notificationPrefsStore') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/stores/notificationPrefsStore') as typeof import('@/stores/notificationPrefsStore');
}

export function notificationAllowed(type: NotificationEventType): boolean {
  try {
    return prefs().useNotificationPrefsStore.getState().shouldNotify(type);
  } catch (error) {
    console.warn('[notificationGate] preferences unreadable; holding routine notices', error);
    return QUIET_HOURS_EXEMPT_EVENT_TYPES.includes(type);
  }
}

export function vibrationAllowed(priority: NotificationPriority): boolean {
  try {
    return prefs().useNotificationPrefsStore.getState().vibrationEnabled[priority] !== false;
  } catch (error) {
    console.warn('[notificationGate] vibration preference unreadable; staying silent', error);
    return priority === 'critical';
  }
}
