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
  deleteBackupObject,
  forgetBackupReplicas,
  resolveObjectBackupTarget,
} from '@/lib/server/object-backup';
import {
  deleteProjectKnowledgeObject,
  isProjectKnowledgeObjectStorageConfigured,
} from '@/lib/server/project-knowledge-object-storage';
import { deleteE2BSessionsForUser } from '@/lib/e2b/session-store';
import {
  mcpAuthorizationContext,
  purgeMcpResponseCachePartitions,
} from '@/lib/connectors/mcp-runtime-cache';

export const USER_SCOPED_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'retrieval_chunks', column: 'user_id' },
  { table: 'retrieval_documents', column: 'user_id' },
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
  { table: 'work_plans', column: 'user_id' },
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
  { table: 'device_registrations', column: 'user_id' },
  { table: 'connector_call_events', column: 'user_id' },
  { table: 'event_trigger_events', column: 'user_id' },
  { table: 'event_triggers', column: 'user_id' },
  { table: 'background_jobs', column: 'user_id' },
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
  { table: 'routing_decision_traces', column: 'user_id' },
  { table: 'product_analytics_events', column: 'user_id' },
  { table: 'usage_events', column: 'user_id' },
  { table: 'mobile_iap_transactions', column: 'user_id' },
  { table: 'mobile_iap_accounts', column: 'user_id' },
  { table: 'video_generation_jobs', column: 'user_id' },
  { table: 'image_generation_jobs', column: 'user_id' },
  { table: 'managed_usage_requests', column: 'user_id' },
  { table: 'credit_transactions', column: 'user_id' },
  { table: 'token_credits', column: 'user_id' },
  { table: 'subscriptions', column: 'user_id' },
  { table: 'organization_members', column: 'user_id' },
  { table: 'study_sessions', column: 'user_id' },
  { table: 'context_manifests', column: 'user_id' },
  { table: 'notebook_runs', column: 'user_id' },
  { table: 'file_lineage', column: 'user_id' },
  { table: 'identity_risk_observations', column: 'user_id' },
  { table: 'account_compromise_responses', column: 'user_id' },
  { table: 'authentication_attempts', column: 'user_id' },
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

/**
 * mcp_response_cache is keyed by a digest of the authorization context and has
 * no subject column, so the rows can only be reached by rebuilding each context
 * this account's connectors cached under. Deleting the connector rows first
 * would leave the cached bodies unreachable and permanent.
 */
