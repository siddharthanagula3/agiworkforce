import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  TIME_FOCUS_PREFERENCES_NAMESPACE,
  isQuietHoursExemptNotification,
  normalizeTimeFocusPreferences,
  quietHoursRemainingMinutes,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';

export async function quietHoursEndFor(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
  now: Date = new Date(),
): Promise<Date | null> {
  try {
    const [row] = await db.query<{ preferences: unknown }>(
      `select settings -> $2 as preferences
         from public.user_settings
        where user_id = $1
        limit 1`,
      [userId, TIME_FOCUS_PREFERENCES_NAMESPACE],
    );
    if (!row?.preferences) return null;
    const { quietHours } = normalizeTimeFocusPreferences(row.preferences);
    const remaining = quietHoursRemainingMinutes(now, quietHours);
    return remaining === null ? null : new Date(now.getTime() + remaining * 60_000);
  } catch (error) {
    logger.warn({ error, userId }, '[quiet-hours] could not read quiet hours; delivering');
    return null;
  }
}

export async function heldByQuietHours(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
  notificationType: unknown,
  now: Date = new Date(),
): Promise<boolean> {
  if (isQuietHoursExemptNotification(notificationType)) return false;
  return (await quietHoursEndFor(db, userId, now)) !== null;
}
