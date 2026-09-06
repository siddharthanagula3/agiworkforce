import 'server-only';

import { randomUUID } from 'node:crypto';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { deleteStoredMediaObjects } from '@/lib/server/media-storage';
import {
  deleteObject,
  isObjectStorageConfigured,
  objectKeyFromPublicUrl,
  objectKeyFromStorageUri,
} from '@/lib/server/object-storage';
import {
  deleteProjectKnowledgeObject,
  isProjectKnowledgeObjectStorageConfigured,
} from '@/lib/server/project-knowledge-object-storage';
import { deleteE2BSessionsForUser } from '@/lib/e2b/session-store';

export const USER_SCOPED_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'web_conversations', column: 'user_id' },
  { table: 'web_artifacts', column: 'user_id' },
  { table: 'web_artifact_index', column: 'user_id' },
  { table: 'research_reports', column: 'user_id' },
  { table: 'published_artifacts', column: 'user_id' },
  { table: 'conversations', column: 'user_id' },
  { table: 'chat_messages', column: 'user_id' },
  { table: 'chat_folders', column: 'user_id' },
  { table: 'conversation_tags', column: 'user_id' },
  { table: 'conversation_branches', column: 'user_id' },
  { table: 'message_bookmarks', column: 'user_id' },
  { table: 'message_reactions', column: 'user_id' },
  { table: 'shared_conversations', column: 'user_id' },
  { table: 'shared_sessions', column: 'owner_id' },
  { table: 'cloud_agent_runs', column: 'user_id' },
  { table: 'cloud_code_sessions', column: 'user_id' },
  { table: 'user_memories', column: 'user_id' },
  { table: 'user_settings', column: 'user_id' },
  { table: 'user_projects', column: 'user_id' },
  { table: 'user_shortcuts', column: 'user_id' },
  { table: 'user_skills', column: 'user_id' },
  { table: 'search_history', column: 'user_id' },
  { table: 'scheduled_tasks', column: 'user_id' },
  { table: 'user_connectors', column: 'user_id' },
  { table: 'user_custom_connectors', column: 'user_id' },
  { table: 'connector_tool_permissions', column: 'user_id' },
  { table: 'connector_oauth_grants', column: 'user_id' },
  { table: 'connector_oauth_authorizations', column: 'user_id' },
  { table: 'mcp_app_payloads', column: 'user_id' },
  { table: 'mcp_task_bindings', column: 'user_id' },
  { table: 'messaging_connections', column: 'user_id' },
  { table: 'github_installations', column: 'user_id' },
  { table: 'plugin_installations', column: 'user_id' },
  { table: 'plugin_marketplace_sources', column: 'user_id' },
  { table: 'plugin_marketplace_installations', column: 'user_id' },
  { table: 'agent_tool_executions', column: 'user_id' },
  { table: 'agent_tools', column: 'user_id' },
  { table: 'agent_approval_requests', column: 'user_id' },
  { table: 'notifications', column: 'user_id' },
  { table: 'feedback', column: 'user_id' },
  { table: 'api_keys', column: 'user_id' },
  { table: 'user_two_factor', column: 'user_id' },
  { table: 'account_sessions', column: 'user_id' },
  { table: 'account_lockout_attempts', column: 'user_id' },
  { table: 'device_authorization_codes', column: 'user_id' },
  { table: 'desktop_devices', column: 'user_id' },
  { table: 'mobile_devices', column: 'user_id' },
  { table: 'device_pairings', column: 'user_id' },
  { table: 'device_refresh_tokens', column: 'user_id' },
  { table: 'revoked_jwts', column: 'user_id' },
  { table: 'sync_data', column: 'user_id' },
  { table: 'support_ticket_replies', column: 'user_id' },
  { table: 'support_tickets', column: 'user_id' },
  { table: 'support_action_proposals', column: 'user_id' },
  { table: 'support_handoff_sessions', column: 'owner_user_id' },
  { table: 'email_preferences', column: 'user_id' },
  { table: 'waitlist', column: 'user_id' },
  { table: 'cloud_managed_waitlist', column: 'user_id' },
  { table: 'consent_records', column: 'user_id' },
  { table: 'data_rights_requests', column: 'user_id' },
  { table: 'beta_redemptions', column: 'user_id' },
  { table: 'beta_applications', column: 'user_id' },
  { table: 'feature_flags', column: 'user_id' },
  { table: 'usage_events', column: 'user_id' },
  { table: 'mobile_iap_transactions', column: 'user_id' },
  { table: 'mobile_iap_accounts', column: 'user_id' },
  { table: 'video_generation_jobs', column: 'user_id' },
  { table: 'managed_usage_requests', column: 'user_id' },
  { table: 'credit_transactions', column: 'user_id' },
  { table: 'token_credits', column: 'user_id' },
  { table: 'subscriptions', column: 'user_id' },
  { table: 'organization_members', column: 'user_id' },
  { table: 'profiles', column: 'id' },
];

