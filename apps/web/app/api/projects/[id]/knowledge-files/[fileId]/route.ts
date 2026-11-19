import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { getProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import { retireProjectKnowledgeFile, ProjectContentHeldError } from '@/lib/server/project-deletion';
import { refuseHeldDeletion } from '@/lib/services/legal-hold-gate';
import { serializeDestructionWithHolds } from '@/lib/services/legal-hold-placement';
import { servedByteHeaders } from '@/lib/security/served-bytes';
import {
  findReadableProjectKnowledgeFile,
  type ReadableProjectKnowledgeFile,
} from '@/lib/server/project-knowledge-files';
import { MAX_PLAN_ATTACHMENT_BYTES } from '@agiworkforce/types';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function readableKnowledgeFile(
  request: NextRequest,
  context: RouteContext,
): Promise<ReadableProjectKnowledgeFile> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: projectId, fileId } = await context.params;
  const file = await findReadableProjectKnowledgeFile(
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
  const file = await readableKnowledgeFile(request, context);
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
  let removed: boolean;
  try {
    removed = await db.transaction(async (tx) => {
      await serializeDestructionWithHolds(tx, organizationId);
      return retireProjectKnowledgeFile(tx, { projectId, fileId, userId, organizationId });
    });
  } catch (error) {
    if (error instanceof ProjectContentHeldError) {
      return refuseHeldDeletion({
        resourceType: error.resourceType,
        resourceId: error.resourceId,
        userId,
        organizationId,
      });
    }
    logger.error({ error, projectId, fileId }, 'Failed to delete knowledge file');
    throw createError.internal('Failed to delete knowledge file');
  }
  if (!removed) throw createError.notFound('Knowledge file not found');

  return NextResponse.json({ success: true });
}

export const DELETE = withCorsRoute(withErrorHandler(handleDeleteKnowledgeFile));
export const GET = withCorsRoute(withErrorHandler(handleGetKnowledgeFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
