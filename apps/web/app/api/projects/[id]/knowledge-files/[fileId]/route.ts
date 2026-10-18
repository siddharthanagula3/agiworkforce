import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import {
  deleteProjectKnowledgeObject,
  getProjectKnowledgeObject,
} from '@/lib/server/project-knowledge-object-storage';
import { servedByteHeaders } from '@/lib/security/served-bytes';
import {
  findOwnedProjectKnowledgeFile,
  type OwnedProjectKnowledgeFile,
} from '@/lib/server/project-knowledge-files';
import { MAX_PLAN_ATTACHMENT_BYTES } from '@agiworkforce/types';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function ownedKnowledgeFile(
  request: NextRequest,
  context: RouteContext,
): Promise<OwnedProjectKnowledgeFile> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: projectId, fileId } = await context.params;
  const file = await findOwnedProjectKnowledgeFile(
    db,
    { userId, organizationId },
    projectId,
    fileId,
  );
  if (!file) throw createError.notFound('Knowledge file not found');
  return file;
}

async function handleGetKnowledgeFile(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  const file = await ownedKnowledgeFile(request, context);
  const objectKey = objectKeyFromStorageUri(file.storageUri);
  if (!objectKey) throw createError.notFound('Knowledge file not found');
  const object = await getProjectKnowledgeObject(objectKey, MAX_PLAN_ATTACHMENT_BYTES);
  if (!object) throw createError.notFound('Knowledge file not found');
  const wantsDownload = request.nextUrl.searchParams.get('download') === 'true';
  const served = servedByteHeaders({
    contentType: object.contentType || file.mimeType,
    ...(wantsDownload ? { filename: file.fileName.replace(/["\r\n]/g, '_') } : {}),
    forceAttachment: wantsDownload,
  });
  return new NextResponse(Uint8Array.from(object.data), {
    headers: {
      'Content-Type': served.contentType,
      'Content-Disposition': served.contentDisposition,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function handleDeleteKnowledgeFile(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: projectId, fileId } = await context.params;
  const [file] = await db.query<{ storage_uri: string | null }>(
    `select f.storage_uri
       from project_knowledge_files f
       join user_projects p on p.id = f.project_id
      where f.id = $1
        and f.project_id = $2
        and f.deleted_at is null
        and p.user_id = $3
        and p.organization_id is not distinct from $4::uuid
        and p.is_archived = false
        and p.deleted_at is null
      limit 1`,
    [fileId, projectId, userId, organizationId],
  );
  if (!file) throw createError.notFound('Knowledge file not found');

  const objectKey = file.storage_uri ? objectKeyFromStorageUri(file.storage_uri) : null;
  let objectStillReferenced = false;
  try {
    await db.execute(
      `update project_knowledge_files
          set deleted_at = now()
        where id = $1 and project_id = $2 and deleted_at is null`,
      [fileId, projectId],
    );
    // A duplicated project copies storage_uri rather than the object, so the
    // object stays while any live row still points at it.
    if (objectKey) {
      const [sharer] = await db.query<{ id: string }>(
        `select id from project_knowledge_files
          where storage_uri = $1 and deleted_at is null
          limit 1`,
        [file.storage_uri],
      );
      objectStillReferenced = sharer !== undefined;
    }
  } catch (error) {
    logger.error({ error, projectId, fileId }, 'Failed to delete knowledge file');
    throw createError.internal('Failed to delete knowledge file');
  }

  if (objectKey && !objectStillReferenced) {
    try {
      await deleteProjectKnowledgeObject(objectKey);
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
