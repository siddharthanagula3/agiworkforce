import type { DatabaseAdapter } from '@agiworkforce/data-layer';

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
