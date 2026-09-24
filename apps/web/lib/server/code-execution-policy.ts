import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

export const CODE_EXECUTION_SETTINGS_NAMESPACE = 'capabilities';
export const CODE_EXECUTION_SETTING_KEY = 'cloudCodeExecution';

export type CloudCodeExecutionPolicy =
  { allowed: true } | { allowed: false; reason: 'disabled' | 'unavailable' };

/**
 * Whether this account allows cloud code execution.
 *
 * Default enabled only after a successful read: an absent setting has always
 * meant enabled, but a failed read cannot establish whether this user opted out.
 *
 * Enforced server-side because the execution tools are declared by the CLIENT
 * in the request body. A client-side check alone would be a preference the
 * caller could simply decline to honour.
 */
export async function resolveCloudCodeExecutionPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<CloudCodeExecutionPolicy> {
  try {
    const rows = await db.query<{ settings: Record<string, unknown> | null }>(
      `select settings from public.user_settings where user_id = $1 limit 1`,
      [userId],
    );
    const settings = rows[0]?.settings;
    if (!settings || typeof settings !== 'object') return { allowed: true };
    const namespace = (settings as Record<string, unknown>)[CODE_EXECUTION_SETTINGS_NAMESPACE];
    if (!namespace || typeof namespace !== 'object' || Array.isArray(namespace)) {
      return { allowed: true };
    }
    return (namespace as Record<string, unknown>)[CODE_EXECUTION_SETTING_KEY] === false
      ? { allowed: false, reason: 'disabled' }
      : { allowed: true };
  } catch (error) {
    logger.warn({ userId, error }, 'Code execution policy read failed; refusing execution');
    return { allowed: false, reason: 'unavailable' };
  }
}
