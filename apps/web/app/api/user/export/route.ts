import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  getSecurityHeaders,
  getCorsHeaders,
  handleCorsPreflightRequest,
  withCorsRoute,
} from '@/lib/cors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { listUserBillingInvoices } from '@/lib/services/billing-invoice-service';
import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';
import { recordAuditEvent } from '@/lib/security-audit';
import { authenticatedMediaUrl } from '@/lib/server/media-storage';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';

async function handleExportUserData(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'user-data-export');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { userId, email } = await getClerkAuthUser(request);
    const scopedDbFor = (organizationId: string | null): DatabaseAdapter =>
      createClaimedUserScopedDb(getNeonDb(), { userId, organizationId });

    logger.info(
      {
        userId,
        action: 'gdpr_data_export_requested',
      },
      'User requested GDPR data export',
    );

    const exportData = await collectUserData(
      { id: userId, email },
      scopedDbFor,
      exportOrigin(request),
    );

    await recordAuditEvent({
      userId,
      eventType: 'data_exported',
      request,
      detail: {
        resourceType: 'user_data',
        source: 'gdpr_portability_export',
        count: Object.keys(exportData).length,
      },
    });

    return createExportResponse(request, userId, exportData);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in GET /api/user/export',
    );
    throw error;
  }
}

const timestampSchema = z
  .union([z.string().min(1), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));
const nullableTimestampSchema = timestampSchema.nullable();
// bigint and numeric arrive from Postgres as text; a bare z.number() would
// skip every row that carries one.
const nullableNumericSchema = z.union([z.number(), z.string()]).nullable();

const profileExportSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const subscriptionExportSchema = z.object({
  id: z.string(),
  plan_tier: z.string(),
  status: z.string(),
  current_period_start: nullableTimestampSchema,
  current_period_end: nullableTimestampSchema,
  cancel_at_period_end: z.boolean().nullable(),
  canceled_at: nullableTimestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const topUpPurchaseExportSchema = z.object({
  id: z.string(),
  created_at: timestampSchema,
});

const emailPreferencesExportSchema = z.object({
  email: z.string(),
  marketing_emails: z.boolean(),
  product_updates: z.boolean(),
  security_alerts: z.boolean(),
  weekly_digest: z.boolean(),
  unsubscribed_at: nullableTimestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const organizationMemberExportSchema = z.object({
  organization_id: z.string(),
  role: z.string(),
  provisioning_source: z.string().nullable(),
  provisioned_at: nullableTimestampSchema,
  joined_at: timestampSchema,
});

const organizationExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const betaRedemptionExportSchema = z.object({
  id: z.string(),
  invite_id: z.string(),
  redeemed_at: timestampSchema,
  surface: z.string().nullable(),
  source: z.string().nullable(),
});

const betaInviteExportSchema = z.object({
  id: z.string(),
  plan_tier: z.string().nullable(),
  trial_days: z.number().int().nonnegative().nullable(),
});

const deviceAuthorizationExportSchema = z.object({
  id: z.string(),
  device_id: z.string(),
  device_name: z.string().nullable(),
  device_type: z.string().nullable(),
  status: z.string(),
  expires_at: timestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const desktopDeviceExportSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  platform: z.string().nullable(),
  version: z.string().nullable(),
  last_seen_at: nullableTimestampSchema,
  registered_at: timestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const mobileDeviceExportSchema = z.object({
  id: z.string(),
  platform: z.string().nullable(),
  name: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const syncDataExportSchema = z.object({
  id: z.string(),
  device_id: z.string(),
  sync_type: z.string(),
  data: z.unknown().nullable(),
  created_at: timestampSchema,
});

const conversationExportSchema = z.object({
  id: z.string(),
  title: z.string(),
  model: z.string().nullable(),
  project_id: z.string().nullable(),
  pinned: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: nullableTimestampSchema,
});

const messageExportSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  role: z.string(),
  content: z.string(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  created_at: timestampSchema,
});

const projectExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  color: z.string().nullable(),
  is_archived: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: nullableTimestampSchema,
});

const projectKnowledgeFileExportSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  file_name: z.string(),
  mime_type: z.string().nullable(),
  byte_count: z.number().int().nonnegative(),
  checksum_sha256: z.string().nullable(),
  summary: z.string().nullable(),
  source_surface: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

/**
 * Metadata, not bytes. The export is a JSON download and inlining media would
 * make it unusable. `storage_url` is a private object-storage key that resolves
 * for nobody on its own, so each row is served with a `download_url` on the
 * account's authenticated media route, and `export_metadata.media_downloads`
 * states what that link needs and whether it expires.
 */
const mediaAssetExportSchema = z.object({
  id: z.string(),
  kind: z.string(),
  mime_type: z.string(),
  byte_size: z.number().int().nonnegative().nullable(),
  storage_url: z.string(),
  prompt: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  source_surface: z.string().nullable(),
  created_at: timestampSchema,
  deleted_at: timestampSchema.nullable(),
});

const memoryExportSchema = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string().nullable(),
  source: z.string().nullable(),
  is_deleted: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const artifactExportSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  message_id: z.string().nullable(),
  title: z.string().nullable(),
  artifact_type: z.string(),
  language: z.string().nullable(),
  content: z.string(),
  current_version: z.number().int().positive(),
  pinned: z.boolean(),
  tags: z.array(z.string()),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: nullableTimestampSchema,
});

const artifactVersionExportSchema = z.object({
  artifact_id: z.string(),
  version: z.number().int().positive(),
  content: z.string(),
  change_description: z.string().nullable(),
  content_hash: z.string().nullable(),
  created_at: timestampSchema,
});

const userSettingsExportSchema = z.object({
  settings: z.unknown(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const userConnectorExportSchema = z.object({
  id: z.string(),
  connector_id: z.string(),
  auth_type: z.string(),
  is_active: z.boolean(),
  connected_at: timestampSchema,
  updated_at: timestampSchema,
});

const userCustomConnectorExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  transport: z.string(),
  short_id: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const userSkillExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  body: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const userShortcutExportSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  sort_order: z.number().int(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const scheduledTaskExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  project_id: z.string().nullable(),
  schedule_type: z.string(),
  cron_expression: z.string().nullable(),
  execute_at: nullableTimestampSchema,
  interval_ms: nullableNumericSchema,
  timezone: z.string(),
  is_enabled: z.boolean(),
  expires_at: nullableTimestampSchema,
  max_executions: z.number().int().nullable(),
  execution_count: z.number().int(),
  action_type: z.string(),
  action_config: z.unknown().nullable(),
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  status: z.string(),
  last_executed_at: nullableTimestampSchema,
  next_execution_at: nullableTimestampSchema,
  last_error: z.string().nullable(),
  metadata: z.unknown().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const supportTicketExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  subject: z.string(),
  message: z.string(),
  status: z.string(),
  priority: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  resolved_at: nullableTimestampSchema,
});

const supportTicketReplyExportSchema = z.object({
  id: z.string(),
  ticket_id: z.string(),
  message: z.string(),
  is_staff: z.boolean(),
  created_at: timestampSchema,
});

const feedbackExportSchema = z.object({
  id: z.string(),
  subject: z.string().nullable(),
  message: z.string(),
  metadata: z.unknown().nullable(),
  created_at: timestampSchema,
});

const notificationExportSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  link: z.string().nullable(),
  is_read: z.boolean(),
  created_at: timestampSchema,
});

const messageBookmarkExportSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  note: z.string().nullable(),
  created_at: timestampSchema,
});

const messageReactionExportSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  emoji: z.string(),
  created_at: timestampSchema,
});

const conversationTagExportSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  tag: z.string(),
  confidence: nullableNumericSchema,
  classified_at: timestampSchema,
});

const chatFolderExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  sort_order: z.number().int(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const researchReportExportSchema = z.object({
  id: z.string(),
  request_id: z.string(),
  conversation_id: z.string().nullable(),
  query: z.string(),
  title: z.string(),
  summary: z.string(),
  content: z.string(),
  citations: z.unknown(),
  steps: z.unknown(),
  key_findings: z.unknown(),
  status: z.string(),
  sources_consulted: z.number().int().nonnegative(),
  duration_ms: z.number().int().nullable(),
  error: z.string().nullable(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  settled_cost_microusd: nullableNumericSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  completed_at: nullableTimestampSchema,
});

const publishedArtifactExportSchema = z.object({
  id: z.string(),
  artifact_id: z.string(),
  conversation_id: z.string().nullable(),
  title: z.string(),
  kind: z.string(),
  language: z.string().nullable(),
  content: z.string(),
  visibility: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const consentRecordExportSchema = z.object({
  id: z.string(),
  subject_email_sha256: z.string().nullable(),
  purpose: z.string(),
  granted: z.boolean(),
  notice_version: z.string(),
  surface: z.string(),
  recorded_at: timestampSchema,
});

const dataRightsRequestExportSchema = z.object({
  id: z.string(),
  reference: z.string(),
  contact_email: z.string(),
  request_type: z.string(),
  details: z.string().nullable(),
  status: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  resolved_at: nullableTimestampSchema,
});

const searchHistoryExportSchema = z.object({
  id: z.string(),
  query: z.string(),
  result_count: z.number().int().nullable(),
  created_at: timestampSchema,
});

const apiKeyExportSchema = z.object({
  id: z.string(),
  name: z.string(),
  key_prefix: z.string(),
  scopes: z.array(z.string()),
  last_used_at: nullableTimestampSchema,
  expires_at: nullableTimestampSchema,
  revoked_at: nullableTimestampSchema,
  created_at: timestampSchema,
});

const securityAuditLogExportSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  severity: z.string(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  endpoint: z.string().nullable(),
  created_at: timestampSchema,
});

export type ExportCompletenessStatus = 'complete' | 'partial';

export interface ExportCompleteness {
  status: ExportCompletenessStatus;
  unavailable_sections: string[];
  skipped_rows: Array<{ section: string; count: number }>;
  truncated_sections: Array<{ section: string; limit: number }>;
  retry: string;
}

/**
 * Row cap for the two highest-cardinality sections. An uncapped read of either
 * can make the download itself unusable, so they are capped and the cap is
 * declared in `truncated_sections` rather than left to look like the whole
 * history.
 */
const EXPORT_ROW_LIMIT = 1000;

const EXPORT_RETRY_INSTRUCTION =
  'Request the export again. Sections listed as unavailable were not read, skipped rows were present but could not be exported in this format, and truncated sections hold only their most recent rows.';

class ExportCompletenessLedger {
  private readonly unavailable = new Set<string>();
  private readonly skipped = new Map<string, number>();
  private readonly truncated = new Map<string, number>();

  sectionUnavailable(section: string): void {
    this.unavailable.add(section);
  }

  rowSkipped(section: string): void {
    this.skipped.set(section, (this.skipped.get(section) ?? 0) + 1);
  }

  /**
   * A capped section that came back full.
   *
   * Without this the export reported 'complete' while holding only the most
   * recent rows of the highest-cardinality tables, which on an access request
   * is the one claim that must not be made loosely.
   */
  sectionTruncated(section: string, limit: number): void {
    this.truncated.set(section, limit);
  }

  summary(): ExportCompleteness {
    const unavailableSections = [...this.unavailable].sort();
    const skippedRows = [...this.skipped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([section, count]) => ({ section, count }));
    const truncatedSections = [...this.truncated.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([section, limit]) => ({ section, limit }));
    return {
      status:
        unavailableSections.length === 0 &&
        skippedRows.length === 0 &&
        truncatedSections.length === 0
          ? 'complete'
          : 'partial',
      unavailable_sections: unavailableSections,
      skipped_rows: skippedRows,
      truncated_sections: truncatedSections,
      retry: EXPORT_RETRY_INSTRUCTION,
    };
  }
}

async function queryExportRows<T>(params: {
  db: DatabaseAdapter;
  sql: string;
  values: unknown[];
  schema: z.ZodType<T>;
  section: string;
  userId: string;
  ledger: ExportCompletenessLedger;
  rowLimit?: number;
}): Promise<T[]> {
  const { db, sql, values, schema, section, userId, ledger, rowLimit } = params;
  try {
    const rows = await db.query<unknown>(sql, values);
    if (rowLimit !== undefined && rows.length >= rowLimit) {
      ledger.sectionTruncated(section, rowLimit);
    }
    const parsedRows: T[] = [];
    for (const row of rows) {
      const parsed = schema.safeParse(row);
      if (parsed.success) {
        parsedRows.push(parsed.data);
      } else {
        ledger.rowSkipped(section);
        logger.warn({ userId, section }, 'Skipping invalid row in user data export');
      }
    }
    return parsedRows;
  } catch (error) {
    ledger.sectionUnavailable(section);
    logger.warn({ error, userId, section }, 'User data export section unavailable');
    return [];
  }
}

/**
 * Tenant-scoped tables answer `app_row_is_visible(user_id, organization_id)`,
 * which matches the session's workspace exactly, so one connection bound to the
 * personal scope returns only the rows that carry no organization. A member's
 * workspace conversations, projects, files and memories are the bulk of what
 * Article 20 asks for, so the export reads each of those sections once per
 * workspace the user belongs to and concatenates the results.
 */
async function queryExportRowsAcrossWorkspaces<T>(params: {
  scopedDbFor: (organizationId: string | null) => DatabaseAdapter;
  workspaces: readonly (string | null)[];
  sql: string;
  values: unknown[];
  schema: z.ZodType<T>;
  section: string;
  userId: string;
  ledger: ExportCompletenessLedger;
}): Promise<T[]> {
  const { scopedDbFor, workspaces, ...query } = params;
  const collected: T[] = [];
  for (const organizationId of workspaces) {
    collected.push(...(await queryExportRows({ db: scopedDbFor(organizationId), ...query })));
  }
  return collected;
}

const MEDIA_DOWNLOAD_FIELD = 'download_url';

const MEDIA_DOWNLOADS_DOCUMENTATION = {
  url_field: MEDIA_DOWNLOAD_FIELD,
  authorization:
    'Open the link while signed in as this account. Media that belongs to a workspace also needs membership of that workspace.',
  expires_at: null,
  expiry:
    'These links do not expire. Each request is authorised on its own, so the export stays usable and stays private if the file is copied.',
  storage_url:
    'A private object-storage key kept for reference. It is not a download link and resolves for nobody on its own.',
} as const;

function exportOrigin(request: NextRequest): string {
  const configured = (process.env['NEXT_PUBLIC_APP_URL'] ?? '').trim().replace(/\/$/, '');
  return configured || request.nextUrl.origin;
}

async function collectUserData(
  user: { id: string; email?: string },
  scopedDbFor: (organizationId: string | null) => DatabaseAdapter,
  origin: string,
): Promise<Record<string, unknown>> {
  const db = scopedDbFor(null);
  const ledger = new ExportCompletenessLedger();
  let workspaces: (string | null)[] = [null];
  const exportData: Record<string, unknown> = {
    export_metadata: {
      user_id: user.id,
      export_timestamp: new Date().toISOString(),
      gdpr_article: 'Article 20 - Right to Data Portability',
      format_version: '1.0',
      media_downloads: MEDIA_DOWNLOADS_DOCUMENTATION,
    },
    account: {
      id: user.id,
      email: user.email,
    },
  };

  const profileRows = await queryExportRows({
    db,
    sql: `select id, email, display_name, avatar_url, created_at, updated_at
          from profiles where id = $1 limit 1`,
    values: [user.id],
    schema: profileExportSchema,
    section: 'profile',
    userId: user.id,
    ledger,
  });
  if (profileRows.length > 0) exportData['profile'] = profileRows[0];

  const subscriptionRows = await queryExportRows({
    db,
    sql: `select id, plan_tier, status, current_period_start, current_period_end,
                 cancel_at_period_end, canceled_at, created_at, updated_at
          from subscriptions where user_id = $1 limit 1`,
    values: [user.id],
    schema: subscriptionExportSchema,
    section: 'subscription',
    userId: user.id,
    ledger,
  });
  if (subscriptionRows.length > 0) exportData['subscription'] = subscriptionRows[0];

  const topUpPurchases = await queryExportRows({
    db,
    sql: `select id, created_at
          from credit_transactions
          where user_id = $1 and transaction_type = 'purchase'
          order by created_at desc
          limit 1000`,
    values: [user.id],
    schema: topUpPurchaseExportSchema,
    section: 'top_up_purchases',
    userId: user.id,
    ledger,
    rowLimit: EXPORT_ROW_LIMIT,
  });
  if (topUpPurchases.length > 0) {
    exportData['top_up_purchases'] = topUpPurchases.map((purchase) => ({
      id: purchase.id,
      purchased_at: purchase.created_at,
    }));
  }

  const emailRows = await queryExportRows({
    db,
    sql: `select email, marketing_emails, product_updates, security_alerts,
                 weekly_digest, unsubscribed_at, created_at, updated_at
          from email_preferences where user_id = $1 limit 1`,
    values: [user.id],
    schema: emailPreferencesExportSchema,
    section: 'email_preferences',
    userId: user.id,
    ledger,
  });
  if (emailRows.length > 0) exportData['email_preferences'] = emailRows[0];

  const userSettingsRows = await queryExportRows({
    db,
    sql: `select settings, created_at, updated_at
          from user_settings where user_id = $1 limit 1`,
    values: [user.id],
    schema: userSettingsExportSchema,
    section: 'user_settings',
    userId: user.id,
    ledger,
  });
  if (userSettingsRows.length > 0) exportData['user_settings'] = userSettingsRows[0];

  const orgMemberRows = await queryExportRows({
    db,
    sql: `select organization_id, role, provisioning_source, provisioned_at, joined_at
          from organization_members where user_id = $1`,
    values: [user.id],
    schema: organizationMemberExportSchema,
    section: 'organization_memberships',
    userId: user.id,
    ledger,
  });
  if (orgMemberRows.length > 0) {
    const orgIds = orgMemberRows
      .map((row) => row.organization_id)
      .filter((id): id is string => typeof id === 'string');
    workspaces = [null, ...orgIds];
    let orgsById: Record<string, z.infer<typeof organizationExportSchema>> = {};
    if (orgIds.length > 0) {
      const orgRows = await queryExportRows({
        db,
        sql: `select id, name, slug, created_at, updated_at
              from organizations where id = any($1::uuid[])`,
        values: [orgIds],
        schema: organizationExportSchema,
        section: 'organizations',
        userId: user.id,
        ledger,
      });
      orgsById = Object.fromEntries(orgRows.map((organization) => [organization.id, organization]));
    }
    exportData['organization_memberships'] = orgMemberRows.map((membership) => ({
      ...membership,
      organization: orgsById[membership.organization_id] ?? null,
    }));
  }

  const betaRows = await queryExportRows({
    db,
    sql: `select id, invite_id, redeemed_at, surface, source
          from beta_redemptions where user_id = $1`,
    values: [user.id],
    schema: betaRedemptionExportSchema,
    section: 'beta_redemptions',
    userId: user.id,
    ledger,
  });
  if (betaRows.length > 0) {
    const inviteIds = betaRows
      .map((row) => row.invite_id)
      .filter((id): id is string => typeof id === 'string');
    let invitesById: Record<string, z.infer<typeof betaInviteExportSchema>> = {};
    if (inviteIds.length > 0) {
      const inviteRows = await queryExportRows({
        db,
        sql: `select id, plan_tier, trial_days
              from beta_invites where id = any($1::uuid[])`,
        values: [inviteIds],
        schema: betaInviteExportSchema,
        section: 'beta_invites',
        userId: user.id,
        ledger,
      });
      invitesById = Object.fromEntries(inviteRows.map((invite) => [invite.id, invite]));
    }
    exportData['beta_redemptions'] = betaRows.map((redemption) => ({
      ...redemption,
      beta_invite: invitesById[redemption.invite_id] ?? null,
    }));
  }

  const deviceAuthRows = await queryExportRows({
    db,
    sql: `select id, device_id, device_name, device_type, status, expires_at,
                 created_at, updated_at
          from device_authorization_codes
          where user_id = $1
          order by created_at desc`,
    values: [user.id],
    schema: deviceAuthorizationExportSchema,
    section: 'device_authorizations',
    userId: user.id,
    ledger,
  });
  if (deviceAuthRows.length > 0) exportData['device_authorizations'] = deviceAuthRows;

  const desktopRows = await queryExportRows({
    db,
    sql: `select id, name, platform, version, last_seen_at, registered_at, created_at, updated_at
          from desktop_devices where user_id = $1`,
    values: [user.id],
    schema: desktopDeviceExportSchema,
    section: 'desktop_devices',
    userId: user.id,
    ledger,
  });
  if (desktopRows.length > 0) exportData['desktop_devices'] = desktopRows;

  const mobileRows = await queryExportRows({
    db,
    sql: `select id, platform, name, created_at, updated_at
          from mobile_devices where user_id = $1`,
    values: [user.id],
    schema: mobileDeviceExportSchema,
    section: 'mobile_devices',
    userId: user.id,
    ledger,
  });
  if (mobileRows.length > 0) exportData['mobile_devices'] = mobileRows;

  const syncRows = await queryExportRows({
    db,
    sql: `select id, device_id, sync_type, data, created_at
          from sync_data where user_id = $1`,
    values: [user.id],
    schema: syncDataExportSchema,
    section: 'sync_data',
    userId: user.id,
    ledger,
  });
  if (syncRows.length > 0) exportData['sync_data'] = syncRows;

  const conversations = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select id, title, model, project_id, pinned, created_at, updated_at, deleted_at
          from web_conversations
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: conversationExportSchema,
    section: 'conversations',
    userId: user.id,
    ledger,
  });
  exportData['conversations'] = conversations;

  exportData['chat_folders'] = await queryExportRows({
    db,
    sql: `select id, name, color, sort_order, created_at, updated_at
          from chat_folders
          where user_id = $1
          order by sort_order asc, created_at asc`,
    values: [user.id],
    schema: chatFolderExportSchema,
    section: 'chat_folders',
    userId: user.id,
    ledger,
  });

  exportData['conversation_tags'] = await queryExportRows({
    db,
    sql: `select id, conversation_id, tag, confidence, classified_at
          from conversation_tags
          where user_id = $1
          order by classified_at asc`,
    values: [user.id],
    schema: conversationTagExportSchema,
    section: 'conversation_tags',
    userId: user.id,
    ledger,
  });

  const messages = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select m.id, m.conversation_id, m.role, m.content, m.model, m.provider, m.created_at
          from web_messages m
          inner join web_conversations c on c.id = m.conversation_id
          where c.user_id = $1
          order by m.created_at asc`,
    values: [user.id],
    schema: messageExportSchema,
    section: 'messages',
    userId: user.id,
    ledger,
  });
  exportData['messages'] = messages;

  exportData['message_bookmarks'] = await queryExportRows({
    db,
    sql: `select id, message_id, note, created_at
          from message_bookmarks
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: messageBookmarkExportSchema,
    section: 'message_bookmarks',
    userId: user.id,
    ledger,
  });

  exportData['message_reactions'] = await queryExportRows({
    db,
    sql: `select id, message_id, emoji, created_at
          from message_reactions
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: messageReactionExportSchema,
    section: 'message_reactions',
    userId: user.id,
    ledger,
  });

  const projects = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select id, name, description, instructions, color, is_archived,
                 created_at, updated_at, deleted_at
          from user_projects
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: projectExportSchema,
    section: 'projects',
    userId: user.id,
    ledger,
  });
  exportData['projects'] = projects;

  const projectKnowledgeFiles = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select f.id, f.project_id, f.file_name, f.mime_type, f.byte_count,
                 f.checksum_sha256, f.summary, f.source_surface, f.created_at, f.updated_at
          from project_knowledge_files f
          inner join user_projects p on p.id = f.project_id
          where p.user_id = $1
          order by f.created_at asc`,
    values: [user.id],
    schema: projectKnowledgeFileExportSchema,
    section: 'project_knowledge_files',
    userId: user.id,
    ledger,
  });
  exportData['project_knowledge_files'] = projectKnowledgeFiles;

  // Files the user uploaded and media generated for them. Absent from this
  // export until 2026-08-21, while account erasure has always deleted them.
  // so the product could destroy this category of personal data on request but
  // could not show it, which is half of a data-subject access right.
  const mediaAssets = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select id, kind, mime_type, byte_size, storage_url, prompt, provider, model,
                 width, height, source_surface, created_at, deleted_at
          from public.media_assets
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: mediaAssetExportSchema,
    section: 'media_assets',
    userId: user.id,
    ledger,
  });
  exportData['media_assets'] = mediaAssets.map((asset) => ({
    ...asset,
    [MEDIA_DOWNLOAD_FIELD]: `${origin}${authenticatedMediaUrl(asset.id)}`,
  }));

  const memories = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select id, content, category, source, is_deleted, created_at, updated_at
          from user_memories
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: memoryExportSchema,
    section: 'memories',
    userId: user.id,
    ledger,
  });
  exportData['memories'] = memories;

  const artifacts = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select id, conversation_id, message_id, title, artifact_type, language, content,
                 current_version, pinned, tags, created_at, updated_at, deleted_at
          from web_artifacts
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: artifactExportSchema,
    section: 'artifacts',
    userId: user.id,
    ledger,
  });
  exportData['artifacts'] = artifacts;

  const artifactVersions = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select v.artifact_id, v.version, v.content, v.change_description,
                 v.content_hash, v.created_at
          from web_artifact_versions v
          inner join web_artifacts a on a.id = v.artifact_id
          where a.user_id = $1
          order by v.artifact_id asc, v.version asc`,
    values: [user.id],
    schema: artifactVersionExportSchema,
    section: 'artifact_versions',
    userId: user.id,
    ledger,
  });
  exportData['artifact_versions'] = artifactVersions;

  // `token` is withheld: it is the unguessable capability in the publish URL,
  // so anyone holding it can read the page. The artifact itself is exported.
  exportData['published_artifacts'] = await queryExportRows({
    db,
    sql: `select id, artifact_id, conversation_id, title, kind, language, content,
                 visibility, created_at, updated_at
          from published_artifacts
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: publishedArtifactExportSchema,
    section: 'published_artifacts',
    userId: user.id,
    ledger,
  });

  exportData['research_reports'] = await queryExportRows({
    db,
    sql: `select id, request_id, conversation_id, query, title, summary, content,
                 citations, steps, key_findings, status, sources_consulted, duration_ms,
                 error, model, provider, settled_cost_microusd,
                 created_at, updated_at, completed_at
          from research_reports
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: researchReportExportSchema,
    section: 'research_reports',
    userId: user.id,
    ledger,
  });

  exportData['user_skills'] = await queryExportRows({
    db,
    sql: `select id, name, description, body, created_at, updated_at
          from user_skills
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: userSkillExportSchema,
    section: 'user_skills',
    userId: user.id,
    ledger,
  });

  exportData['user_shortcuts'] = await queryExportRows({
    db,
    sql: `select id, title, content, sort_order, created_at, updated_at
          from user_shortcuts
          where user_id = $1
          order by sort_order asc, created_at asc`,
    values: [user.id],
    schema: userShortcutExportSchema,
    section: 'user_shortcuts',
    userId: user.id,
    ledger,
  });

  exportData['user_connectors'] = await queryExportRows({
    db,
    sql: `select id, connector_id, auth_type, is_active, connected_at, updated_at
          from user_connectors
          where user_id = $1
          order by connected_at asc`,
    values: [user.id],
    schema: userConnectorExportSchema,
    section: 'user_connectors',
    userId: user.id,
    ledger,
  });

  // `auth_header_enc` is withheld: it is the encrypted bearer credential the
  // connector authenticates with, not something the account needs back.
  exportData['user_custom_connectors'] = await queryExportRows({
    db,
    sql: `select id, name, url, transport, short_id, created_at, updated_at
          from user_custom_connectors
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: userCustomConnectorExportSchema,
    section: 'user_custom_connectors',
    userId: user.id,
    ledger,
  });

  exportData['scheduled_tasks'] = await queryExportRows({
    db,
    sql: `select id, name, description, project_id, schedule_type, cron_expression,
                 execute_at, interval_ms, timezone, is_enabled, expires_at,
                 max_executions, execution_count, action_type, action_config, prompt,
                 model, status, last_executed_at, next_execution_at, last_error,
                 metadata, created_at, updated_at
          from scheduled_tasks
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: scheduledTaskExportSchema,
    section: 'scheduled_tasks',
    userId: user.id,
    ledger,
  });

  exportData['search_history'] = await queryExportRowsAcrossWorkspaces({
    scopedDbFor,
    workspaces,
    sql: `select id, query, result_count, created_at
          from search_history
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: searchHistoryExportSchema,
    section: 'search_history',
    userId: user.id,
    ledger,
  });

  exportData['notifications'] = await queryExportRows({
    db,
    sql: `select id, title, message, type, link, is_read, created_at
          from notifications
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: notificationExportSchema,
    section: 'notifications',
    userId: user.id,
    ledger,
  });

  exportData['support_tickets'] = await queryExportRows({
    db,
    sql: `select id, name, email, subject, message, status, priority,
                 created_at, updated_at, resolved_at
          from support_tickets
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: supportTicketExportSchema,
    section: 'support_tickets',
    userId: user.id,
    ledger,
  });

  // The whole thread on the account's own tickets, staff answers included. The
  // replying staff member's user id is not the requester's personal data.
  exportData['support_ticket_replies'] = await queryExportRows({
    db,
    sql: `select r.id, r.ticket_id, r.message, r.is_staff, r.created_at
          from support_ticket_replies r
          inner join support_tickets t on t.id = r.ticket_id
          where t.user_id = $1
          order by r.created_at asc`,
    values: [user.id],
    schema: supportTicketReplyExportSchema,
    section: 'support_ticket_replies',
    userId: user.id,
    ledger,
  });

  exportData['feedback'] = await queryExportRows({
    db,
    sql: `select id, subject, message, metadata, created_at
          from feedback
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: feedbackExportSchema,
    section: 'feedback',
    userId: user.id,
    ledger,
  });

  exportData['consent_records'] = await queryExportRows({
    db,
    sql: `select id, subject_email_sha256, purpose, granted, notice_version,
                 surface, recorded_at
          from consent_records
          where user_id = $1
          order by recorded_at asc`,
    values: [user.id],
    schema: consentRecordExportSchema,
    section: 'consent_records',
    userId: user.id,
    ledger,
  });

  // `resolution_note` is withheld: 0114 defines it as an internal working note
  // that is never shown to the requester without review.
  exportData['data_rights_requests'] = await queryExportRows({
    db,
    sql: `select id, reference, contact_email, request_type, details, status,
                 created_at, updated_at, resolved_at
          from data_rights_requests
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: dataRightsRequestExportSchema,
    section: 'data_rights_requests',
    userId: user.id,
    ledger,
  });

  // `key_hash` is withheld: it is the verifier for a live credential, and the
  // key itself was only ever shown once, at creation.
  exportData['api_keys'] = await queryExportRows({
    db,
    sql: `select id, name, key_prefix, scopes, last_used_at, expires_at,
                 revoked_at, created_at
          from api_keys
          where user_id = $1
          order by created_at asc`,
    values: [user.id],
    schema: apiKeyExportSchema,
    section: 'api_keys',
    userId: user.id,
    ledger,
  });

  // `details` is withheld: it is a free-form bag written from ~96 call sites,
  // and an admin action logs the acted-on account in it (admin/security
  // route.ts), so it would put another user's identifier in this download.
  exportData['security_audit_logs'] = await queryExportRows({
    db,
    sql: `select id, event_type, severity, ip_address, user_agent, endpoint, created_at
          from security_audit_logs
          where user_id = $1
          order by created_at desc
          limit 1000`,
    values: [user.id],
    schema: securityAuditLogExportSchema,
    section: 'security_audit_logs',
    userId: user.id,
    ledger,
    rowLimit: EXPORT_ROW_LIMIT,
  });

  try {
    exportData['billing_invoices'] = await listUserBillingInvoices(db, user.id);
  } catch (error) {
    ledger.sectionUnavailable('billing_invoices');
    logger.warn({ error, userId: user.id }, 'Billing invoices unavailable for user export');
    exportData['billing_invoices'] = [];
  }

  try {
    exportData['managed_usage'] = await getManagedUsageSummary(db, user.id);
  } catch (error) {
    ledger.sectionUnavailable('managed_usage');
    logger.warn({ error, userId: user.id }, 'Managed usage summary unavailable for user export');
  }

  const completeness = ledger.summary();
  (exportData['export_metadata'] as Record<string, unknown>)['completeness'] = completeness;

  logger.info(
    { userId: user.id, dataSections: Object.keys(exportData).length },
    'User data export completed from reviewed export DTOs',
  );

  return exportData;
}

function createExportResponse(request: NextRequest, userId: string, data: unknown): NextResponse {
  const acceptHeader = request.headers.get('accept') || '';
  const isDownload =
    acceptHeader.includes('application/octet-stream') ||
    request.nextUrl.searchParams.get('download') === 'true';

  const jsonData = JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString().split('T')[0];
  const completeness = (data as { export_metadata?: { completeness?: ExportCompleteness } })
    .export_metadata?.completeness;
  const status: ExportCompletenessStatus = completeness?.status ?? 'partial';

  if (isDownload) {
    return new NextResponse(jsonData, {
      headers: {
        'Content-Type': 'application/json',
        'X-Export-Status': status,
        'Content-Disposition': `attachment; filename="user-data-export-${timestamp}.json"`,
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  }

  return NextResponse.json(
    {
      success: status === 'complete',
      status,
      export_timestamp: new Date().toISOString(),
      user_id: userId,
      data,
    },
    {
      headers: {
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleExportUserData));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    })
  );
}
