import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

export const CODE_EXECUTION_SETTINGS_NAMESPACE = 'capabilities';
export const CODE_EXECUTION_SETTING_KEY = 'cloudCodeExecution';

const PG_UNDEFINED_TABLE = '42P01';

/**
 * Whether this account allows cloud code execution.
 *
 * Default TRUE: the capability predates the switch, and defaulting to off would
 * break every existing conversation that relies on it. A read failure also
 * returns true, refusing a tool the user never opted out of, because a
 * settings query blipped, would look like the product breaking at random.
 *
 * Enforced server-side because the execution tools are declared by the CLIENT
 * in the request body. A client-side check alone would be a preference the
 * caller could simply decline to honour.
 */
export async function isCloudCodeExecutionEnabled(
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
    const namespace = (settings as Record<string, unknown>)[CODE_EXECUTION_SETTINGS_NAMESPACE];
    if (!namespace || typeof namespace !== 'object' || Array.isArray(namespace)) return true;
    return (namespace as Record<string, unknown>)[CODE_EXECUTION_SETTING_KEY] !== false;
  } catch (error) {
    const code = (error as Record<string, unknown> | null)?.['code'];
    if (code !== PG_UNDEFINED_TABLE) {
      logger.warn({ userId, error }, 'Code execution policy read failed; allowing');
    }
    return true;
  }
}
