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

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { userId } = await getClerkAuthUser(request);
  const supabase = await (await import('@/services/supabase-server')).createSupabaseServerClient();

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const parsedOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 100));
  const offset = Math.min(Math.max(Number.isNaN(parsedOffset) ? 0 : parsedOffset, 0), 10_000);

  const { data, error } = await supabase
    .from('user_projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch projects');
    throw createError.internal('Failed to fetch projects');
  }

  return NextResponse.json({
    projects: (data || []).map((p) => mapProjectRow(p as Record<string, unknown>)),
  });
}

async function handleCreateProject(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { userId } = await getClerkAuthUser(request);
  const supabase = await (await import('@/services/supabase-server')).createSupabaseServerClient();

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

  const baseInsert: Record<string, unknown> = {
    user_id: userId,
    name: body.name.trim(),
    description: body.description?.trim() ?? '',
    instructions: body.instructions?.trim() ?? '',
    color: body.color?.trim() || '#3b82f6',
  };

  // Round-10 fields — only included when present in the request body
  const round10Insert: Record<string, unknown> = {};
  if (body.iconEmoji !== undefined) round10Insert['icon_emoji'] = body.iconEmoji;
  if (body.accentColor !== undefined) round10Insert['accent_color'] = body.accentColor;
  if (body.defaultPrivacyMode !== undefined)
    round10Insert['default_privacy_mode'] = body.defaultPrivacyMode;
  if (body.defaultProviderMode !== undefined)
    round10Insert['default_provider_mode'] = body.defaultProviderMode;
  if (body.allowedSurfaces !== undefined) {
    const filtered = body.allowedSurfaces.filter((s) =>
      (ALL_SURFACES as readonly string[]).includes(s),
    );
    round10Insert['allowed_surfaces'] = filtered.length > 0 ? filtered : [...SYNCED_APP_SURFACES];
  }
  if (body.defaultModelId !== undefined) round10Insert['default_model_id'] = body.defaultModelId;
  if (body.importedFrom !== undefined) round10Insert['imported_from'] = body.importedFrom;

  const hasRound10 = Object.keys(round10Insert).length > 0;

  const doInsert = async (includeRound10: boolean) => {
    const payload = includeRound10 ? { ...baseInsert, ...round10Insert } : baseInsert;
    return supabase.from('user_projects').insert(payload).select('*').single();
  };

  let result = await doInsert(hasRound10);

  if (
    hasRound10 &&
    result.error &&
    (result.error as unknown as { code?: string }).code === PG_UNDEFINED_COLUMN
  ) {
    // Migration not yet applied — retry with only legacy fields
    result = await doInsert(false);
  }

  if (result.error) {
    logger.error({ error: result.error, userId }, 'Failed to create project');
    throw createError.internal('Failed to create project');
  }

  return NextResponse.json(
    { project: mapProjectRow(result.data as Record<string, unknown>) },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleGetProjects);
export const POST = withErrorHandler(handleCreateProject);
