import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import {
  assertUploadMatchesAuthorization,
  verifyProjectKnowledgeUploadAuthorization,
} from '@/lib/server/project-knowledge-object-storage';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';

const KNOWLEDGE_FILE_SIZE_LIMIT_MESSAGE = 'Project sources are limited to 25 MiB.';

/**
 * The destination comes from the authorization this route verifies, never from
 * the request. A caller-supplied key let an object that had already passed
 * content inspection be overwritten with anything, so the registered row
 * described bytes the platform no longer held.
 */
async function handlePut(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPrivateObjectStorageConfigured()) {
    throw createError.internal('Object storage is not configured');
  }

  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    throw createError.forbidden('This upload is not authorized');
  }

  const contentLengthHeader = request.headers.get('content-length');
  const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  if (declaredLength !== undefined && declaredLength > MAX_ATTACHMENT_BYTES) {
    throw createError.validation(KNOWLEDGE_FILE_SIZE_LIMIT_MESSAGE);
  }

  const contentType = request.headers.get('content-type')?.trim() || 'application/octet-stream';
  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength === 0) {
    throw createError.validation('The uploaded file was empty.');
  }
  if (body.byteLength > MAX_ATTACHMENT_BYTES) {
    throw createError.validation(KNOWLEDGE_FILE_SIZE_LIMIT_MESSAGE);
  }

  let key: string;
  try {
    const claims = await verifyProjectKnowledgeUploadAuthorization(token, userId);
    assertUploadMatchesAuthorization(claims, { contentType, data: body });
    key = claims.key;
  } catch (error) {
    throw createError.forbidden(
      error instanceof Error ? error.message : 'This upload is not authorized',
    );
  }

  await putPrivateObject({
    key,
    data: body,
    contentType,
    contentLength: body.byteLength,
  });

  return NextResponse.json({ success: true });
}

export const PUT = withErrorHandler(handlePut);
