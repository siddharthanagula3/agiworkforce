import 'server-only';

import { sendPushToUser } from '@/lib/services/push-notification-service';
import { logger } from '@/lib/logger';

export const USAGE_RESET_REMINDER_NOTICE = {
  title: 'Your AGI usage limit has reset',
  body: 'You can send messages again.',
} as const;

export const USAGE_RESET_REMINDER_TYPE = 'usage_limit_reset';

export async function sendUsageResetReminderStep(userId: string): Promise<number> {
  'use step';

  const result = await sendPushToUser(userId, {
    ...USAGE_RESET_REMINDER_NOTICE,
    data: { type: USAGE_RESET_REMINDER_TYPE, url: '/chat' },
  });
  if (result.error) {
    logger.warn({ userId, error: result.error }, '[usage-reset-reminder] push lookup failed');
  }
  return result.sent;
}
