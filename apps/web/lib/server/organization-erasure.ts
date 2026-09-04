import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';

/**
 * Every table whose rows belong to one organization and are erased outright
 * when that organization is decommissioned. Built from every table in
 * `apps/web/db/neon/*.sql` that carries an `organization_id` column; most of
 * these already cascade at the database level (`references
 * public.organizations(id) on delete cascade`), but the deletes are explicit
 * here so a failure is reported per table instead of silently trusting the
 * constraint, and so storage bytes for `media_assets` can be freed before
 * their rows disappear.
 *
 * `organization-erasure.test.ts` classifies every organization-scoped table in
 * the schema into this list, `ORGANIZATION_ANONYMIZED_COLUMNS`, or
 * `ORGANIZATION_UNDELETED_TABLES`, so a new tenant table cannot be forgotten.
 */
export const ORGANIZATION_SCOPED_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'organization_members', column: 'organization_id' },
  { table: 'organization_invitations', column: 'organization_id' },
  { table: 'organization_model_policies', column: 'organization_id' },
  { table: 'organization_connector_policies', column: 'organization_id' },
  { table: 'organization_spend_limits', column: 'organization_id' },
  { table: 'organization_admin_policies', column: 'organization_id' },
  { table: 'organization_audit_destinations', column: 'organization_id' },
  { table: 'sso_connections', column: 'organization_id' },
  { table: 'directory_sync_connections', column: 'organization_id' },
  { table: 'directory_sync_events', column: 'organization_id' },
  { table: 'scim_tokens', column: 'organization_id' },
  { table: 'scim_provisioned_users', column: 'organization_id' },
  { table: 'scim_groups', column: 'organization_id' },
  { table: 'scim_group_members', column: 'organization_id' },
  { table: 'organization_shared_projects', column: 'organization_id' },
  { table: 'organization_project_access', column: 'organization_id' },
  { table: 'organization_shared_connectors', column: 'organization_id' },
  { table: 'organization_retention_sweeps', column: 'organization_id' },
  { table: 'legal_holds', column: 'organization_id' },
  { table: 'support_cases', column: 'organization_id' },
  { table: 'web_conversations', column: 'organization_id' },
  { table: 'web_artifacts', column: 'organization_id' },
  { table: 'user_memories', column: 'organization_id' },
  { table: 'media_assets', column: 'organization_id' },
  { table: 'scheduled_tasks', column: 'organization_id' },
  { table: 'cloud_agent_runs', column: 'organization_id' },
  { table: 'cloud_code_terminal_entries', column: 'organization_id' },
  { table: 'cloud_code_agent_turns', column: 'organization_id' },
  { table: 'cloud_code_sessions', column: 'organization_id' },
  { table: 'user_connectors', column: 'organization_id' },
  { table: 'user_custom_connectors', column: 'organization_id' },
  { table: 'api_keys', column: 'organization_id' },
  { table: 'managed_usage_requests', column: 'organization_id' },
  { table: 'usage_events', column: 'organization_id' },
  { table: 'search_history', column: 'organization_id' },
  { table: 'enterprise_audit_events', column: 'organization_id' },
];

/**
 * Tables where the row survives but the organization reference does not.
 * `organization_usage_ledger` is billing and cost-of-goods evidence, the same
 * reasoning `account-erasure.ts` applies to it for an erased user
 * (`ANONYMIZED_USER_COLUMNS`): the amount survives, the tenant it was billed to
 * does not.
 */
export const ORGANIZATION_ANONYMIZED_COLUMNS: ReadonlyArray<{
  table: string;
  column: string;
  reason: string;
}> = [
  {
    table: 'organization_usage_ledger',
    column: 'organization_id',
    reason: 'Cost-of-goods and billing history; the row survives, the tenant does not.',
  },
];

export const ORGANIZATION_UNDELETED_TABLES: Readonly<Record<string, string>> = {
  user_projects:
    'organization_id is ON DELETE SET NULL (0053_projects_managed_cloud_contract). A member’s project demotes to Personal scope rather than being destroyed when the workspace is decommissioned; ownership stays with the member who created it.',
  video_generation_jobs:
    'organization_id is ON DELETE SET NULL (0105_durable_video_generation_jobs). A billed video job is a financial/asset record that must survive the workspace it ran in, the same reasoning account-erasure.ts applies to this table for an erased user.',
};

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isSchemaAbsent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

export interface OrganizationErasureReport {
  organizationId: string;
  mediaObjectsDeleted: number;
  mediaObjectsFailed: number;
  mediaRowsDeleted: number;
  tables: Record<
    string,
    { deleted: boolean; skipped?: boolean; retainedForRetry?: boolean; error?: string }
  >;
  anonymized: Record<string, { updated: boolean; skipped?: boolean; error?: string }>;
  complete: boolean;
  organizationRetained: boolean;
  blockedByLegalHold: boolean;
}

export interface EraseOrganizationDataOptions {
  retainOrganizationRow?: boolean;
}

