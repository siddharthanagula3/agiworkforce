import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';

/**
 * PER-24 — the erasure that account deletion always claimed to perform.
 *
 * `DELETE /api/user/delete-account` set `deletion_requested_at` /
 * `deletion_scheduled_for` and told the user "your account and all data will be
 * permanently deleted within 24 hours" — but the background job it referred to
 * did not exist, and the manual fallback in `DELETE /api/user/data` deleted a
 * list of eleven tables that included neither the user's conversations, nor
 * their artifacts, nor their memories, nor their settings, nor their media.
 * Nothing anywhere removed the R2 objects, and (before PER-26) those objects
 * were addressable by a permanent public URL. That is an erasure gap, not a
 * storage leak.
 *
 * This module is the single implementation, shared by the immediate GDPR
 * deletion route and the scheduled purge cron.
 */

/**
 * User-scoped tables, in FK-safe order. Children that declare
 * `on delete cascade` (web_messages, web_artifact_versions,
 * scheduled_task_runs) are deliberately absent: deleting the parent removes
 * them, and listing them separately would be a second source of truth.
 *
 * Every entry was verified against `apps/web/db/neon/*.sql`; a table that does
 * not exist on a given deployment is reported as skipped rather than failing
 * the erasure.
 */
export const USER_SCOPED_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  // Chat + generated content
  { table: 'web_conversations', column: 'user_id' },
  { table: 'web_artifacts', column: 'user_id' },
  { table: 'chat_folders', column: 'user_id' },
  { table: 'conversation_tags', column: 'user_id' },
  { table: 'conversation_branches', column: 'user_id' },
  { table: 'message_bookmarks', column: 'user_id' },
  { table: 'message_reactions', column: 'user_id' },
  { table: 'shared_conversations', column: 'user_id' },
  { table: 'shared_sessions', column: 'owner_id' },
  // Personalization + memory
  { table: 'user_memories', column: 'user_id' },
  { table: 'user_settings', column: 'user_id' },
  { table: 'user_projects', column: 'user_id' },
  { table: 'user_shortcuts', column: 'user_id' },
  { table: 'search_history', column: 'user_id' },
  // Automation + integrations
  { table: 'scheduled_tasks', column: 'user_id' },
  { table: 'user_connectors', column: 'user_id' },
  { table: 'user_custom_connectors', column: 'user_id' },
  { table: 'connector_tool_permissions', column: 'user_id' },
  // Account surface
  { table: 'notifications', column: 'user_id' },
  { table: 'feedback', column: 'user_id' },
  { table: 'api_keys', column: 'user_id' },
  { table: 'user_two_factor', column: 'user_id' },
  { table: 'account_sessions', column: 'user_id' },
  { table: 'credit_transactions', column: 'user_id' },
  { table: 'token_credits', column: 'user_id' },
  { table: 'beta_redemptions', column: 'user_id' },
  { table: 'email_preferences', column: 'user_id' },
  { table: 'device_authorization_codes', column: 'user_id' },
  { table: 'desktop_devices', column: 'user_id' },
  { table: 'mobile_devices', column: 'user_id' },
  { table: 'sync_data', column: 'user_id' },
  { table: 'organization_members', column: 'user_id' },
  { table: 'subscriptions', column: 'user_id' },
  // Parent row last.
  { table: 'profiles', column: 'id' },
];

export interface AccountErasureReport {
  userId: string;
  /** R2 objects successfully removed. */
  mediaObjectsDeleted: number;
  /** R2 objects that could not be removed; their rows are retained for retry. */
  mediaObjectsFailed: number;
  /** `media_assets` rows removed. */
  mediaRowsDeleted: number;
  /** Per-table outcome. `skipped` means the table does not exist here. */
  tables: Record<string, { deleted: boolean; skipped?: boolean; error?: string }>;
  /** True when every table AND every stored object was disposed of. */
  complete: boolean;
}

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isSchemaAbsent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

/**
 * Delete the user's stored media BYTES and then their catalog rows.
 *
 * Bytes first: a row whose object deletion failed keeps its `storage_pathname`
 * so a later run can retry. Deleting the row first would destroy the only
 * pointer to a live object.
 */
export async function eraseUserMedia(
  userId: string,
): Promise<
  Pick<AccountErasureReport, 'mediaObjectsDeleted' | 'mediaObjectsFailed' | 'mediaRowsDeleted'>
> {
  const db = getNeonDb();
  let rows: Array<{ id: string; storage_pathname: string | null }> = [];
  try {
    rows = await db.query<{ id: string; storage_pathname: string | null }>(
      `select id, storage_pathname from public.media_assets where user_id = $1`,
      [userId],
    );
  } catch (error) {
    if (isSchemaAbsent(error)) {
      return { mediaObjectsDeleted: 0, mediaObjectsFailed: 0, mediaRowsDeleted: 0 };
    }
    throw error;
  }

  if (rows.length === 0) {
    return { mediaObjectsDeleted: 0, mediaObjectsFailed: 0, mediaRowsDeleted: 0 };
  }

  const { deleted, failedPathnames } = await deleteStoredMediaObjects(
    rows.map((row) => row.storage_pathname),
  );
  const stillStored = new Set(failedPathnames);
  const deletableIds = rows
    .filter((row) => !row.storage_pathname || !stillStored.has(row.storage_pathname))
    .map((row) => row.id);

  let mediaRowsDeleted = 0;
  if (deletableIds.length > 0) {
    const purged = await db.query<{ id: string }>(
      `delete from public.media_assets where id = any($1::uuid[]) returning id`,
      [deletableIds],
    );
    mediaRowsDeleted = purged.length;
  }

  return {
    mediaObjectsDeleted: deleted,
    mediaObjectsFailed: failedPathnames.length,
    mediaRowsDeleted,
  };
}

/**
 * Erase every user-scoped record we own for `userId`, including the stored
 * media bytes. Per-table failures are recorded rather than thrown so one
 * missing table cannot leave the rest of the account behind; the caller
 * inspects `complete` to decide whether to report success.
 */
export async function eraseUserAccountData(userId: string): Promise<AccountErasureReport> {
  const db = getNeonDb();
  const media = await eraseUserMedia(userId);
  const tables: AccountErasureReport['tables'] = {};

  for (const { table, column } of USER_SCOPED_TABLES) {
    try {
      // Identifiers come from the hardcoded USER_SCOPED_TABLES constant above;
      // the only user-controlled value is bound as $1.
      await db.execute(`delete from public.${table} where ${column} = $1`, [userId]);
      tables[table] = { deleted: true };
    } catch (error) {
      if (isSchemaAbsent(error)) {
        tables[table] = { deleted: false, skipped: true };
        continue;
      }
      tables[table] = {
        deleted: false,
        error: error instanceof Error ? error.message : String(error),
      };
      logger.error({ userId, table, error }, 'Account erasure failed for table');
    }
  }

  const complete =
    media.mediaObjectsFailed === 0 &&
    Object.values(tables).every((result) => result.deleted || result.skipped === true);

  return { userId, ...media, tables, complete };
}
