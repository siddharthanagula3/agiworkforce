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
import { getNeonDb } from '@/lib/server/neon-db';
import {
  PRIVACY_MODES,
  PROVIDER_MODES,
  SYNCED_APP_SURFACES,
  DEVELOPER_SESSION_SURFACES,
  type PrivacyMode,
  type ProviderMode,
  type ProjectAccentColor,
  type ProjectImportSource,
  type SourceSurface,
} from '@agiworkforce/types';

const ACCENT_COLORS: readonly ProjectAccentColor[] = [
  'emerald',
  'sky',
  'amber',
  'rose',
  'violet',
  'zinc',
];
const IMPORT_SOURCES: readonly ProjectImportSource[] = ['claude', 'openai', 'manual'];
const ALL_SURFACES: readonly SourceSurface[] = [
  ...SYNCED_APP_SURFACES,
  ...DEVELOPER_SESSION_SURFACES,
];

const PG_UNDEFINED_COLUMN = '42703';

type RouteContext = { params: Promise<{ id: string }> };

async function handleGetProject(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  const [data] = await db.query<Record<string, unknown>>(
    `select * from user_projects where id = $1 and user_id = $2 limit 1`,
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

  let body: {
    name?: string;
    description?: string;
    instructions?: string;
    color?: string;
    isArchived?: boolean;
    iconEmoji?: string | null;
    accentColor?: ProjectAccentColor | null;
    defaultPrivacyMode?: PrivacyMode;
    defaultProviderMode?: ProviderMode;
    allowedSurfaces?: SourceSurface[];
    defaultModelId?: string | null;
    importedFrom?: ProjectImportSource | null;
  };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw createError.validation('Name must be a non-empty string');
    }
    if (body.name.trim().length > 200) {
      throw createError.validation('Name must be 200 characters or less');
    }
  }

  if (
    body.description !== undefined &&
    body.description !== null &&
    body.description.length > 2_000
  ) {
    throw createError.validation('Description must be 2,000 characters or less');
  }

  if (
    body.instructions !== undefined &&
    body.instructions !== null &&
    body.instructions.length > 10_000
  ) {
    throw createError.validation('Instructions must be 10,000 characters or less');
  }

  if (
    body.defaultPrivacyMode !== undefined &&
    !(PRIVACY_MODES as readonly string[]).includes(body.defaultPrivacyMode)
  ) {
    throw createError.validation(`defaultPrivacyMode must be one of: ${PRIVACY_MODES.join(', ')}`);
  }

  if (
    body.defaultProviderMode !== undefined &&
    !(PROVIDER_MODES as readonly string[]).includes(body.defaultProviderMode)
  ) {
    throw createError.validation(
      `defaultProviderMode must be one of: ${PROVIDER_MODES.join(', ')}`,
    );
  }

  if (
    body.accentColor !== undefined &&
    body.accentColor !== null &&
    !(ACCENT_COLORS as readonly string[]).includes(body.accentColor)
  ) {
    throw createError.validation(`accentColor must be one of: ${ACCENT_COLORS.join(', ')}`);
  }

  if (
    body.importedFrom !== undefined &&
    body.importedFrom !== null &&
    !(IMPORT_SOURCES as readonly string[]).includes(body.importedFrom)
  ) {
    throw createError.validation(`importedFrom must be one of: ${IMPORT_SOURCES.join(', ')}`);
  }

  if (body.iconEmoji !== undefined && body.iconEmoji !== null) {
    if (typeof body.iconEmoji !== 'string' || body.iconEmoji.length > 16) {
      throw createError.validation('iconEmoji must be a string of 16 characters or less');
    }
  }

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
    const filtered = body.allowedSurfaces.filter((s) =>
      (ALL_SURFACES as readonly string[]).includes(s),
    );
    addRound10('allowed_surfaces', filtered.length > 0 ? filtered : [...SYNCED_APP_SURFACES]);
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
      sql: `update user_projects set ${setClauses.join(', ')} where id = $${idIdx} and user_id = $${userIdx} returning *`,
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

  try {
    // SOFT-delete (set the deleted_at tombstone) instead of a hard DELETE so the
    // deletion propagates across devices via cross-device sync (0041). The BEFORE
    // UPDATE trigger bumps server_version, so the next /api/projects/sync pull
    // carries the tombstone. Hard-deleting would resurrect the row on the next pull
    // from another device that still has it. updated_at is bumped so last-writer-wins
    // treats the delete as the latest change.
    await db.execute(
      `update user_projects
         set deleted_at = now(), updated_at = now()
       where id = $1 and user_id = $2 and deleted_at is null`,
      [id, userId],
    );
  } catch (error) {
    logger.error({ error, projectId: id, userId }, 'Failed to delete project');
    throw createError.internal('Failed to delete project');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetProject);
export const PUT = withErrorHandler(handleUpdateProject);
export const DELETE = withErrorHandler(handleDeleteProject);
