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
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import {
  deleteProjectKnowledgeObject,
  getProjectKnowledgeObject,
} from '@/lib/server/project-knowledge-object-storage';
import { servedByteHeaders } from '@/lib/security/served-bytes';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

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
  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);
  const [file] = await db.query<{
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
        and p.organization_id is not distinct from $4::uuid
        and p.deleted_at is null
      limit 1`,
    [fileId, projectId, userId, organizationId],
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
  const object = await getProjectKnowledgeObject(objectKey);
  if (!object) throw createError.notFound('Knowledge file not found');
  // `.html`, `.xml` and `.svg` are all accepted knowledge-file types, and this
  // response is served from the app's own origin — echoing the stored type
  // with `inline` made an uploaded document execute as script against the
  // uploader's session on a top-level navigation. `servedByteHeaders` demotes
  // markup to an opaque download. It also covers rows registered BEFORE ingest
  // scanning existed, which cannot be rescanned.
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
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const db = getNeonDb();
  const { id: projectId, fileId } = await context.params;
  const organizationId = await resolveActiveOrganizationId(db, userId);
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
          and p.organization_id is not distinct from $4::uuid
          and p.is_archived = false
          and p.deleted_at is null
        limit 1`,
      [fileId, projectId, userId, organizationId],
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
