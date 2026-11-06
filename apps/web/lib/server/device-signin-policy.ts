import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

import { DEVICE_SIGNIN_SETTINGS_NAMESPACE, DEVICE_SIGNIN_SETTING_KEY } from '@/features/settings/lib/device-signin-preferences';
export { DEVICE_SIGNIN_SETTINGS_NAMESPACE, DEVICE_SIGNIN_SETTING_KEY } from '@/features/settings/lib/device-signin-preferences';

export type DeviceCodeSignInPolicy = 'enabled' | 'disabled' | 'unavailable';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function readDeviceCodeSignInPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<DeviceCodeSignInPolicy> {
  try {
    const rows = await db.query<{ settings: unknown }>(
      `select settings from public.user_settings where user_id = $1 limit 1`,
      [userId],
    );
    if (rows.length === 0) return 'enabled';
    const settings = rows[0]?.settings;
    if (isObject(settings)) {
      if (!Object.hasOwn(settings, DEVICE_SIGNIN_SETTINGS_NAMESPACE)) return 'enabled';
      const namespace = settings[DEVICE_SIGNIN_SETTINGS_NAMESPACE];
      if (isObject(namespace)) {
        if (!Object.hasOwn(namespace, DEVICE_SIGNIN_SETTING_KEY)) return 'enabled';
        const enabled = namespace[DEVICE_SIGNIN_SETTING_KEY];
        if (typeof enabled === 'boolean') return enabled ? 'enabled' : 'disabled';
      }
    }
    logger.warn({ userId }, 'Device sign-in policy is malformed; refusing approval');
    return 'unavailable';
  } catch (error) {
    logger.warn({ userId, error }, 'Device sign-in policy read failed; refusing approval');
    return 'unavailable';
  }
}
