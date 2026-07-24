/**
 * Knowledge Files API · Cloud Managed feature, rolling out in public alpha.
 *
 * GET  /api/projects/[id]/knowledge-files · list active files for a project
 * POST /api/projects/[id]/knowledge-files · record an uploaded file
 *
 * Missing schema fails closed with 503. Returning a fabricated empty list
 * would make clients claim a project has no sources when the capability is
 * actually unavailable.
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
import { MAX_KNOWLEDGE_FILES } from '@/lib/services/project-context-service';
import {
  extractProjectKnowledgeFile,
  ProjectKnowledgeExtractionError,
} from '@/lib/server/project-knowledge-extraction';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { ManagedCloudProjectKnowledgeRegisterRequestSchema } from '@agiworkforce/cloud-contracts';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

type RouteContext = { params: Promise<{ id: string }> };

function projectKnowledgeResponse(row: Record<string, unknown>, projectId: string) {
  const file = mapKnowledgeFileRow(row);
  return {
    ...file,
    storageUri: `/api/projects/${encodeURIComponent(projectId)}/knowledge-files/${encodeURIComponent(file.id)}`,
  };
}

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
    `select id
       from user_projects
      where id = $1 and user_id = $2 and is_archived = false and deleted_at is null
      limit 1`,
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
      return NextResponse.json(
        {
          error: 'knowledge_files_unavailable',
          message: 'Project sources are temporarily unavailable.',
        },
        { status: 503 },
      );
    }
    logger.error({ error, projectId }, 'Failed to fetch knowledge files');
    throw createError.internal('Failed to fetch knowledge files');
  }

  return NextResponse.json({
    files: data.map((row) => projectKnowledgeResponse(row, projectId)),
  });
}

async function handleCreateKnowledgeFile(request: NextRequest, context: RouteContext) {
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const db = getNeonDb();
  const { id: projectId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const parsedBody = ManagedCloudProjectKnowledgeRegisterRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    const issue = parsedBody.error.issues[0];
    throw createError.validation(
      issue
        ? `${issue.path.join('.') || 'request'}: ${issue.message}`
        : 'Invalid project source metadata',
    );
  }
  const body = parsedBody.data;
  const attachmentValidation = validateAttachmentMeta(
    body.fileName.trim(),
    body.mimeType.trim(),
    body.byteCount,
  );
  if (!attachmentValidation.ok) {
    throw createError.validation(attachmentValidation.message);
  }
  // Verify project ownership
  const [project] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1 and user_id = $2 and is_archived = false and deleted_at is null
      limit 1`,
    [projectId, userId],
  );

  if (!project) {
    throw createError.notFound('Project not found');
  }

  // Enforce the knowledge-file cap at ingest (before the expensive extraction).
  // Retrieval only ever reads the MAX_KNOWLEDGE_FILES most-recent files, so
  // accepting more would silently drop the oldest from every project turn's
  // context. Reject with a clear capacity error instead of a silent scope loss.
  // A missing table maps to the same pre-migration 503 as the insert below.
  let activeCount = 0;
  try {
    const [countRow] = await db.query<{ count: number }>(
      `select count(*)::int as count
         from project_knowledge_files
        where project_id = $1 and deleted_at is null`,
      [projectId],
    );
    activeCount = countRow?.count ?? 0;
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
    throw error;
  }
  if (activeCount >= MAX_KNOWLEDGE_FILES) {
    throw createError.conflict(
      `This project already has the maximum of ${MAX_KNOWLEDGE_FILES} knowledge files. Remove a file before adding another.`,
    );
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
        null,
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

  return NextResponse.json({ file: projectKnowledgeResponse(data, projectId) }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleListKnowledgeFiles));
export const POST = withCorsRoute(withErrorHandler(handleCreateKnowledgeFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
