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
      `select * from user_projects
       where user_id = $1
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

  let body: {
    name?: string;
    description?: string;
    instructions?: string;
    color?: string;
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

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw createError.validation('Name is required');
  }

  if (body.name.trim().length > 200) {
    throw createError.validation('Name must be 200 characters or less');
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

  // Build columns/values for the insert, optionally including round-10 fields
  const baseColumns = ['user_id', 'name', 'description', 'instructions', 'color'];
  const baseValues: unknown[] = [
    userId,
    body.name.trim(),
    body.description?.trim() ?? '',
    body.instructions?.trim() ?? '',
    body.color?.trim() || '#3b82f6',
  ];

  // Round-10 fields — only included when present in the request body
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
    const filtered = body.allowedSurfaces.filter((s) =>
      (ALL_SURFACES as readonly string[]).includes(s),
    );
    round10Columns.push('allowed_surfaces');
    round10Values.push(filtered.length > 0 ? filtered : [...SYNCED_APP_SURFACES]);
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
    return {
      sql: `insert into user_projects (${cols.join(', ')}) values (${placeholders}) returning *`,
      params: vals,
    };
  }

  let rowData: Record<string, unknown>;
  try {
    const { sql, params } = buildInsertSql(hasRound10);
    const [inserted] = await db.query<Record<string, unknown>>(sql, params);
    if (!inserted) throw new Error('No row returned');
    rowData = inserted;
  } catch (firstError) {
    if (
      hasRound10 &&
      firstError &&
      typeof firstError === 'object' &&
      (firstError as { code?: string }).code === PG_UNDEFINED_COLUMN
    ) {
      // Migration not yet applied — retry with only legacy fields
      try {
        const { sql, params } = buildInsertSql(false);
        const [inserted] = await db.query<Record<string, unknown>>(sql, params);
        if (!inserted) throw new Error('No row returned');
        rowData = inserted;
      } catch (retryError) {
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