export async function eraseOrganizationMedia(
  organizationId: string,
): Promise<{ mediaObjectsDeleted: number; mediaObjectsFailed: number; mediaRowsDeleted: number }> {
  const db = getNeonDb();
  let rows: Array<{ id: string; storage_pathname: string | null }> = [];
  try {
    rows = await db.query<{ id: string; storage_pathname: string | null }>(
      `select id, storage_pathname from public.media_assets where organization_id = $1`,
      [organizationId],
    );
  } catch (error) {
    if (isSchemaAbsent(error))
      return { mediaObjectsDeleted: 0, mediaObjectsFailed: 0, mediaRowsDeleted: 0 };
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

export async function isOrganizationUnderActiveLegalHold(
  organizationId: string,
): Promise<{ held: boolean; error?: string }> {
  try {
    const rows = await getNeonDb().query<{ held: boolean }>(
      `select exists (
         select 1 from public.legal_holds
          where organization_id = $1 and released_at is null
       ) as held`,
      [organizationId],
    );
    return { held: rows[0]?.held === true };
  } catch (error) {
    if (isSchemaAbsent(error)) return { held: false };
    // Fail closed: an unreadable hold set may be concealing an active hold,
    // and erasing under one destroys evidence that cannot be recovered.
    return { held: true, error: error instanceof Error ? error.message : String(error) };
  }
}

function heldReport(organizationId: string, error: string | undefined): OrganizationErasureReport {
  return {
    organizationId,
    mediaObjectsDeleted: 0,
    mediaObjectsFailed: 0,
    mediaRowsDeleted: 0,
    tables: {
      legal_holds: {
        deleted: false,
        retainedForRetry: true,
        error: error
          ? `Legal hold status could not be read, so nothing was erased: ${error}`
          : 'Workspace is under an active legal hold; data preserved.',
      },
    },
    anonymized: {},
    complete: false,
    organizationRetained: true,
    blockedByLegalHold: true,
  };
}

export async function eraseOrganizationData(
  organizationId: string,
  options: EraseOrganizationDataOptions = {},
): Promise<OrganizationErasureReport> {
  const db = getNeonDb();

  const legalHold = await isOrganizationUnderActiveLegalHold(organizationId);
  if (legalHold.held) {
    logger.warn(
      { organizationId, error: legalHold.error },
      'Organization erasure declined: workspace is under an active legal hold',
    );
    return heldReport(organizationId, legalHold.error);
  }

  const media = await eraseOrganizationMedia(organizationId);
  const tables: OrganizationErasureReport['tables'] = {};
  const anonymized: OrganizationErasureReport['anonymized'] = {};

  for (const { table, column } of ORGANIZATION_SCOPED_TABLES) {
    if (table === 'media_assets') {
      tables[table] = { deleted: true };
      continue;
    }
    if (table === 'organization_members') {
      // assert_organization_has_owner() (0085_organization_seats_lifecycle)
      // refuses to leave an organization without an owner UNLESS the
      // organizations row itself is already gone, so membership is deleted by
      // the cascade off the final row delete below, not by this loop.
      continue;
    }
    try {
      await db.execute(`delete from public.${table} where ${column} = $1`, [organizationId]);
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
      logger.error({ organizationId, table, error }, 'Organization erasure failed for table');
    }
  }

  for (const { table, column } of ORGANIZATION_ANONYMIZED_COLUMNS) {
    try {
      await db.execute(`update public.${table} set ${column} = null where ${column} = $1`, [
        organizationId,
      ]);
      anonymized[table] = { updated: true };
    } catch (error) {
      if (isSchemaAbsent(error)) {
        anonymized[table] = { updated: false, skipped: true };
        continue;
      }
      anonymized[table] = {
        updated: false,
        error: error instanceof Error ? error.message : String(error),
      };
      logger.error(
        { organizationId, table, error },
        'Organization erasure failed to anonymize table',
      );
    }
  }

  const dataDisposed =
    media.mediaObjectsFailed === 0 &&
    Object.values(tables).every((result) => result.deleted || result.skipped === true) &&
    Object.values(anonymized).every((result) => result.updated || result.skipped === true);

  let complete = dataDisposed;
  let organizationRetained = true;
  if (dataDisposed && !options.retainOrganizationRow) {
    try {
      await db.execute(`delete from public.organizations where id = $1`, [organizationId]);
      organizationRetained = false;
      tables['organization_members'] = { deleted: true };
    } catch (error) {
      complete = false;
      tables['organization_members'] = { deleted: false, retainedForRetry: true };
      logger.error(
        { organizationId, error },
        'Organization erasure failed to delete the organization row',
      );
    }
  } else {
    tables['organization_members'] = { deleted: false, retainedForRetry: true };
  }

  return {
    organizationId,
    ...media,
    tables,
    anonymized,
    complete,
    organizationRetained,
    blockedByLegalHold: false,
  };
}
