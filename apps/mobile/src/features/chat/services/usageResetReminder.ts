import {
  USAGE_RESET_REMINDER_PATH,
  type UsageResetReminderRequest,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { enablePushNotifications, getPushDeliveryStatus } from '@/services/notifications';
import { ACCOUNT_PUSH_PREFERENCE_GROUP } from '@/src/features/settings/notifications/categories';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';

export type UsageResetReminderOutcome = 'set' | 'blocked' | 'unreachable' | 'not_allowed';

function deliverResetRemindersOnDevice(): void {
  const prefs = useNotificationPrefsStore.getState();
  if (prefs.categoryEnabled[ACCOUNT_PUSH_PREFERENCE_GROUP] !== true) {
    prefs.setCategoryEnabled(ACCOUNT_PUSH_PREFERENCE_GROUP, true);
  }
}

export async function requestUsageResetReminder(
  resetAt: string,
): Promise<UsageResetReminderOutcome> {
  let device = await getPushDeliveryStatus();
  if (device === 'undetermined') device = await enablePushNotifications();
  if (device === 'denied') return 'blocked';
  if (device === 'unregistered') return 'unreachable';
  if (device !== 'granted') return 'not_allowed';
  await api.post(USAGE_RESET_REMINDER_PATH, { resetAt } satisfies UsageResetReminderRequest);
  deliverResetRemindersOnDevice();
  return 'set';
}
