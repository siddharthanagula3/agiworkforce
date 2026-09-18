import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  isResumableMimeType,
  resumableUploadTarget,
  MAX_RESUMABLE_PARTS,
  MAX_RESUMABLE_UPLOAD_BYTES,
  RESUMABLE_PART_SIZE_BYTES,
} from './resumable-upload';

const CreateUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive().max(MAX_RESUMABLE_UPLOAD_BYTES),
});

async function handleCreateUpload(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = CreateUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }

  const { mimeType } = parsed.data;
  if (!isResumableMimeType(mimeType)) {
    throw createError.validation('Resumable uploads carry video content.');
  }

  const assetId = randomUUID();
  const target = resumableUploadTarget(userId, assetId, mimeType);
  const handle = await target.store.createMultipartUpload({
    bucket: target.bucket,
    key: target.key,
    contentType: mimeType,
  });

  return NextResponse.json({
    assetId,
    uploadId: handle.uploadId,
    partSizeBytes: RESUMABLE_PART_SIZE_BYTES,
    maxParts: MAX_RESUMABLE_PARTS,
    maxBytes: MAX_RESUMABLE_UPLOAD_BYTES,
  });
}

export const POST = withErrorHandler(handleCreateUpload);
