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

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { userId } = await getClerkAuthUser(request);
  const supabase = await (await import('@/services/supabase-server')).createSupabaseServerClient();
  const { id } = await context.params;

  const { data, error } = await supabase
    .from('user_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw createError.notFound('Project not found');
  }

  return NextResponse.json({
    project: mapProjectRow(data as Record<string, unknown>),
  });
}

async function handleUpdateProject(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing PUT endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { userId } = await getClerkAuthUser(request);
  const supabase = await (await import('@/services/supabase-server')).createSupabaseServerClient();
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

  // Build the update payload with only the fields that were provided
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates['name'] = body.name.trim();
  if (body.description !== undefined) updates['description'] = body.description?.trim() ?? null;
  if (body.instructions !== undefined) updates['instructions'] = body.instructions?.trim() ?? null;
  if (body.color !== undefined) updates['color'] = body.color.trim();
  if (body.isArchived !== undefined) updates['is_archived'] = body.isArchived;

  // Round-10 fields — isolated so we can retry without them if the migration
  // hasn't applied yet (PG error 42703: undefined_column).
  const round10Updates: Record<string, unknown> = {};
  if (body.iconEmoji !== undefined) round10Updates['icon_emoji'] = body.iconEmoji;
  if (body.accentColor !== undefined) round10Updates['accent_color'] = body.accentColor;
  if (body.defaultPrivacyMode !== undefined)
    round10Updates['default_privacy_mode'] = body.defaultPrivacyMode;
  if (body.defaultProviderMode !== undefined)
    round10Updates['default_provider_mode'] = body.defaultProviderMode;
  if (body.allowedSurfaces !== undefined) {
    // Filter to only canonical surface values; preserve input order
    const filtered = body.allowedSurfaces.filter((s) =>
      (ALL_SURFACES as readonly string[]).includes(s),
    );
    round10Updates['allowed_surfaces'] = filtered.length > 0 ? filtered : [...SYNCED_APP_SURFACES];
  }
  if (body.defaultModelId !== undefined) round10Updates['default_model_id'] = body.defaultModelId;
  if (body.importedFrom !== undefined) round10Updates['imported_from'] = body.importedFrom;

  const hasRound10 = Object.keys(round10Updates).length > 0;

  const doUpdate = async (includeRound10: boolean) => {
    const payload = includeRound10 ? { ...updates, ...round10Updates } : updates;
    return supabase
      .from('user_projects')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();
  };

  let result = await doUpdate(hasRound10);

  if (
    hasRound10 &&
    result.error &&
    (result.error as unknown as { code?: string }).code === PG_UNDEFINED_COLUMN
  ) {
    // Migration not yet applied — retry with only legacy fields
    result = await doUpdate(false);
  }

  if (result.error || !result.data) {
    throw createError.notFound('Project not found');
  }

  return NextResponse.json({
    project: mapProjectRow(result.data as Record<string, unknown>),
  });
}

async function handleDeleteProject(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { userId } = await getClerkAuthUser(request);
  const supabase = await (await import('@/services/supabase-server')).createSupabaseServerClient();
  const { id } = await context.params;

  const { error } = await supabase
    .from('user_projects')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, projectId: id, userId }, 'Failed to delete project');
    throw createError.internal('Failed to delete project');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetProject);
export const PUT = withErrorHandler(handleUpdateProject);
export const DELETE = withErrorHandler(handleDeleteProject);
