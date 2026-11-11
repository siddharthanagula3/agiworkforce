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
import { recordFailure } from '@/lib/observability/metrics';

export class QuietHoursUnreadableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The saved quiet hours could not be read', options);
    this.name = 'QuietHoursUnreadableError';
  }
}

function requestedQuietHours(preferences: unknown): boolean {
  if (typeof preferences !== 'object' || preferences === null) return false;
  const quiet = (preferences as Record<string, unknown>)['quietHours'];
  return (
    typeof quiet === 'object' &&
    quiet !== null &&
    (quiet as Record<string, unknown>)['enabled'] === true
  );
}

function unreadable(userId: string, cause: unknown): QuietHoursUnreadableError {
  logger.warn(
    { error: cause, userId },
    '[quiet-hours] could not read quiet hours; holding the notice',
  );
  recordFailure('notification', 'quiet_hours_unreadable');
  return new QuietHoursUnreadableError({ cause });
}

async function readQuietHours(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
): Promise<QuietHoursPreferences | null> {
  let preferences: unknown;
  try {
    const [row] = await db.query<{ preferences: unknown }>(
      `select settings -> $2 as preferences
         from public.user_settings
        where user_id = $1
        limit 1`,
      [userId, TIME_FOCUS_PREFERENCES_NAMESPACE],
    );
    preferences = row?.preferences;
  } catch (error) {
    throw unreadable(userId, error);
  }
  if (!preferences) return null;
  const { quietHours } = normalizeTimeFocusPreferences(preferences);
  if (!quietHours.enabled && requestedQuietHours(preferences)) {
    throw unreadable(userId, new Error('The saved quiet hours are not a valid schedule'));
  }
  return quietHours;
}

export async function quietHoursEndFor(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
  now: Date = new Date(),
  notificationType?: unknown,
): Promise<Date | null> {
  if (isQuietHoursExemptNotification(notificationType)) return null;
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
