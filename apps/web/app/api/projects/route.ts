/**
 * Projects API
 *
 * GET /api/projects - List all projects for the authenticated user
 * POST /api/projects - Create a new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { mapProjectRow } from '@/lib/projects';
import { parseProjectRequest } from '@/lib/project-request-validation';
import { getNeonDb } from '@/lib/server/neon-db';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  getProjectLimit,
  getProjectLimitErrorMessage,
  isUserResourceLimitError,
} from '@/lib/services/free-plan-entitlements';
import { ManagedCloudProjectCreateRequestSchema } from '@agiworkforce/cloud-contracts';
import { SYNCED_APP_SURFACES } from '@agiworkforce/types';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  ProjectConversationMembershipError,
  replaceProjectConversationMembership,
} from '@/lib/services/project-membership-service';
import { resolveSharedProjectScope } from '@/lib/services/org-sharing-service';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

const PG_UNDEFINED_COLUMN = '42703';

async function handleGetProjects(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100));
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);

  // Projects the caller's ORGANIZATION shares with them (migration 0086).
  //
  // TENANCY. This route runs on the privileged `getNeonDb()` connection, which
  // has BYPASSRLS, so the id set below IS the tenant boundary — not merely a
  // filter. It is resolved entirely server-side from `organization_members`
  // plus `organization_shared_projects`, honouring an explicit per-member
  // `access = 'none'` denial. Nothing on the wire influences it, and
  // `__tests__/route.org-shared.test.ts` fails if the scope is dropped or the
  // predicate stops binding it. (The similarly named
  // `settings/organization/shared/__tests__/route.cross-org-isolation.test.ts`
  // fences the share-management routes, not this read.)
  //
  // Shared projects are ADDITIVE to the caller's own. Conversations stay
  // personal: `conversation_count` still binds `c.user_id = $1`, so a member
  // opening a shared project sees their own threads in it and nobody else's.
  const sharedScope = await resolveSharedProjectScope(db, userId);
  const sharedProjectIds =
    sharedScope?.organizationId === organizationId ? sharedScope.projectIds : [];

  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      // Hide soft-deleted projects (deleted_at tombstones from cross-device sync, 0041).
      `select p.*,
              (p.user_id <> $1) as is_org_shared,
              (select count(*)::int
                 from web_conversations c
                where c.project_id = p.id::text
                  and c.user_id = $1
                  and c.organization_id is not distinct from $5::uuid
                  and c.deleted_at is null) as conversation_count
        from user_projects p
       where p.deleted_at is null
          and p.organization_id is not distinct from $5::uuid
          and (p.user_id = $1 or p.id = any($4::uuid[]))
       order by p.updated_at desc
       limit $2 offset $3`,
      [userId, limit, offset, sharedProjectIds, organizationId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch projects');
    throw createError.internal('Failed to fetch projects');
  }

  return NextResponse.json({
    projects: data.map((p) => mapProjectRow(p)),
  });
}

async function handleCreateProject(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);

  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const body = parseProjectRequest(ManagedCloudProjectCreateRequestSchema, rawBody);
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = subscription?.plan_tier;
  const projectLimit = getProjectLimit(planTier);
  if (projectLimit === 0) {
    throw createError.validation(getProjectLimitErrorMessage(planTier));
  }

  // Build columns/values for the insert, optionally including round-10 fields
  const baseColumns = [
    'user_id',
    'organization_id',
    'name',
    'description',
    'instructions',
    'color',
  ];
  const baseValues: unknown[] = [
    userId,
    organizationId,
    body.name.trim(),
    body.description?.trim() ?? '',
    body.instructions?.trim() ?? '',
    body.color?.trim() || '#3b82f6',
  ];

  // Round-10 fields · only included when present in the request body
  const round10Columns: string[] = [];
  const round10Values: unknown[] = [];
  if (body.iconEmoji !== undefined) {
    round10Columns.push('icon_emoji');
    round10Values.push(body.iconEmoji);
  }
  if (body.accentColor !== undefined) {
    round10Columns.push('accent_color');
    round10Values.push(body.accentColor);
  }
  if (body.defaultPrivacyMode !== undefined) {
    round10Columns.push('default_privacy_mode');
    round10Values.push(body.defaultPrivacyMode);
  }
  if (body.defaultProviderMode !== undefined) {
    round10Columns.push('default_provider_mode');
    round10Values.push(body.defaultProviderMode);
  }
  if (body.allowedSurfaces !== undefined) {
    round10Columns.push('allowed_surfaces');
    round10Values.push(
      body.allowedSurfaces.length > 0 ? body.allowedSurfaces : [...SYNCED_APP_SURFACES],
    );
  }
  if (body.defaultModelId !== undefined) {
    round10Columns.push('default_model_id');
    round10Values.push(body.defaultModelId);
  }
  if (body.importedFrom !== undefined) {
    round10Columns.push('imported_from');
    round10Values.push(body.importedFrom);
  }

  const hasRound10 = round10Columns.length > 0;

  function buildInsertSql(includeRound10: boolean): { sql: string; params: unknown[] } {
    const cols = includeRound10 ? [...baseColumns, ...round10Columns] : [...baseColumns];
    const vals = includeRound10 ? [...baseValues, ...round10Values] : [...baseValues];
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const limitParameter = `$${vals.length + 1}`;
    return {
      sql: `with inserted as materialized (
              insert into user_projects (${cols.join(', ')}) values (${placeholders}) returning *
            ), quota_guard as materialized (
              select public.assert_user_resource_limit('projects', $1, ${limitParameter})
                from (select count(*) from inserted) as dependency
            )
            select inserted.* from inserted cross join quota_guard`,
      params: [...vals, projectLimit],
    };
  }

  const insertProjectWithMembership = (includeRound10: boolean) =>
    db.transaction(async (tx) => {
      const { sql, params } = buildInsertSql(includeRound10);
      const [inserted] = await tx.query<Record<string, unknown>>(sql, params);
      if (!inserted || typeof inserted['id'] !== 'string') throw new Error('No row returned');
      await replaceProjectConversationMembership(tx, {
        userId,
        organizationId,
        projectId: inserted['id'],
        conversationIds: body.conversationIds ?? [],
      });
      return inserted;
    });

  let rowData: Record<string, unknown>;
  try {
    try {
      rowData = await insertProjectWithMembership(hasRound10);
    } catch (error) {
      if (
        hasRound10 &&
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === PG_UNDEFINED_COLUMN
      ) {
        rowData = await insertProjectWithMembership(false);
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (isUserResourceLimitError(error)) {
      throw createError.validation(getProjectLimitErrorMessage(planTier));
    }
    if (error instanceof ProjectConversationMembershipError) {
      throw createError.validation(error.message);
    }
    logger.error({ error, userId }, 'Failed to create project');
    throw createError.internal('Failed to create project');
  }

  return NextResponse.json({ project: mapProjectRow(rowData) }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleGetProjects));
export const POST = withCorsRoute(withErrorHandler(handleCreateProject));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