const PROFILE_TABLE = 'profiles';

async function deleteBetaApplicationsByEmail(
  db: { execute: (sql: string, params: unknown[]) => Promise<unknown> },
  userId: string,
): Promise<void> {
  try {
    await db.execute(
      `delete from public.beta_applications
        where lower(email) in (
          select lower(email) from public.profiles where id = $1 and email is not null
        )`,
      [userId],
    );
  } catch (error) {
    if (isSchemaAbsent(error)) return;
    logger.error({ userId, error }, 'Account erasure failed to clear beta applications by email');
    throw error;
  }
}

export const ANONYMIZED_USER_COLUMNS: ReadonlyArray<{
  table: string;
  column: string;
  reason: string;
}> = [
  {
    table: 'content_reports',
    column: 'user_id',
    reason: 'Abuse reports are moderation evidence about OTHER users content.',
  },
  {
    table: 'organization_usage_ledger',
    column: 'user_id',
    reason: 'Organization billing history; the row survives, the reporter does not.',
  },
  {
    table: 'project_knowledge_files',
    column: 'added_by_user_id',
    reason: 'Files this user added to an organization-shared project owned by someone else.',
  },
  {
    table: 'provider_cost_events',
    column: 'user_id',
    reason:
      'What managed cloud paid a provider is a cost record; the spend survives, the subject does not.',
  },
  {
    table: 'cogs_adjustments',
    column: 'user_id',
    reason:
      'Processing fees, refunds and chargebacks are financial records; the amount survives, the subject does not.',
  },
];

export const UNDELETED_USER_TABLES: Readonly<Record<string, string>> = {
  media_assets: 'Erased by eraseUserMedia(): bytes first, then rows.',
  cloud_agent_events: 'Cascades from cloud_agent_runs.',
  cloud_agent_approval_checkpoints: 'Cascades from cloud_agent_runs.',
  cloud_agent_execution_operations: 'Cascades from cloud_agent_runs.',
  cloud_code_terminal_entries: 'Cascades from cloud_code_sessions.',
  cloud_code_agent_turns: 'Cascades from cloud_code_sessions.',
  managed_usage_request_extensions: 'Cascades from managed_usage_requests.',
  free_daily_usage_reservations: 'Cascades from profiles.',
  identities:
    'Cascades from profiles (0174). The provider-subject mapping is owner-only, so no scoped delete could reach it.',
  website_auto_economy_trial_usage: 'Cascades from profiles.',
  web_push_subscriptions: 'Cascades from profiles.',
  organization_project_access:
    'Cascades from organization_members. Grants this user issued to other members keep granted_by_user_id, which is not nullable.',
  erasure_tombstones:
    'The suppression list itself (0103). Deleting it would erase the record that this subject must stay erased.',
  security_audit_logs:
    'Append-only for the app role (0043_audit_log_immutability); only the SECURITY DEFINER delete_user_data() purges it.',
  enterprise_audit_events:
    'Append-only organization compliance trail (0087_enterprise_audit_event_writes).',
  credit_idempotency_keys: 'Double-charge protection outlives the account it protected.',
  credit_settlement_jobs: 'In-flight money movement; dropping a pending job loses a settlement.',
  beta_invites: 'created_by is invite provenance for invitees who still hold the code.',
  sso_connections: 'created_by is organization configuration, not personal content.',
  organizations:
    'Deleting an organization because its creator left would erase every other member. Ownership transfer is a separate flow.',
  support_agent_presence: 'Support-staff roster, not customer data.',
};

