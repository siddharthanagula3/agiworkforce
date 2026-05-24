/**
 * Knowledge Files API — Cloud Managed feature (waitlist-gated in v1).
 *
 * GET  /api/projects/[id]/knowledge-files — list active files for a project
 * POST /api/projects/[id]/knowledge-files — record an uploaded file
 *
 * Pre-migration safety: catches PG error 42P01 (undefined_table).
 *   GET  → 200 { files: [] }
 *   POST → 503 { error: 'knowledge_files_unavailable', message: '...' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { mapKnowledgeFileRow } from '@/lib/projects';
import {
  SYNCED_APP_SURFACES,
  DEVELOPER_SESSION_SURFACES,
  MAX_ATTACHMENT_BYTES,
  type SourceSurface,
} from '@agiworkforce/types';

const ALL_SURFACES: readonly SourceSurface[] = [
  ...SYNCED_APP_SURFACES,
  ...DEVELOPER_SESSION_SURFACES,
];

const PG_UNDEFINED_TABLE = '42P01';

type RouteContext = { params: Promise<{ id: string }> };

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE
  );
}

async function handleListKnowledgeFiles(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const supabase = await (await import('@/services/supabase-server')).createSupabaseServerClient();
  const { id: projectId } = await context.params;

  // Verify project ownership before listing files
  const { data: project, error: projectError } = await supabase
    .from('user_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (projectError || !project) {
    throw createError.notFound('Project not found');
  }

  const { data, error } = await supabase
    .from('project_knowledge_files')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('added_at', { ascending: false });

  if (error) {
    if (isUndefinedTable(error)) {
      return NextResponse.json({ files: [] });
    }
    logger.error({ error, projectId }, 'Failed to fetch knowledge files');
    throw createError.internal('Failed to fetch knowledge files');
  }

  return NextResponse.json({
    files: (data || []).map((row) => mapKnowledgeFileRow(row as Record<string, unknown>)),
  });
}

async function handleCreateKnowledgeFile(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const supabase = await (await import('@/services/supabase-server')).createSupabaseServerClient();
  const { id: projectId } = await context.params;

  let body: {
    fileName?: string;
    mimeType?: string;
    byteCount?: number;
    checksumSha256?: string;
    sourceSurface?: string;
    storageUri?: string;
    summary?: string;
  };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.fileName || typeof body.fileName !== 'string' || body.fileName.trim().length === 0) {
    throw createError.validation('fileName is required');
  }
  if (!body.mimeType || typeof body.mimeType !== 'string' || body.mimeType.trim().length === 0) {
    throw createError.validation('mimeType is required');
  }
  if (typeof body.byteCount !== 'number' || body.byteCount <= 0) {
    throw createError.validation('byteCount must be a positive number');
  }
  if (body.byteCount > MAX_ATTACHMENT_BYTES) {
    const limitMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    throw createError.validation(`byteCount exceeds the ${limitMb} MiB limit`);
  }
  if (
    !body.checksumSha256 ||
    typeof body.checksumSha256 !== 'string' ||
    body.checksumSha256.trim().length === 0
  ) {
    throw createError.validation('checksumSha256 is required');
  }
  if (!body.sourceSurface || !(ALL_SURFACES as readonly string[]).includes(body.sourceSurface)) {
    throw createError.validation(`sourceSurface must be one of: ${ALL_SURFACES.join(', ')}`);
  }
  if (
    !body.storageUri ||
    typeof body.storageUri !== 'string' ||
    body.storageUri.trim().length === 0
  ) {
    throw createError.validation('storageUri is required');
  }

  // Verify project ownership
  const { data: project, error: projectError } = await supabase
    .from('user_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (projectError || !project) {
    throw createError.notFound('Project not found');
  }

  const { data, error } = await supabase
    .from('project_knowledge_files')
    .insert({
      project_id: projectId,
      file_name: body.fileName.trim(),
      mime_type: body.mimeType.trim(),
      byte_count: body.byteCount,
      checksum_sha256: body.checksumSha256.trim(),
      summary: body.summary?.trim() ?? null,
      source_surface: body.sourceSurface,
      added_by_user_id: userId,
      storage_uri: body.storageUri.trim(),
    })
    .select('*')
    .single();

  if (error) {
    if (isUndefinedTable(error)) {
      return NextResponse.json(
        {
          error: 'knowledge_files_unavailable',
          message: 'Knowledge files require Cloud Managed (pending migration apply)',
        },
        { status: 503 },
      );
    }
    logger.error({ error, projectId }, 'Failed to create knowledge file');
    throw createError.internal('Failed to create knowledge file');
  }

  return NextResponse.json(
    { file: mapKnowledgeFileRow(data as Record<string, unknown>) },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleListKnowledgeFiles);
export const POST = withErrorHandler(handleCreateKnowledgeFile);
