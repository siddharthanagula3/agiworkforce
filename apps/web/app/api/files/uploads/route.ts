import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudResumableUploadCreateRequestSchema,
  RESUMABLE_UPLOAD_PART_BYTES,
  resumableUploadPartCount,
} from '@agiworkforce/cloud-contracts';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isSupportedChatAttachment } from '@/lib/chat-attachment-policy';
import { uploadObjectKey } from '@/lib/server/upload-keys';
import { checkProjectKnowledgeCapacity } from '@/lib/server/project-knowledge-files';
import { issueResumableUploadSession, resumableUploadTarget } from './resumable-upload';

async function handleCreateUpload(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = ManagedCloudResumableUploadCreateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const body = parsed.data;

  const validation = validateAttachmentMeta(body.fileName, body.mimeType, body.byteCount);
  if (!validation.ok) throw createError.validation(validation.message);

  const projectId = body.kind === 'knowledge-file' ? body.projectId : null;
  if (body.kind === 'chat-attachment' && !isSupportedChatAttachment(body.fileName, body.mimeType)) {
    throw createError.validation(
      'Chat supports images, PDFs, Word, Excel, PowerPoint, and text or code files.',
    );
  }
  if (body.kind === 'knowledge-file') {
    const capacity = await checkProjectKnowledgeCapacity(
      { db, userId, organizationId, projectId: body.projectId },
      body,
    );
    if (capacity.status === 'unavailable') {
      throw createError.capabilityUnavailable('Project sources are not available yet.');
    }
  }

  const target = resumableUploadTarget();
  const key = uploadObjectKey(body.kind, { userId, projectId, fileName: body.fileName });
  const handle = await target.store.createMultipartUpload({
    bucket: target.bucket,
    key,
    contentType: body.mimeType,
  });
  const { token, expiresAt } = await issueResumableUploadSession({
    userId,
    organizationId,
    kind: body.kind,
    key,
    uploadId: handle.uploadId,
    fileName: body.fileName,
    mimeType: body.mimeType,
    byteCount: body.byteCount,
    partBytes: RESUMABLE_UPLOAD_PART_BYTES,
    checksumSha256: body.checksumSha256.toLowerCase(),
    projectId,
    sourceSurface: body.kind === 'knowledge-file' ? body.sourceSurface : null,
  });

  return NextResponse.json({
    uploadId: handle.uploadId,
    session: token,
    partBytes: RESUMABLE_UPLOAD_PART_BYTES,
    partCount: resumableUploadPartCount(body.byteCount, RESUMABLE_UPLOAD_PART_BYTES),
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

export const POST = withCorsRoute(withErrorHandler(handleCreateUpload));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
