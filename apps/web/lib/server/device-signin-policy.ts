import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

export const DEVICE_SIGNIN_SETTINGS_NAMESPACE = 'security';
export const DEVICE_SIGNIN_SETTING_KEY = 'deviceCodeSignInEnabled';

const PG_UNDEFINED_TABLE = '42P01';

/**
 * Whether this account allows headless device-code sign-in.
 *
 * Default TRUE: the flow predates the switch, and defaulting to off would sign
 * every existing CLI and desktop install out at deploy. A read failure also
 * returns true, refusing approvals because a settings query blipped would lock
 * users out of their own devices, and the flow still requires an authenticated
 * human to approve a code they were shown.
 */
export async function isDeviceCodeSignInEnabled(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  try {
    const rows = await db.query<{ settings: Record<string, unknown> | null }>(
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
