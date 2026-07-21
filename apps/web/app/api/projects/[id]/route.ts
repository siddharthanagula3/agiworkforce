/**
 * Single Project API
 *
 * GET /api/projects/[id] - Get a single project by ID
 * PUT /api/projects/[id] - Update project fields
 * DELETE /api/projects/[id] - Delete a project
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
import { ManagedCloudProjectUpdateRequestSchema } from '@agiworkforce/cloud-contracts';
import { SYNCED_APP_SURFACES } from '@agiworkforce/types';

const PG_UNDEFINED_COLUMN = '42703';

type RouteContext = { params: Promise<{ id: string }> };

async function handleGetProject(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  const [data] = await db.query<Record<string, unknown>>(
    `select * from user_projects
     where id = $1 and user_id = $2 and deleted_at is null
     limit 1`,
    [id, userId],
  );

  if (!data) {
    throw createError.notFound('Project not found');
  }

  return NextResponse.json({
    project: mapProjectRow(data),
  });
}

async function handleUpdateProject(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing PUT endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const body = parseProjectRequest(ManagedCloudProjectUpdateRequestSchema, rawBody);

  // Build SET clauses for legacy fields
  const baseSetClauses: string[] = ['updated_at = now()'];
  const baseParams: unknown[] = [];

  function addBase(col: string, val: unknown) {
    baseParams.push(val);
    baseSetClauses.push(`${col} = $${baseParams.length}`);
  }

  if (body.name !== undefined) addBase('name', body.name.trim());
  if (body.description !== undefined) addBase('description', body.description?.trim() ?? null);
  if (body.instructions !== undefined) addBase('instructions', body.instructions?.trim() ?? null);
  if (body.color !== undefined) addBase('color', body.color.trim());
  if (body.isArchived !== undefined) addBase('is_archived', body.isArchived);
  // Starred/pinned lives in the existing metadata jsonb (no migration): merge it
  // in so other metadata keys are preserved.
  if (body.starred !== undefined) {
    baseParams.push(body.starred);
    baseSetClauses.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('starred', $${baseParams.length}::boolean)`,
    );
  }

  // Round-10 fields · isolated so we can retry without them if migration not applied
  const round10SetClauses: string[] = [];
  const round10Params: unknown[] = [];

  function addRound10(col: string, val: unknown) {
    // param index continues after baseParams
    const idx = baseParams.length + round10Params.length + 1;
    round10Params.push(val);
    round10SetClauses.push(`${col} = $${idx}`);
  }

  if (body.iconEmoji !== undefined) addRound10('icon_emoji', body.iconEmoji);
  if (body.accentColor !== undefined) addRound10('accent_color', body.accentColor);
  if (body.defaultPrivacyMode !== undefined)
    addRound10('default_privacy_mode', body.defaultPrivacyMode);
  if (body.defaultProviderMode !== undefined)
    addRound10('default_provider_mode', body.defaultProviderMode);
  if (body.allowedSurfaces !== undefined) {
    addRound10(
      'allowed_surfaces',
      body.allowedSurfaces.length > 0 ? body.allowedSurfaces : [...SYNCED_APP_SURFACES],
    );
  }
  if (body.defaultModelId !== undefined) addRound10('default_model_id', body.defaultModelId);
  if (body.importedFrom !== undefined) addRound10('imported_from', body.importedFrom);

  const hasRound10 = round10SetClauses.length > 0;

  function buildUpdateSql(includeRound10: boolean): { sql: string; params: unknown[] } {
    const setClauses = includeRound10
      ? [...baseSetClauses, ...round10SetClauses]
      : [...baseSetClauses];
    const params = includeRound10 ? [...baseParams, ...round10Params] : [...baseParams];
    // WHERE clause params come after SET params
    const idIdx = params.length + 1;
    const userIdx = params.length + 2;
    return {
      sql: `update user_projects set ${setClauses.join(', ')} where id = $${idIdx} and user_id = $${userIdx} and deleted_at is null returning *`,
      params: [...params, id, userId],
    };
  }

  let rowData: Record<string, unknown>;
  try {
    const { sql, params } = buildUpdateSql(hasRound10);
    const [updated] = await db.query<Record<string, unknown>>(sql, params);
    if (!updated) throw createError.notFound('Project not found');
    rowData = updated;
  } catch (firstError) {
    if (
      hasRound10 &&
      firstError &&
      typeof firstError === 'object' &&
      (firstError as { code?: string }).code === PG_UNDEFINED_COLUMN
    ) {
      // Migration not yet applied · retry with only legacy fields
      try {
        const { sql, params } = buildUpdateSql(false);
        const [updated] = await db.query<Record<string, unknown>>(sql, params);
        if (!updated) throw createError.notFound('Project not found');
        rowData = updated;
      } catch (retryError) {
        throw retryError;
      }
    } else {
      throw firstError;
    }
  }

  return NextResponse.json({
    project: mapProjectRow(rowData),
  });
}

async function handleDeleteProject(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  let affected: number;
  try {
    // SOFT-delete (set the deleted_at tombstone) instead of a hard DELETE so the
    // deletion propagates across devices via cross-device sync (0041). The BEFORE
    // UPDATE trigger bumps server_version, so the next /api/projects/sync pull
    // carries the tombstone. Hard-deleting would resurrect the row on the next pull
    // from another device that still has it. updated_at is bumped so last-writer-wins
    // treats the delete as the latest change.
    affected = await db.execute(
      `update user_projects
         set deleted_at = now(), updated_at = now()
       where id = $1 and user_id = $2 and deleted_at is null`,
      [id, userId],
    );
  } catch (error) {
    logger.error({ error, projectId: id, userId }, 'Failed to delete project');
    throw createError.internal('Failed to delete project');
  }

  if (affected === 0) {
    throw createError.notFound('Project not found');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetProject);
export const PUT = withErrorHandler(handleUpdateProject);
export const DELETE = withErrorHandler(handleDeleteProject);