async function eraseConnectorResponseCache(
  db: { query: <T>(sql: string, params: unknown[]) => Promise<T[]> },
  userId: string,
): Promise<number> {
  const contexts: string[] = [];

  try {
    const custom = await db.query<{ id: string; url: string }>(
      'select id, url from public.user_custom_connectors where user_id = $1',
      [userId],
    );
    for (const row of custom) {
      contexts.push(mcpAuthorizationContext.userCustomConnector(userId, row.id));
      contexts.push(mcpAuthorizationContext.userCustomUrl(userId, row.url));
    }
  } catch (error) {
    if (!isSchemaAbsent(error)) throw error;
  }

  try {
    const granted = await db.query<{ connector_id: string }>(
      'select connector_id from public.connector_oauth_grants where user_id = $1',
      [userId],
    );
    for (const row of granted) {
      contexts.push(mcpAuthorizationContext.userOauthConnector(userId, row.connector_id));
      contexts.push(mcpAuthorizationContext.operatorConnector(row.connector_id));
    }
  } catch (error) {
    if (!isSchemaAbsent(error)) throw error;
  }

  return purgeMcpResponseCachePartitions(contexts);
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

/**
 * Why the subject's own money rows are deleted while the platform's are only
 * anonymized. Both are financial records; only one of them is a record the
 * platform still owes anyone once the account is gone.
 */
export const FINANCIAL_ERASURE_DISPOSITION: Readonly<Record<string, string>> = {
  credit_transactions:
    "The subject's own ledger of credits bought and spent. 0126's credit_transactions_owner_immutable trigger refuses any update that moves user_id, so there is no anonymized form of this row to keep, and credit_account_id references a token_credits row that goes with the account. What the platform must still be able to prove, what it charged and what it paid, survives in provider_cost_events, cogs_adjustments and organization_usage_ledger with the subject removed, and the invoice itself sits with the payment processor.",
  token_credits:
    'The current balance and period window. Anonymizing it would leave an ownerless balance the reset and settlement paths would keep servicing; it is erased with the account, as the retention schedule already states.',
  subscriptions:
    'Current plan state, one row per account. A subscription without a subscriber is not a financial record, it is a live entitlement; it is erased with the account, as the retention schedule already states.',
};

export const UNDELETED_USER_TABLES: Readonly<Record<string, string>> = {
  media_assets: 'Erased by eraseUserMedia(): bytes first, then rows.',
  cloud_agent_events: 'Cascades from cloud_agent_runs.',
  cloud_agent_approval_checkpoints: 'Cascades from cloud_agent_runs.',
  cloud_agent_execution_operations: 'Cascades from cloud_agent_runs.',
  cloud_code_terminal_entries: 'Cascades from cloud_code_sessions.',
  image_generation_job_assets:
    'Cascades from image_generation_jobs (0226), and from media_assets via asset_id, so eraseUserMedia already takes it.',
  support_access_events:
    'Append-only break-glass trail (0229), hash-chained on previous_hash. actor_user_id is the support agent who acted, not the subject, and deleting a row breaks the chain verifySupportAccessTrail verifies.',
  cloud_code_agent_turns: 'Cascades from cloud_code_sessions.',
  work_plan_steps: 'Cascades from work_plans (0237) on (plan_id, user_id).',
  work_plan_revisions: 'Cascades from work_plans (0237) on (plan_id, user_id).',
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
  organization_roles:
    'created_by is organization configuration (0200): a custom role outlives the member who defined it.',
  organization_member_roles:
    'Cascades from organization_members (0200). Grants this user issued to other members keep granted_by_user_id as provenance.',
  organization_group_roles:
    'A directory group grant is organization configuration (0200); granted_by_user_id is provenance, not personal content.',
  organization_group_managers:
    'Cascades from organization_members (0200). Delegations this user issued keep granted_by_user_id as provenance.',
  organization_admin_api_keys:
    'created_by is organization configuration (0206): a workspace API key belongs to the workspace and outlives the admin who issued it.',
  organizations:
    'Deleting an organization because its creator left would erase every other member. Ownership transfer is a separate flow.',
  support_agent_presence: 'Support-staff roster, not customer data.',
  web_messages: 'Cascades from web_conversations (0001).',
  published_artifact_versions:
    'Cascades from published_artifacts (0257), which carries every version of an artifact this account published.',
  organization_admin_delegations:
    'Cascades from profiles (0256) on delegate_user_id and on granted_by_user_id. A delegation this user granted to somebody else is workspace configuration, and revoking it when the grantor leaves would drop the other member’s admin access.',
};

export interface AccountErasureReport {
  userId: string;
  mediaObjectsDeleted: number;
  mediaObjectsFailed: number;
  mediaRowsDeleted: number;
  backupObjectsDeleted: number;
  backupObjectsFailed: number;
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

/**
 * The image half of this fence has no profile columns of its own. 0226 gave
 * image jobs a cascade from managed_usage_requests rather than video's RESTRICT,
 * so nothing blocks the delete, but a job still queued or still owing a
 * settlement is unfinished paid work, and erasing the account mid-flight
 * abandons it exactly as it would for video. The job row's own status and
 * settlement columns are the whole signal: an image idempotency key comes from
 * the caller's header, so there is no server-side key pattern to match, and no
 * image settlement writes managed_usage_finalization metadata.
 */
const VIDEO_JOB_TABLE = 'video_generation_jobs';
const IMAGE_JOB_TABLE = 'image_generation_jobs';

const IMAGE_JOB_BLOCKING = `
         exists (
           select 1
             from public.image_generation_jobs
            where user_id = $1
              and (
                status in ('queued', 'processing')
                or billing_settlement_status = 'pending'
              )
         )`;

async function sealAndCheckMediaJobsForErasure(
  userId: string,
  scope: 'account' | 'data',
): Promise<{
  blocked: boolean;
  blockedBy?: string;
  error?: string;
  dataFenceToken?: string;
}> {
  const db = getNeonDb();
  let videoProvisioned = false;
  let imageProvisioned = false;
  try {
    const schema = await db.query<{ video: boolean; image: boolean }>(
      `select to_regclass('public.video_generation_jobs') is not null as video,
              to_regclass('public.image_generation_jobs') is not null as image`,
    );
    videoProvisioned = schema[0]?.video === true;
    imageProvisioned = schema[0]?.image === true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: message }, 'Could not inspect durable media erasure schema');
    return { blocked: true, error: message };
  }
  if (!videoProvisioned && !imageProvisioned) return { blocked: false };

  let dataFenceToken: string | undefined;
  try {
    // The fence columns arrived with the video migration, so there is nothing to
    // seal until it is applied. An image-only deployment still gets the blocking
    // check below.
    const fenced = !videoProvisioned
      ? [{ id: userId }]
      : scope === 'account'
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

    const videoBlocking = `
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
         )`;

    const rows = await db.query<{ video_blocking: boolean; image_blocking: boolean }>(
      `select (${videoProvisioned ? videoBlocking : 'false'}
       ) as video_blocking,
              (${imageProvisioned ? IMAGE_JOB_BLOCKING : 'false'}
       ) as image_blocking`,
      [userId],
    );
    const blockedBy = rows[0]?.video_blocking
      ? VIDEO_JOB_TABLE
      : rows[0]?.image_blocking
        ? IMAGE_JOB_TABLE
        : null;
    const blocked = blockedBy !== null;
    if (blocked && dataFenceToken) {
      await releaseDataVideoErasureFence(userId, dataFenceToken);
      dataFenceToken = undefined;
    }
    return {
      blocked,
      ...(blockedBy ? { blockedBy } : {}),
      ...(dataFenceToken ? { dataFenceToken } : {}),
    };
  } catch (error) {
    if (dataFenceToken) await releaseDataVideoErasureFence(userId, dataFenceToken);
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ userId, error: message }, 'Could not prove media jobs terminal before erasure');
    return { blocked: true, error: message };
  }
}

