/**
 * Knowledge Files API · Cloud Managed feature, rolling out in public alpha.
 *
 * GET  /api/projects/[id]/knowledge-files · list active files for a project
 * POST /api/projects/[id]/knowledge-files · record an uploaded file
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
import { getNeonDb } from '@/lib/server/neon-db';
import {
  extractProjectKnowledgeFile,
  ProjectKnowledgeExtractionError,
} from '@/lib/server/project-knowledge-extraction';
import {
  SYNCED_APP_SURFACES,
  DEVELOPER_SESSION_SURFACES,
  validateAttachmentMeta,
  type SourceSurface,
} from '@agiworkforce/types';

const ALL_SURFACES: readonly SourceSurface[] = [
  ...SYNCED_APP_SURFACES,
  ...DEVELOPER_SESSION_SURFACES,
];

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

type RouteContext = { params: Promise<{ id: string }> };

function isSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

async function handleListKnowledgeFiles(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: projectId } = await context.params;

  // Verify project ownership before listing files
  const [project] = await db.query<{ id: string }>(
    `select id from user_projects where id = $1 and user_id = $2 limit 1`,
    [projectId, userId],
  );

  if (!project) {
    throw createError.notFound('Project not found');
  }

  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      `select * from project_knowledge_files
       where project_id = $1 and deleted_at is null
       order by added_at desc`,
      [projectId],
    );
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json({ files: [] });
    }
    logger.error({ error, projectId }, 'Failed to fetch knowledge files');
    throw createError.internal('Failed to fetch knowledge files');
  }

  return NextResponse.json({
    files: data.map((row) => mapKnowledgeFileRow(row)),
  });
}

async function handleCreateKnowledgeFile(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
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
  const attachmentValidation = validateAttachmentMeta(
    body.fileName.trim(),
    body.mimeType.trim(),
    body.byteCount,
  );
  if (!attachmentValidation.ok) {
    throw createError.validation(attachmentValidation.message);
  }
  if (
    !body.checksumSha256 ||
    typeof body.checksumSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(body.checksumSha256.trim())
  ) {
    throw createError.validation('checksumSha256 must be a SHA-256 hex digest');
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
  const [project] = await db.query<{ id: string }>(
    `select id from user_projects where id = $1 and user_id = $2 limit 1`,
    [projectId, userId],
  );

  if (!project) {
    throw createError.notFound('Project not found');
  }

  let extractedText: string | null;
  try {
    const extraction = await extractProjectKnowledgeFile({
      projectId,
      storageUri: body.storageUri.trim(),
      fileName: body.fileName.trim(),
      mimeType: body.mimeType.trim(),
      byteCount: body.byteCount,
      checksumSha256: body.checksumSha256.trim(),
    });
    extractedText = extraction.extractedText;
  } catch (error) {
    if (error instanceof ProjectKnowledgeExtractionError) {
      throw createError.validation(error.message);
    }
    logger.error({ error, projectId }, 'Failed to extract project knowledge file');
    throw createError.internal('Failed to process the uploaded file');
  }

  let data: Record<string, unknown>;
  try {
    const [inserted] = await db.query<Record<string, unknown>>(
      `insert into project_knowledge_files
         (project_id, file_name, mime_type, byte_count, checksum_sha256, summary, source_surface, added_by_user_id, storage_uri, extracted_text, extracted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $10::text is null then null else now() end)
       returning *`,
      [
        projectId,
        body.fileName.trim(),
        body.mimeType.trim(),
        body.byteCount,
        body.checksumSha256.trim(),
        body.summary?.trim() ?? null,
        body.sourceSurface,
        userId,
        body.storageUri.trim(),
        extractedText,
      ],
    );
    if (!inserted) throw new Error('No row returned');
    data = inserted;
  } catch (error) {
    if (isSchemaNotReady(error)) {
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

  return NextResponse.json({ file: mapKnowledgeFileRow(data) }, { status: 201 });
}

export const GET = withErrorHandler(handleListKnowledgeFiles);
export const POST = withErrorHandler(handleCreateKnowledgeFile);
