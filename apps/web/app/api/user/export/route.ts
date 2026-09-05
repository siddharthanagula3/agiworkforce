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

    const exportData = await collectUserData({ id: userId, email }, scopedDbFor);

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
 * make it unusable; `storage_url` is the durable location the user can fetch
 * each file from, which is what makes this an access answer rather than a list
 * of things they cannot reach.
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

async function queryExportRows<T>(params: {
  db: DatabaseAdapter;
  sql: string;
  values: unknown[];
  schema: z.ZodType<T>;
  section: string;
  userId: string;
}): Promise<T[]> {
  const { db, sql, values, schema, section, userId } = params;
  try {
    const rows = await db.query<unknown>(sql, values);
    const parsedRows: T[] = [];
    for (const row of rows) {
      const parsed = schema.safeParse(row);
      if (parsed.success) {
        parsedRows.push(parsed.data);
      } else {
        logger.warn({ userId, section }, 'Skipping invalid row in user data export');
      }
    }
    return parsedRows;
  } catch (error) {
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
}): Promise<T[]> {
  const { scopedDbFor, workspaces, ...query } = params;
  const collected: T[] = [];
  for (const organizationId of workspaces) {
    collected.push(...(await queryExportRows({ db: scopedDbFor(organizationId), ...query })));
  }
  return collected;
}

async function collectUserData(
  user: { id: string; email?: string },
  scopedDbFor: (organizationId: string | null) => DatabaseAdapter,
): Promise<Record<string, unknown>> {
  const db = scopedDbFor(null);
  let workspaces: (string | null)[] = [null];
  const exportData: Record<string, unknown> = {
    export_metadata: {
      user_id: user.id,
      export_timestamp: new Date().toISOString(),
      gdpr_article: 'Article 20 - Right to Data Portability',
      format_version: '1.0',
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
  });
  if (emailRows.length > 0) exportData['email_preferences'] = emailRows[0];

  const orgMemberRows = await queryExportRows({
    db,
    sql: `select organization_id, role, provisioning_source, provisioned_at, joined_at
          from organization_members where user_id = $1`,
    values: [user.id],
    schema: organizationMemberExportSchema,
    section: 'organization_memberships',
    userId: user.id,
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
  });
  exportData['conversations'] = conversations;

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
  });
  exportData['messages'] = messages;

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
  });
  exportData['media_assets'] = mediaAssets;

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
  });
  exportData['artifact_versions'] = artifactVersions;

  try {
    exportData['billing_invoices'] = await listUserBillingInvoices(db, user.id);
  } catch (error) {
    logger.warn({ error, userId: user.id }, 'Billing invoices unavailable for user export');
    exportData['billing_invoices'] = [];
  }

  try {
    exportData['managed_usage'] = await getManagedUsageSummary(db, user.id);
  } catch (error) {
    logger.warn({ error, userId: user.id }, 'Managed usage summary unavailable for user export');
  }

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

  if (isDownload) {
    return new NextResponse(jsonData, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="user-data-export-${timestamp}.json"`,
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  }

  return NextResponse.json(
    {
      success: true,
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
