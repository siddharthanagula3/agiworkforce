/**
 * Knowledge File · soft-delete endpoint.
 *
 * DELETE /api/projects/[id]/knowledge-files/[fileId]
 *
 * Sets deleted_at to current timestamp (soft-delete). File must belong
 * to the project, which must belong to the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { deleteObject, getObject, objectKeyFromStorageUri } from '@/lib/server/object-storage';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function ownedKnowledgeFile(
  request: NextRequest,
  context: RouteContext,
): Promise<{
  projectId: string;
  fileId: string;
  mimeType: string;
  fileName: string;
  storageUri: string;
}> {
  const { userId } = await getClerkAuthUser(request);
  const { id: projectId, fileId } = await context.params;
  const [file] = await getNeonDb().query<{
    mime_type: string | null;
    file_name: string;
    storage_uri: string | null;
  }>(
    `select f.mime_type, f.file_name, f.storage_uri
       from project_knowledge_files f
       join user_projects p on p.id = f.project_id
      where f.id = $1
        and f.project_id = $2
        and f.deleted_at is null
        and p.user_id = $3
        and p.deleted_at is null
      limit 1`,
    [fileId, projectId, userId],
  );
  if (!file?.storage_uri) throw createError.notFound('Knowledge file not found');
  return {
    projectId,
    fileId,
    mimeType: file.mime_type || 'application/octet-stream',
    fileName: file.file_name,
    storageUri: file.storage_uri,
  };
}

async function handleGetKnowledgeFile(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  const file = await ownedKnowledgeFile(request, context);
  const objectKey = objectKeyFromStorageUri(file.storageUri);
  if (!objectKey) throw createError.notFound('Knowledge file not found');
  const object = await getObject(objectKey);
  if (!object) throw createError.notFound('Knowledge file not found');
  const disposition =
    request.nextUrl.searchParams.get('download') === 'true'
      ? `attachment; filename="${file.fileName.replace(/["\r\n]/g, '_')}"`
      : 'inline';
  return new NextResponse(Uint8Array.from(object.data), {
    headers: {
      'Content-Type': object.contentType || file.mimeType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function handleDeleteKnowledgeFile(request: NextRequest, context: RouteContext) {
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const db = getNeonDb();
  const { id: projectId, fileId } = await context.params;
  let file: { storage_uri: string | null } | undefined;
  try {
    [file] = await db.query<{ storage_uri: string | null }>(
      `select f.storage_uri
         from project_knowledge_files f
         join user_projects p on p.id = f.project_id
        where f.id = $1
          and f.project_id = $2
          and f.deleted_at is null
          and p.user_id = $3
          and p.is_archived = false
          and p.deleted_at is null
        limit 1`,
      [fileId, projectId, userId],
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
    throw error;
  }
  if (!file) throw createError.notFound('Knowledge file not found');

  const objectKey = file.storage_uri ? objectKeyFromStorageUri(file.storage_uri) : null;
  try {
    await db.execute(
      `update project_knowledge_files
          set deleted_at = now()
        where id = $1 and project_id = $2 and deleted_at is null`,
      [fileId, projectId],
    );
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
    logger.error({ error, projectId, fileId }, 'Failed to delete knowledge file');
    throw createError.internal('Failed to delete knowledge file');
  }

  if (objectKey) {
    try {
      await deleteObject(objectKey);
    } catch (error) {
      logger.error({ error, projectId, fileId, objectKey }, 'Failed to delete knowledge object');
      try {
        await db.execute(
          `update project_knowledge_files
              set deleted_at = null
            where id = $1 and project_id = $2 and deleted_at is not null`,
          [fileId, projectId],
        );
      } catch (restoreError) {
        logger.error(
          { restoreError, projectId, fileId, objectKey },
          'Failed to restore knowledge metadata after object deletion failure',
        );
      }
      throw createError.internal('Could not remove the stored source');
    }
  }

  return NextResponse.json({ success: true });
}

export const DELETE = withCorsRoute(withErrorHandler(handleDeleteKnowledgeFile));
export const GET = withCorsRoute(withErrorHandler(handleGetKnowledgeFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
