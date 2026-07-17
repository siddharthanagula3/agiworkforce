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
import { getProjectLimit, isUserResourceLimitError } from '@/lib/services/free-plan-entitlements';
import { ManagedCloudProjectCreateRequestSchema } from '@agiworkforce/cloud-contracts';
import { SYNCED_APP_SURFACES } from '@agiworkforce/types';

const PG_UNDEFINED_COLUMN = '42703';

async function handleGetProjects(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100));
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);

  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      // Hide soft-deleted projects (deleted_at tombstones from cross-device sync, 0041).
      `select * from user_projects
       where user_id = $1 and deleted_at is null
       order by updated_at desc
       limit $2 offset $3`,
      [userId, limit, offset],
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
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const body = parseProjectRequest(ManagedCloudProjectCreateRequestSchema, rawBody);
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const projectLimit = getProjectLimit(subscription?.plan_tier);

  // Build columns/values for the insert, optionally including round-10 fields
  const baseColumns = ['user_id', 'name', 'description', 'instructions', 'color'];
  const baseValues: unknown[] = [
    userId,
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

  let rowData: Record<string, unknown>;
  try {
    const { sql, params } = buildInsertSql(hasRound10);
    const [inserted] = await db.query<Record<string, unknown>>(sql, params);
    if (!inserted) throw new Error('No row returned');
    rowData = inserted;
  } catch (firstError) {
    if (isUserResourceLimitError(firstError)) {
      throw createError.validation(
        'Free accounts can have up to 5 Projects. Delete a Project or upgrade to create another.',
      );
    }
    if (
      hasRound10 &&
      firstError &&
      typeof firstError === 'object' &&
      (firstError as { code?: string }).code === PG_UNDEFINED_COLUMN
    ) {
      // Migration not yet applied · retry with only legacy fields
      try {
        const { sql, params } = buildInsertSql(false);
        const [inserted] = await db.query<Record<string, unknown>>(sql, params);
        if (!inserted) throw new Error('No row returned');
        rowData = inserted;
      } catch (retryError) {
        if (isUserResourceLimitError(retryError)) {
          throw createError.validation(
            'Free accounts can have up to 5 Projects. Delete a Project or upgrade to create another.',
          );
        }
        logger.error({ error: retryError, userId }, 'Failed to create project');
        throw createError.internal('Failed to create project');
      }
    } else {
      logger.error({ error: firstError, userId }, 'Failed to create project');
      throw createError.internal('Failed to create project');
    }
  }

  return NextResponse.json({ project: mapProjectRow(rowData) }, { status: 201 });
}

export const GET = withErrorHandler(handleGetProjects);
export const POST = withErrorHandler(handleCreateProject);