export interface AccountErasureReport {
  userId: string;
  mediaObjectsDeleted: number;
  mediaObjectsFailed: number;
  mediaRowsDeleted: number;
  knowledgeObjectsDeleted: number;
  knowledgeObjectsFailed: number;
  avatarObjectsDeleted: number;
  avatarObjectsFailed: number;
  cacheKeysDeleted: number;
  cacheKeysFailed: number;
  tables: Record<
    string,
    { deleted: boolean; skipped?: boolean; retainedForRetry?: boolean; error?: string }
  >;
  anonymized: Record<string, { updated: boolean; skipped?: boolean; error?: string }>;
  complete: boolean;
  profileRetained: boolean;
}

export interface EraseUserAccountOptions {
  retainProfile?: boolean;
  scope?: 'account' | 'data';
}

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isSchemaAbsent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

async function releaseDataVideoErasureFence(userId: string, fenceToken: string): Promise<void> {
  try {
    await getNeonDb().execute(
      `update public.profiles
          set video_generation_erasure_fence_token = null,
              video_generation_erasure_fence_expires_at = null
        where id = $1
          and video_generation_erasure_fence_token = $2`,
      [userId, fenceToken],
    );
  } catch (error) {
    logger.error({ userId, error }, 'Could not release the data-only video erasure fence');
  }
}

async function sealAndCheckVideoJobsForErasure(
  userId: string,
  scope: 'account' | 'data',
): Promise<{
  blocked: boolean;
  error?: string;
  dataFenceToken?: string;
}> {
  const db = getNeonDb();
  let provisioned = false;
  try {
    const schema = await db.query<{ provisioned: boolean }>(
      `select to_regclass('public.video_generation_jobs') is not null as provisioned`,
    );
    provisioned = schema[0]?.provisioned === true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: message }, 'Could not inspect durable video erasure schema');
    return { blocked: true, error: message };
  }
  if (!provisioned) return { blocked: false };

  let dataFenceToken: string | undefined;
  try {
    const fenced =
      scope === 'account'
        ? await db.query<{ id: string }>(
            `update public.profiles
                set deletion_requested_at = coalesce(deletion_requested_at, now()),
                    deletion_scheduled_for = coalesce(deletion_scheduled_for, now())
              where id = $1
                and (
                  video_generation_admission_token is null
                  or video_generation_admission_expires_at <= now()
                )
                and (
                  video_generation_erasure_fence_token is null
                  or video_generation_erasure_fence_expires_at <= now()
                )
            returning id`,
            [userId],
          )
        : await (async () => {
            dataFenceToken = randomUUID();
            return db.query<{ id: string }>(
              `update public.profiles
                  set video_generation_erasure_fence_token = $2,
                      video_generation_erasure_fence_expires_at = now() + interval '1 hour'
                where id = $1
                  and deletion_scheduled_for is null
                  and (
                    video_generation_admission_token is null
                    or video_generation_admission_expires_at <= now()
                  )
                  and (
                    video_generation_erasure_fence_token is null
                    or video_generation_erasure_fence_expires_at <= now()
                  )
              returning id`,
              [userId, dataFenceToken],
            );
          })();
    if (!fenced[0]) {
      return {
        blocked: true,
        error:
          scope === 'account'
            ? 'The profile deletion fence matched no account row.'
            : 'The data-erasure fence could not be acquired without changing account-deletion state.',
      };
    }

    const rows = await db.query<{ has_blocking: boolean }>(
      `select (
         exists (
           select 1
             from public.video_generation_jobs
            where user_id = $1
              and (
                status in ('submitting', 'queued', 'processing')
                or incident_alert_status in ('pending', 'exhausted')
              )
         )
         or exists (
           select 1
             from public.managed_usage_requests request_row
           where request_row.user_id = $1
              and request_row.idempotency_key like 'agi.media.%.video.%'
              and (
                request_row.status in ('reserving', 'reserved', 'provider_started')
                or request_row.final_settlement_status = 'pending'
              )
         )
         or exists (
           select 1
             from public.credit_settlement_jobs settlement
            where settlement.user_id = $1
              and settlement.status = 'pending'
              and settlement.metadata->>'type' = 'managed_usage_finalization'
              and settlement.metadata #>> '{usage,operation}' = 'video'
         )
         or exists (
           select 1
             from public.credit_settlement_jobs settlement
            where settlement.user_id = $1
              and settlement.status = 'terminal'
              and settlement.metadata->>'type' = 'managed_usage_finalization'
              and settlement.metadata #>> '{usage,operation}' = 'video'
              and (
                settlement.video_incident_alert_status is null
                or settlement.video_incident_alert_status in ('pending', 'exhausted')
              )
              and (
                settlement.metadata #>> '{usage,jobId}' is null
                or not exists (
                  select 1
                    from public.video_generation_jobs alert_job
                   where alert_job.id::text = settlement.metadata #>> '{usage,jobId}'
                     and alert_job.incident_alert_status = 'delivered'
                )
              )
         )
       ) as has_blocking`,
      [userId],
    );
    const blocked = rows[0]?.has_blocking === true;
    if (blocked && dataFenceToken) {
      await releaseDataVideoErasureFence(userId, dataFenceToken);
      dataFenceToken = undefined;
    }
    return { blocked, ...(dataFenceToken ? { dataFenceToken } : {}) };
  } catch (error) {
    if (dataFenceToken) await releaseDataVideoErasureFence(userId, dataFenceToken);
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: message }, 'Could not prove video jobs terminal before erasure');
    return { blocked: true, error: message };
  }
}

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

