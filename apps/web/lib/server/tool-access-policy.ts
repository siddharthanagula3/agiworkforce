import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  DEFAULT_TOOL_ACCESS_MODE,
  parseToolAccessMode,
  type ToolAccessMode,
} from '@/lib/tool-access-mode';

/**
 * The account's choice of when connector tools load. It only shapes how many
 * schemas a turn carries up front, never which tools are permitted, so a
 * failed read falls back to Auto rather than refusing the turn.
 */
export async function resolveToolAccessMode(
  db: DatabaseAdapter,
  userId: string,
): Promise<ToolAccessMode> {
  try {
    const rows = await db.query<{ tool_access: unknown }>(
      `select settings -> 'capabilities' ->> 'toolAccess' as tool_access
         from public.user_settings
        where user_id = $1
        limit 1`,
      [userId],
    );
    return parseToolAccessMode(rows[0]?.tool_access);
  } catch (error) {
    logger.warn({ userId, error }, 'Tool access preference read failed; using Auto');
    return DEFAULT_TOOL_ACCESS_MODE;
  }
}
