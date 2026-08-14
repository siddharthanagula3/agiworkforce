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
 * The three constants below partition EVERY table in `apps/web/db/neon/*.sql`
 * that carries a user-scoping column. `account-erasure.test.ts` derives that
 * set from the migrations and fails when a table is missing from all three, so
 * a new user-scoped table cannot be added without a deliberate decision about
 * what erasure does with it. Before that guard existed this list was
 * hand-written and had silently fallen 26 tables behind the schema — every
 * legacy conversation, cloud run, terminal entry, OAuth grant, usage event and
 * refresh token survived an erasure that reported `complete: true`.
 */

/**
 * User-scoped tables deleted outright, in FK-safe order: a row must be gone
 * before anything it is referenced by without `on delete cascade`.
 *
 * A table that does not exist on a given deployment is reported as skipped
 * rather than failing the erasure.
 */
export const USER_SCOPED_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  // Chat + generated content
  { table: 'web_conversations', column: 'user_id' },
  { table: 'web_artifacts', column: 'user_id' },
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
  // Cloud execution
  { table: 'cloud_agent_runs', column: 'user_id' },
  { table: 'cloud_code_sessions', column: 'user_id' },
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
  { table: 'connector_oauth_grants', column: 'user_id' },
  { table: 'connector_oauth_authorizations', column: 'user_id' },
  { table: 'messaging_connections', column: 'user_id' },
  { table: 'github_installations', column: 'user_id' },
  { table: 'plugin_installations', column: 'user_id' },
  // Executions before their tools: a run of a GLOBAL tool has no parent to
  // cascade from, so it would otherwise outlive the account that made it.
  { table: 'agent_tool_executions', column: 'user_id' },
  { table: 'agent_tools', column: 'user_id' },
  { table: 'agent_approval_requests', column: 'user_id' },
  // Account surface
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
  // Replies before tickets: a reply this user left on someone else's ticket
  // does not cascade from a ticket we delete.
  { table: 'support_ticket_replies', column: 'user_id' },
  { table: 'support_tickets', column: 'user_id' },
  { table: 'support_action_proposals', column: 'user_id' },
  // Handoff messages cascade from the session.
  { table: 'support_handoff_sessions', column: 'owner_user_id' },
  { table: 'email_preferences', column: 'user_id' },
  { table: 'waitlist', column: 'user_id' },
  { table: 'cloud_managed_waitlist', column: 'user_id' },
  // DPDP (0113/0114). Both are deleted rather than retained as evidence, and
  // that is a deliberate call worth the two lines it takes to explain.
  //
  // The argument for keeping them: a consent ledger is the proof that
  // processing was lawful, and a rights-request row is the proof that a request
  // was answered. The argument that wins: once the account and its content are
  // gone there is no processing left to justify, and both rows still name the
  // person — the consent row by user id, the request row by a plaintext reply
  // address. Retaining personal data to prove we were allowed to hold personal
  // data we no longer hold is the wrong trade.
  //
  // What this does NOT reach, stated so nobody assumes otherwise: rows with a
  // NULL user_id. Consent given against an email address at the public waitlist
  // and requests filed by someone with no account are keyed by hash or by
  // address, and no job ages them out. See DPDP_PROGRESS.md.
  { table: 'consent_records', column: 'user_id' },
  { table: 'data_rights_requests', column: 'user_id' },
  { table: 'beta_redemptions', column: 'user_id' },
  { table: 'feature_flags', column: 'user_id' },
  // Usage + billing
  { table: 'usage_events', column: 'user_id' },
  // Native-store records are bound to this AGI account. Apple and Google own
  // their payment records; our account token and receipt-processing ledger are
  // user-scoped product data and follow the account-erasure policy.
  { table: 'mobile_iap_transactions', column: 'user_id' },
  { table: 'mobile_iap_accounts', column: 'user_id' },
  // Terminal video jobs before their RESTRICTed managed-usage parent. Active
  // jobs block the entire erasure before bytes/rows are touched (see below).
  { table: 'video_generation_jobs', column: 'user_id' },
  { table: 'managed_usage_requests', column: 'user_id' },
  { table: 'credit_transactions', column: 'user_id' },
  { table: 'token_credits', column: 'user_id' },
  { table: 'subscriptions', column: 'user_id' },
  { table: 'organization_members', column: 'user_id' },
  // Parent row last, and only once everything above succeeded — see
  // eraseUserAccountData.
  { table: 'profiles', column: 'id' },
];