async function deleteObjectKeys(
  keys: ReadonlyArray<string>,
  kind: string,
  options: {
    configured?: () => boolean;
    deleteKey?: (key: string) => Promise<void>;
  } = {},
): Promise<{ deleted: number; failed: number }> {
  if (keys.length === 0) return { deleted: 0, failed: 0 };
  const configured = options.configured ?? isObjectStorageConfigured;
  const deleteKey = options.deleteKey ?? deleteObject;
  if (!configured()) {
    logger.warn({ kind, count: keys.length }, 'Object storage is not configured; objects retained');
    return { deleted: 0, failed: keys.length };
  }

  let deleted = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      await deleteKey(key);
      deleted++;
    } catch (error) {
      failed++;
      logger.warn({ kind, key, error }, 'Failed to delete stored object');
    }
  }
  return { deleted, failed };
}

async function eraseUserKnowledgeObjects(
  userId: string,
): Promise<{ deleted: number; failed: number }> {
  const db = getNeonDb();
  let rows: Array<{ storage_uri: string | null }> = [];
  try {
    rows = await db.query<{ storage_uri: string | null }>(
      `select k.storage_uri
         from public.project_knowledge_files k
         join public.user_projects p on p.id = k.project_id
        where p.user_id = $1
          and k.storage_uri is not null`,
      [userId],
    );
  } catch (error) {
    if (isSchemaAbsent(error)) return { deleted: 0, failed: 0 };
    throw error;
  }

  const keys = rows
    .map((row) => (row.storage_uri ? objectKeyFromStorageUri(row.storage_uri) : null))
    .filter((key): key is string => Boolean(key));
  return deleteObjectKeys(keys, 'knowledge-file', {
    configured: isProjectKnowledgeObjectStorageConfigured,
    deleteKey: deleteProjectKnowledgeObject,
  });
}

