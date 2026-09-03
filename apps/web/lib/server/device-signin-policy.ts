import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';

export const DEVICE_SIGNIN_SETTINGS_NAMESPACE = 'security';
export const DEVICE_SIGNIN_SETTING_KEY = 'deviceCodeSignInEnabled';

const PG_UNDEFINED_TABLE = '42P01';

export async function isDeviceCodeSignInEnabled(userId: string): Promise<boolean> {
  try {
    const rows = await getNeonDb().query<{ settings: Record<string, unknown> | null }>(
      `select settings from public.user_settings where user_id = $1 limit 1`,
      [userId],
    );
    const settings = rows[0]?.settings;
    if (!settings || typeof settings !== 'object') return true;
    const namespace = (settings as Record<string, unknown>)[DEVICE_SIGNIN_SETTINGS_NAMESPACE];
    if (!namespace || typeof namespace !== 'object' || Array.isArray(namespace)) return true;
    return (namespace as Record<string, unknown>)[DEVICE_SIGNIN_SETTING_KEY] !== false;
  } catch (error) {
    const code = (error as Record<string, unknown> | null)?.['code'];
    if (code !== PG_UNDEFINED_TABLE) {
      logger.warn({ userId, error }, 'Device sign-in policy read failed; allowing');
    }
    return true;
  }
}
