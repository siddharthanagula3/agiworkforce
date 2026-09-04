import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isPrivateObjectStorageConfigured, putPrivateObject } from '@/lib/server/object-storage';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';

const KNOWLEDGE_FILE_SIZE_LIMIT_MESSAGE = 'Project sources are limited to 25 MiB.';
const KNOWLEDGE_KEY_PATTERN = /^knowledge-files\/projects\/([A-Za-z0-9-]+)\/[A-Za-z0-9._-]+$/;

function projectIdFromKnowledgeKey(key: string): string | null {
  const match = KNOWLEDGE_KEY_PATTERN.exec(key);
  if (!match || key.includes('//') || key.split('/').some((s) => s === '.' || s === '..')) {
    return null;
  }
  return match[1] ?? null;
}

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPrivateObjectStorageConfigured()) {
    throw createError.internal('Object storage is not configured');
  }

  const key = request.nextUrl.searchParams.get('key') ?? '';
  const projectId = projectIdFromKnowledgeKey(key);
  if (!projectId) {
    throw createError.forbidden('Invalid upload destination');
  }

  const [project] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and is_archived = false
        and deleted_at is null
      limit 1`,
    [projectId, userId, organizationId],
  );
  if (!project) {
    throw createError.notFound('Project not found');
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

  await putPrivateObject({
    key,
    data: body,
    contentType,
    contentLength: body.byteLength,
  });

  return NextResponse.json({ success: true });
}

export const PUT = withErrorHandler(handlePut);