async function eraseUserAvatarObject(userId: string): Promise<{ deleted: number; failed: number }> {
  const db = getNeonDb();
  let rows: Array<{ avatar_url: string | null }> = [];
  try {
    rows = await db.query<{ avatar_url: string | null }>(
      `select avatar_url from public.profiles where id = $1`,
      [userId],
    );
  } catch (error) {
    if (isSchemaAbsent(error)) return { deleted: 0, failed: 0 };
    throw error;
  }

  const url = rows[0]?.avatar_url;
  const key = url ? objectKeyFromPublicUrl(url) : null;
  return deleteObjectKeys(key ? [key] : [], 'avatar');
}

async function isSubjectUnderLegalHold(userId: string): Promise<{ held: boolean; error?: string }> {
  try {
    const rows = await getNeonDb().query<{ held: boolean }>(
      `select exists (
         select 1
           from public.legal_holds hold
          where hold.released_at is null
            and (
              (hold.scope = 'member' and hold.subject_user_id = $1)
              or (
                hold.scope = 'organization'
                and hold.organization_id in (
                  select organization_id
                    from public.organization_members
                   where user_id = $1
                )
              )
            )
       ) as held`,
      [userId],
    );
    return { held: rows[0]?.held === true };
  } catch (error) {
    // Fail closed: an unreadable hold set may be concealing an active hold, and
    // erasing under one destroys evidence that cannot be recovered.
    return { held: true, error: error instanceof Error ? error.message : String(error) };
  }
}

function heldReport(userId: string, error: string | undefined): AccountErasureReport {
  return {
    userId,
    mediaObjectsDeleted: 0,
    mediaObjectsFailed: 0,
    mediaRowsDeleted: 0,
    knowledgeObjectsDeleted: 0,
    knowledgeObjectsFailed: 0,
    avatarObjectsDeleted: 0,
    avatarObjectsFailed: 0,
    cacheKeysDeleted: 0,
    cacheKeysFailed: 0,
    tables: {
      legal_holds: {
        deleted: false,
        retainedForRetry: true,
        error: error
          ? `Legal hold status could not be read, so nothing was erased: ${error}`
          : 'Subject is under an active legal hold; data preserved.',
      },
      [PROFILE_TABLE]: { deleted: false, retainedForRetry: true },
    },
    anonymized: {},
    complete: false,
    profileRetained: true,
  };
}

