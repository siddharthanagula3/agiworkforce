import 'server-only';

import { sendPushToUser } from '@/lib/services/push-notification-service';
import { logger } from '@/lib/logger';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';
import { usageResetReminderEnabled } from '@/lib/workflows/usage-reset-reminder-preference';

export const USAGE_RESET_REMINDER_NOTICE = {
  title: 'Your AGI usage limit has reset',
  body: 'You can send messages again.',
} as const;

export const USAGE_RESET_REMINDER_TYPE = 'usage_limit_reset';

export async function sendUsageResetReminderStep(userId: string): Promise<number> {
  'use step';

  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
  if (!(await usageResetReminderEnabled(db, userId))) return 0;

  const result = await sendPushToUser(userId, {
    ...USAGE_RESET_REMINDER_NOTICE,
    data: { type: USAGE_RESET_REMINDER_TYPE, url: '/chat' },
  });
  if (result.error) {
    logger.warn({ userId, error: result.error }, '[usage-reset-reminder] push lookup failed');
  }
  return result.sent;
}
