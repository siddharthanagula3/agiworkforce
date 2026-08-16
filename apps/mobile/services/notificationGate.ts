import type { NotificationEventType } from './notifications';

export function notificationAllowed(type: NotificationEventType): boolean {
  try {
    const mod =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/stores/notificationPrefsStore') as typeof import('@/stores/notificationPrefsStore');
    return mod.useNotificationPrefsStore.getState().shouldNotify(type);
  } catch {
    return true;
  }
}