/** The parent row whose deletion doubles as the erasure's retry pointer. */
const PROFILE_TABLE = 'profiles';

/**
 * Rows we must keep but that name the erased user. The column is set to NULL,
 * which every one of them allows; deleting the row would destroy a record that
 * belongs to an organization or to another user.
 */
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
];

/**
 * User-scoped tables this module deliberately does NOT delete, each with the
 * reason. Anything not covered here and not deleted above is a gap, and the
 * schema-derived test says so.
 */
export const UNDELETED_USER_TABLES: Readonly<Record<string, string>> = {
  media_assets: 'Erased by eraseUserMedia(): bytes first, then rows.',
  // Cascade children of a row we delete. Listing them as deletes would be a
  // second source of truth for the same FK.
  cloud_agent_events: 'Cascades from cloud_agent_runs.',
  cloud_agent_approval_checkpoints: 'Cascades from cloud_agent_runs.',
  cloud_agent_execution_operations: 'Cascades from cloud_agent_runs.',
  cloud_code_terminal_entries: 'Cascades from cloud_code_sessions.',
  cloud_code_agent_turns: 'Cascades from cloud_code_sessions.',
  managed_usage_request_extensions: 'Cascades from managed_usage_requests.',
  free_daily_usage_reservations: 'Cascades from profiles.',
  website_auto_economy_trial_usage: 'Cascades from profiles.',
  organization_project_access:
    'Cascades from organization_members. Grants this user issued to other members keep granted_by_user_id, which is not nullable.',
  // Retained on purpose.
  // The two audit trails are declared append-only integrity controls
  // (0043, 0087). Erasure does not write to them from here even though this
  // adapter connects as the owner: purging an audit trail is the job of the
  // SECURITY DEFINER path built for it (delete_user_data()). GAP, recorded
  // rather than papered over: `security_audit_logs.user_id` and
  // `enterprise_audit_events.actor_user_id` survive this erasure.
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
  /** R2 objects successfully removed. */
  mediaObjectsDeleted: number;
  /** R2 objects that could not be removed; their rows are retained for retry. */
  mediaObjectsFailed: number;
  /** `media_assets` rows removed. */
  mediaRowsDeleted: number;
  /** Project-knowledge objects removed / left behind in the bucket. */
  knowledgeObjectsDeleted: number;
  knowledgeObjectsFailed: number;
  /** Avatar objects removed / left behind in the (world-readable) bucket. */
  avatarObjectsDeleted: number;
  avatarObjectsFailed: number;
  /**
   * Per-table outcome. `skipped` means the table does not exist here;
   * `retainedForRetry` means the row was deliberately kept so a later run can
   * resume — only ever `profiles`.
   */
  tables: Record<
    string,
    { deleted: boolean; skipped?: boolean; retainedForRetry?: boolean; error?: string }
  >;
  /** Per-table outcome of the NULL-out pass over ANONYMIZED_USER_COLUMNS. */
  anonymized: Record<string, { updated: boolean; skipped?: boolean; error?: string }>;
  /** True when every table AND every stored object was disposed of. */
  complete: boolean;
  /** True when the `profiles` row is still present (retry pointer or caller opt-in). */
  profileRetained: boolean;
}