/**
 * The backup bucket is a copy of what existed, and an erasure that stops at the
 * primary leaves the subject's objects restorable from it. The hourly
 * reconciliation would reach them eventually; an erasure request cannot wait
 * for a round of a round-robin sweep, so the copies go with the originals.
 */
async function eraseBackupCopies(
  keys: ReadonlyArray<string>,
): Promise<{ deleted: number; failed: number }> {
  if (keys.length === 0) return { deleted: 0, failed: 0 };
  const target = resolveObjectBackupTarget();
  if (!target) return { deleted: 0, failed: 0 };

  const removed: string[] = [];
  let failed = 0;
  for (const key of keys) {
    try {
      const outcome = await deleteBackupObject(key, { target });
      if (outcome === 'deleted') removed.push(key);
      else if (outcome === 'absent') removed.push(key);
    } catch (error) {
      failed += 1;
      logger.warn({ key, error }, 'Failed to delete the backup copy of an erased object');
    }
  }

  try {
    await forgetBackupReplicas(removed);
  } catch (error) {
    logger.warn({ error }, 'Backup replica records outlived the objects they tracked');
  }

  return { deleted: removed.length, failed };
}

export async function eraseUserMedia(
  userId: string,
): Promise<
  Pick<
    AccountErasureReport,
    | 'mediaObjectsDeleted'
    | 'mediaObjectsFailed'
    | 'mediaRowsDeleted'
    | 'backupObjectsDeleted'
    | 'backupObjectsFailed'
  >
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
      return {
        mediaObjectsDeleted: 0,
        mediaObjectsFailed: 0,
        mediaRowsDeleted: 0,
        backupObjectsDeleted: 0,
        backupObjectsFailed: 0,
      };
    }
    throw error;
  }

  if (rows.length === 0) {
    return {
      mediaObjectsDeleted: 0,
      mediaObjectsFailed: 0,
      mediaRowsDeleted: 0,
      backupObjectsDeleted: 0,
      backupObjectsFailed: 0,
    };
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

  const backup = await eraseBackupCopies(
    rows
      .map((row) => row.storage_pathname)
      .filter((key): key is string => key !== null && !stillStored.has(key)),
  );

  return {
    mediaObjectsDeleted: deleted,
    mediaObjectsFailed: failedPathnames.length,
    mediaRowsDeleted,
    backupObjectsDeleted: backup.deleted,
    backupObjectsFailed: backup.failed,
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
    backupObjectsDeleted: 0,
    backupObjectsFailed: 0,
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
  const mediaGate = await sealAndCheckMediaJobsForErasure(userId, options.scope ?? 'account');
  if (mediaGate.blocked) {
    return {
      userId,
      mediaObjectsDeleted: 0,
      mediaObjectsFailed: 0,
      mediaRowsDeleted: 0,
      backupObjectsDeleted: 0,
      backupObjectsFailed: 0,
      knowledgeObjectsDeleted: 0,
      knowledgeObjectsFailed: 0,
      avatarObjectsDeleted: 0,
      avatarObjectsFailed: 0,
      cacheKeysDeleted: 0,
      cacheKeysFailed: 0,
      tables: {
        [mediaGate.blockedBy ?? VIDEO_JOB_TABLE]: {
          deleted: false,
          retainedForRetry: true,
          ...(mediaGate.error ? { error: mediaGate.error } : {}),
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
    await eraseConnectorResponseCache(db, userId);

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
    if (mediaGate.dataFenceToken) {
      await releaseDataVideoErasureFence(userId, mediaGate.dataFenceToken);
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
