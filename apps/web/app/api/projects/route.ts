import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { DEFAULT_PROJECT_COLOR, mapProjectRow } from '@/lib/projects';
import { parseProjectRequest } from '@/lib/project-request-validation';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { buildPage, decodeKeysetCursor, keysetSql } from '@/lib/identity/pagination';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
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
import {
  resolveProductAnalyticsSurface,
  trackProductAnalyticsEvent,
} from '@/lib/server/product-analytics';

const PAGE_SORT_COLUMN = 'page_sort_key';
// Fixed-width UTC text, so lexicographic order is chronological order and the
// cursor round-trips at the microsecond precision the column actually stores.
const PAGE_SORT_KEY_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

async function handleGetProjects(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100));
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);
  // A cursor names the last row, so a project updated while the reader pages
  // cannot shift the window. Offset stays for clients that still send it.
  const cursor = decodeKeysetCursor(url.searchParams.get('cursor'));

  const sharedScope = await resolveSharedProjectScope(db, userId);
  const sharedProjectIds =
    sharedScope?.organizationId === organizationId ? sharedScope.projectIds : [];

  const params: unknown[] = [userId, limit + 1, offset, sharedProjectIds, organizationId];
  const keyset = keysetSql({
    sortColumn: PAGE_SORT_COLUMN,
    idColumn: 'id',
    ...(cursor ? { cursor } : {}),
    firstParamIndex: params.length + 1,
  });
  params.push(...keyset.params);

  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      `select * from (
         select p.id, p.user_id, p.organization_id, p.name, p.description, p.instructions,
                p.color, p.is_archived, p.uses_global_memory, p.uses_account_instructions,
                p.uses_account_style, p.metadata, p.default_privacy_mode,
                p.default_provider_mode, p.allowed_surfaces, p.default_model_id, p.last_used_at,
                p.icon_emoji, p.accent_color, p.imported_from, p.created_at, p.updated_at,
                to_char(p.updated_at at time zone 'utc', ${PAGE_SORT_KEY_FORMAT}) as ${PAGE_SORT_COLUMN},
                (p.user_id <> $1) as is_org_shared,
                (select count(*)::int
                   from web_conversations c
                  where c.project_id = p.id::text
                    and c.user_id = $1
                    and c.organization_id is not distinct from $5::uuid
                    and c.deleted_at is null
                    and coalesce(c.is_temporary, false) = false) as conversation_count
           from user_projects p
          where p.deleted_at is null
             and p.organization_id is not distinct from $5::uuid
             and (p.user_id = $1 or p.id = any($4::uuid[]))
       ) projects
       ${keyset.where ? `where ${keyset.where}` : ''}
       ${keyset.orderBy}
       limit $2 ${cursor ? '' : 'offset $3'}`,
      params,
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch projects');
    throw createError.internal('Failed to fetch projects');
  }

  const page = buildPage(data, limit, (row) => ({
    sortValue: String(row[PAGE_SORT_COLUMN] ?? ''),
    id: String(row['id']),
  }));

  return NextResponse.json({
    projects: page.items.map((p) => mapProjectRow(p)),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  });
}

async function handleCreateProject(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const featureGate = await buildWorkspaceFeatureGateResponse(
    userId,
    request,
    'projects',
    resolveCloudChatSurface(request),
  );
  if (featureGate) return featureGate;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const body = parseProjectRequest(ManagedCloudProjectCreateRequestSchema, rawBody);
  const planTier = await resolveEntitledPlanTier(db, userId);
  const projectLimit = getProjectLimit(planTier);
  if (projectLimit === 0) {
    throw createError.validation(getProjectLimitErrorMessage(planTier));
  }

  const columns = ['user_id', 'organization_id', 'name', 'description', 'instructions', 'color'];
  const values: unknown[] = [
    userId,
    organizationId,
    body.name.trim(),
    body.description?.trim() ?? '',
    body.instructions?.trim() ?? '',
    body.color?.trim() || DEFAULT_PROJECT_COLOR,
  ];

  if (body.iconEmoji !== undefined) {
    columns.push('icon_emoji');
    values.push(body.iconEmoji);
  }
  if (body.accentColor !== undefined) {
    columns.push('accent_color');
    values.push(body.accentColor);
  }
  if (body.defaultPrivacyMode !== undefined) {
    columns.push('default_privacy_mode');
    values.push(body.defaultPrivacyMode);
  }
  if (body.defaultProviderMode !== undefined) {
    columns.push('default_provider_mode');
    values.push(body.defaultProviderMode);
  }
  if (body.allowedSurfaces !== undefined) {
    columns.push('allowed_surfaces');
    values.push(body.allowedSurfaces.length > 0 ? body.allowedSurfaces : [...SYNCED_APP_SURFACES]);
  }
  if (body.defaultModelId !== undefined) {
    columns.push('default_model_id');
    values.push(body.defaultModelId);
  }
  if (body.importedFrom !== undefined) {
    columns.push('imported_from');
    values.push(body.importedFrom);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const insertSql = `with inserted as materialized (
              insert into user_projects (${columns.join(', ')}) values (${placeholders}) returning *
            ), quota_guard as materialized (
              select public.assert_user_resource_limit('projects', $1, $${values.length + 1})
                from (select count(*) from inserted) as dependency
            )
            select inserted.* from inserted cross join quota_guard`;

  let rowData: Record<string, unknown>;
  try {
    rowData = await db.transaction(async (tx) => {
      const [inserted] = await tx.query<Record<string, unknown>>(insertSql, [
        ...values,
        projectLimit,
      ]);
      if (!inserted || typeof inserted['id'] !== 'string') throw new Error('No row returned');
      await replaceProjectConversationMembership(tx, {
        userId,
        organizationId,
        projectId: inserted['id'],
        conversationIds: body.conversationIds ?? [],
      });
      return inserted;
    });
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

  trackProductAnalyticsEvent(
    { userId, organizationId },
    { name: 'project_created', surface: resolveProductAnalyticsSurface(request) },
  );

  return NextResponse.json({ project: mapProjectRow(rowData) }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleGetProjects));
export const POST = withCorsRoute(withErrorHandler(handleCreateProject));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