export interface EraseUserAccountOptions {
  /**
   * Keep the `profiles` row after a successful erasure. The purge cron uses
   * this so the row — the only thing that puts the account back in the queue —
   * outlives the identity-provider delete that follows.
   */
  retainProfile?: boolean;
  /** `data` preserves the auth/profile account and never schedules account purge. */
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
    // This update takes the same profile-row lock that durable job creation
    // holds with FOR UPDATE, then leaves a committed deletion fence. A job
    // that won first commits before this returns and is observed below; every
    // later creation sees the flags and is rejected in its transaction.
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

/** Delete stored bytes by object key, reporting rather than throwing. */
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
    // The bytes exist but this deployment cannot reach them. Reporting them as
    // failed keeps the rows that point at them; claiming success would strand
    // stored objects with nothing left to find them by.
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

/**
 * Delete the BYTES of the user's project-knowledge files.
 *
 * The rows themselves cascade from `user_projects`, so this must run before
 * that delete: `storage_uri` is the only pointer to the object. Current writes
 * use the private bucket; the storage adapter also removes a possible legacy
 * public twin during rollout.
 */
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

/**
 * Delete the user's avatar object. `profiles.avatar_url` also holds
 * identity-provider URLs we do not own; only keys inside our own public bucket
 * resolve, and the rest are nothing of ours to erase.
 */
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

/**
 * Erase every user-scoped record we own for `userId`, including the stored
 * bytes. Per-table failures are recorded rather than thrown so one missing
 * table cannot leave the rest of the account behind; the caller inspects
 * `complete` to decide whether to report success.
 *
 * The `profiles` row is deleted LAST and ONLY when everything else succeeded.
 * It is the erasure's retry pointer — `deletion_scheduled_for` lives on it and
 * is what puts the account back in the purge queue — so removing it after a
 * partial failure would strand the surviving rows with no owner and nothing
 * left to retry from.
 */
export async function eraseUserAccountData(
  userId: string,
  options: EraseUserAccountOptions = {},
): Promise<AccountErasureReport> {
  const db = getNeonDb();
  const videoGate = await sealAndCheckVideoJobsForErasure(userId, options.scope ?? 'account');
  if (videoGate.blocked) {
    // Provider identity, reconciliation ownership, and its billing reservation
    // must stay together until the bounded Workflow reaches a terminal state.
    // Deleting any media/object first would make the later retry incomplete.
    return {
      userId,
      mediaObjectsDeleted: 0,
      mediaObjectsFailed: 0,
      mediaRowsDeleted: 0,
      knowledgeObjectsDeleted: 0,
      knowledgeObjectsFailed: 0,
      avatarObjectsDeleted: 0,
      avatarObjectsFailed: 0,
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
    const tables: AccountErasureReport['tables'] = {};
    const anonymized: AccountErasureReport['anonymized'] = {};

    for (const { table, column } of ANONYMIZED_USER_COLUMNS) {
      try {
        // Identifiers come from the hardcoded ANONYMIZED_USER_COLUMNS constant
        // above; the only user-controlled value is bound as $1.
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
      // A knowledge object we could not delete keeps its row: `storage_uri` is
      // the only pointer to it, and the rows cascade from user_projects.
      if (table === 'user_projects' && knowledge.failed > 0) {
        tables[table] = { deleted: false, retainedForRetry: true };
        continue;
      }
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

    const dataDisposed =
      media.mediaObjectsFailed === 0 &&
      knowledge.failed === 0 &&
      avatar.failed === 0 &&
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

/**
 * Delete the `profiles` row — the last thing that ties the account to us, and
 * the retry pointer for the purge queue. Callers that pass `retainProfile`
 * invoke this only once the identity-provider account is gone too.
 */
export async function eraseProfileRow(userId: string): Promise<void> {
  const db = getNeonDb();
  await db.execute(`delete from public.${PROFILE_TABLE} where id = $1`, [userId]);
}

/**
 * The suppression list (0103_erasure_tombstones.sql). It is the only record of
 * an erasure obligation that outlives the `profiles` row, and therefore the
 * only thing that can put a subject back in the queue after a restore.
 */
const TOMBSTONE_TABLE = 'erasure_tombstones';

/**
 * Outcome of a suppression-list write. `skipped` means this deployment has no
 * `erasure_tombstones` table yet — a deployment state, not a failed obligation.
 */
export interface ErasureTombstoneResult {
  recorded: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Record — or re-record — that `userId` must stay erased.
 *
 * Written BEFORE the erasure, because the erasure destroys the `profiles` row
 * that queues the account: a tombstone written afterwards would be missing for
 * exactly the runs that died in between, which is the case it exists for.
 * Re-running it advances `last_swept_at`, the cron's cursor over the list.
 */
export async function openErasureTombstone(userId: string): Promise<ErasureTombstoneResult> {
  const db = getNeonDb();
  try {
    // The identifier comes from the module constant above; the only
    // user-controlled value is bound as $1.
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

/**
 * Mark the tombstone as settled once an erasure reported every table and every
 * stored object gone. An open tombstone keeps the subject in the sweep queue
 * unconditionally, so a run that died halfway is retried rather than forgotten.
 */
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
