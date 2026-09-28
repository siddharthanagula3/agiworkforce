import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { FileTextPreview } from '@agiworkforce/cloud-contracts';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import { getProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import { findOwnedProjectKnowledgeFile } from '@/lib/server/project-knowledge-files';
import { fileTextPreviewKind, renderFileTextPreview } from '@/lib/server/file-text-preview';

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

async function handleGetKnowledgeFileText(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'files-serve');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: projectId, fileId } = await context.params;
  const file = await findOwnedProjectKnowledgeFile(
    db,
    { userId, organizationId },
    projectId,
    fileId,
  );
  if (!file) throw createError.notFound('Knowledge file not found');

  const kind = fileTextPreviewKind(file.fileName, file.mimeType);
  if (!kind) throw createError.notFound('This file has no text preview');
  const objectKey = objectKeyFromStorageUri(file.storageUri);
  if (!objectKey) throw createError.notFound('Knowledge file not found');
  const object = await getProjectKnowledgeObject(objectKey, MAX_ATTACHMENT_BYTES);
  if (!object) throw createError.notFound('Knowledge file not found');

  return NextResponse.json<FileTextPreview>(
    await renderFileTextPreview(kind, file.fileName, file.mimeType, object.data),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGetKnowledgeFileText));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