export async function eraseUserAccountData(
  userId: string,
  options: EraseUserAccountOptions = {},
): Promise<AccountErasureReport> {
  const db = getNeonDb();
  const legalHold = await isSubjectUnderLegalHold(userId);
  if (legalHold.held) {
    logger.warn(
      { userId, error: legalHold.error },
      'Account erasure declined: subject is under an active legal hold',
    );
    return heldReport(userId, legalHold.error);
  }
  const videoGate = await sealAndCheckVideoJobsForErasure(userId, options.scope ?? 'account');
  if (videoGate.blocked) {
    return {
      userId,
      mediaObjectsDeleted: 0,
      mediaObjectsFailed: 0,
      mediaRowsDeleted: 0,
      knowledgeObjectsDeleted: 0,
      knowledgeObjectsFailed: 0,
      avatarObjectsDeleted: 0,
      avatarObjectsFailed: 0,
      cacheKeysDeleted: 0,
      cacheKeysFailed: 0,
      tables: {
        video_generation_jobs: {
          deleted: false,
          retainedForRetry: true,
          ...(videoGate.error ? { error: videoGate.error } : {}),
        },
        [PROFILE_TABLE]: { deleted: false, retainedForRetry: true },
      },
      anonymized: {},
      complete: false,
      profileRetained: true,
    };
  }
  try {
    const media = await eraseUserMedia(userId);
    const knowledge = await eraseUserKnowledgeObjects(userId);
    const avatar = await eraseUserAvatarObject(userId);
    const cache = await deleteE2BSessionsForUser(userId);
    const tables: AccountErasureReport['tables'] = {};
    const anonymized: AccountErasureReport['anonymized'] = {};

    // beta_applications is the one user-scoped table whose identity is usually
    // the email, not user_id: applying does not require an account, so most
    // rows have a null user_id and the generic delete below cannot see them.
    // Without this sweep an erased user's name and email survive in the intake
    // table indefinitely.
    await deleteBetaApplicationsByEmail(db, userId);

    for (const { table, column } of ANONYMIZED_USER_COLUMNS) {
      try {
        await db.execute(`update public.${table} set ${column} = null where ${column} = $1`, [
          userId,
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
        logger.error({ userId, table, error }, 'Account erasure failed to anonymize table');
      }
    }

    for (const { table, column } of USER_SCOPED_TABLES) {
      if (table === PROFILE_TABLE) continue;
      if (table === 'user_projects' && knowledge.failed > 0) {
        tables[table] = { deleted: false, retainedForRetry: true };
        continue;
      }
      try {
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

    const dataDisposed =
      media.mediaObjectsFailed === 0 &&
      knowledge.failed === 0 &&
      avatar.failed === 0 &&
      cache.failed === 0 &&
      Object.values(tables).every((result) => result.deleted || result.skipped === true) &&
      Object.values(anonymized).every((result) => result.updated || result.skipped === true);

    let complete = dataDisposed;
    let profileRetained = true;
    if (dataDisposed && !options.retainProfile) {
      try {
        await eraseProfileRow(userId);
        tables[PROFILE_TABLE] = { deleted: true };
        profileRetained = false;
      } catch (error) {
        if (isSchemaAbsent(error)) {
          tables[PROFILE_TABLE] = { deleted: false, skipped: true };
          profileRetained = false;
        } else {
          complete = false;
          tables[PROFILE_TABLE] = {
            deleted: false,
            error: error instanceof Error ? error.message : String(error),
          };
          logger.error({ userId, error }, 'Account erasure failed to delete the profile row');
        }
      }
    } else {
      tables[PROFILE_TABLE] = { deleted: false, retainedForRetry: true };
    }

    return {
      userId,
      ...media,
      knowledgeObjectsDeleted: knowledge.deleted,
      knowledgeObjectsFailed: knowledge.failed,
      avatarObjectsDeleted: avatar.deleted,
      avatarObjectsFailed: avatar.failed,
      cacheKeysDeleted: cache.deleted,
      cacheKeysFailed: cache.failed,
      tables,
      anonymized,
      complete,
      profileRetained,
    };
  } finally {
    if (videoGate.dataFenceToken) {
      await releaseDataVideoErasureFence(userId, videoGate.dataFenceToken);
    }
  }
}

export async function eraseProfileRow(userId: string): Promise<void> {
  const db = getNeonDb();
  await db.execute(`delete from public.${PROFILE_TABLE} where id = $1`, [userId]);
}

const TOMBSTONE_TABLE = 'erasure_tombstones';

export interface ErasureTombstoneResult {
  recorded: boolean;
  skipped?: boolean;
  error?: string;
}

export async function openErasureTombstone(userId: string): Promise<ErasureTombstoneResult> {
  const db = getNeonDb();
  try {
    await db.execute(
      `insert into public.${TOMBSTONE_TABLE} (user_id)
       values ($1)
       on conflict (user_id) do update
          set last_swept_at = now()`,
      [userId],
    );
    return { recorded: true };
  } catch (error) {
    if (isSchemaAbsent(error)) return { recorded: false, skipped: true };
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: message }, 'Failed to record the erasure tombstone');
    return { recorded: false, error: message };
  }
}

export async function closeErasureTombstone(userId: string): Promise<ErasureTombstoneResult> {
  const db = getNeonDb();
  try {
    await db.execute(
      `update public.${TOMBSTONE_TABLE}
          set erased_at = now()
        where user_id = $1
          and erased_at is null`,
      [userId],
    );
    return { recorded: true };
  } catch (error) {
    if (isSchemaAbsent(error)) return { recorded: false, skipped: true };
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: message }, 'Failed to settle the erasure tombstone');
    return { recorded: false, error: message };
  }
}
