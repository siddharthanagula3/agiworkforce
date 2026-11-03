import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  TIME_FOCUS_PREFERENCES_NAMESPACE,
  isQuietHoursExemptNotification,
  isDateWithinQuietHours,
  normalizeTimeFocusPreferences,
  quietHoursEndAt,
  type QuietHoursPreferences,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';

async function readQuietHours(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
): Promise<QuietHoursPreferences | null> {
  try {
    const [row] = await db.query<{ preferences: unknown }>(
      `select settings -> $2 as preferences
         from public.user_settings
        where user_id = $1
        limit 1`,
      [userId, TIME_FOCUS_PREFERENCES_NAMESPACE],
    );
    if (!row?.preferences) return null;
    return normalizeTimeFocusPreferences(row.preferences).quietHours;
  } catch (error) {
    logger.warn({ error, userId }, '[quiet-hours] could not read quiet hours; delivering');
    return null;
  }
}

export async function quietHoursEndFor(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const quietHours = await readQuietHours(db, userId);
  return quietHours ? quietHoursEndAt(now, quietHours) : null;
}

export async function heldByQuietHours(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
  notificationType: unknown,
  now: Date = new Date(),
): Promise<boolean> {
  if (isQuietHoursExemptNotification(notificationType)) return false;
  const quietHours = await readQuietHours(db, userId);
  return quietHours ? isDateWithinQuietHours(now, quietHours) : false;
}
