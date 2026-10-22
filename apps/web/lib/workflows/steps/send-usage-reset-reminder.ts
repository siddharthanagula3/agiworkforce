import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { sendPushToUser } from '@/lib/services/push-notification-service';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

export const USAGE_RESET_REMINDER_NOTICE = {
  title: 'Your AGI usage limit has reset',
  body: 'You can send messages again.',
} as const;

export const USAGE_RESET_REMINDER_TYPE = 'usage_limit_reset';

export const USAGE_RESET_PREFERENCE_KEY = 'pushUsageReset';

export async function usageResetReminderEnabled(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
): Promise<boolean> {
  const [row] = await db.query<{ enabled: boolean | null }>(
    `select (settings -> 'notifications' ->> $2) is distinct from 'false' as enabled
       from public.user_settings
      where user_id = $1
      limit 1`,
    [userId, USAGE_RESET_PREFERENCE_KEY],
  );
  return row?.enabled ?? true;
}

export async function sendUsageResetReminderStep(userId: string): Promise<number> {
  'use step';

  if (!(await usageResetReminderEnabled(getNeonDb(), userId))) return 0;

  const result = await sendPushToUser(userId, {
    ...USAGE_RESET_REMINDER_NOTICE,
    data: { type: USAGE_RESET_REMINDER_TYPE, url: '/chat' },
  });
  if (result.error) {
    logger.warn({ userId, error: result.error }, '[usage-reset-reminder] push lookup failed');
  }
  return result.sent;
}
