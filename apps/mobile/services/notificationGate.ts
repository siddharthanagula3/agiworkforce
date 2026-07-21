import type { NotificationEventType } from './notifications';

/**
 * Whether a notification of `type` should fire given the user's saved
 * Notification Preferences (category toggles + quiet hours).
 *
 * The preferences store persists via a secure-storage backend that is not
 * available in every context (e.g. Jest without the native module), so we
 * lazy-`require` it at call time — keeping it out of the module-load graph of
 * the early, widely-imported notification service — and FAIL OPEN: a store load
 * error must never silently drop a notification (especially agent approvals).
 */
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
