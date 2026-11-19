import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudResumableUploadPartsRequestSchema,
  RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
  managedCloudResumableUploadSessionPath,
  type ManagedCloudResumableUploadSignedPart,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  storageReachableForLargeFiles,
  uploadNeedsSameOriginRelay,
} from '@/lib/server/upload-transport';
import { touchPartRequest } from '@/lib/server/chat-file-intake/store';
import {
  RESUMABLE_PART_URL_TTL_SECONDS,
  assertSessionPartNumber,
  isChatLargeFileSession,
  largeFileNeedsDirectUpload,
  readResumableUploadSession,
  resumableUploadTarget,
  sessionPartLength,
} from '../../resumable-upload';

type RouteContext = { params: Promise<{ uploadId: string }> };

async function handleSignParts(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { uploadId } = await context.params;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = ManagedCloudResumableUploadPartsRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const session = await readResumableUploadSession(parsed.data.session, {
    userId,
    organizationId,
    uploadId,
  });
  const partNumbers = [...new Set(parsed.data.partNumbers)].map((partNumber) =>
    assertSessionPartNumber(session, partNumber),
  );

  const target = resumableUploadTarget();
  const largeFile = isChatLargeFileSession(session);
  const relay = !largeFile && uploadNeedsSameOriginRelay(request);
  if (largeFile) {
    if (!storageReachableForLargeFiles(request)) throw largeFileNeedsDirectUpload();
    const open = await touchPartRequest(db, {
      userId,
      stagingKey: session.key,
      nowMs: Date.now(),
    });
    if (!open) {
      throw createError
        .notFound('This upload is no longer open. Start it again to finish the file.')
        .asUserSafe();
    }
  }
  const parts = await Promise.all(
    partNumbers.map(async (partNumber): Promise<ManagedCloudResumableUploadSignedPart> => {
      if (relay) {
        const url = new URL(
          managedCloudResumableUploadSessionPath(uploadId, parsed.data.session),
          new URL(request.url).origin,
        );
        url.searchParams.set('partNumber', String(partNumber));
        return {
          partNumber,
          url: url.toString(),
          method: 'PUT',
          headers: { 'x-csrf-token': request.headers.get('x-csrf-token') ?? '' },
          segmentBytes: RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
        };
      }
      return {
        partNumber,
        url: await target.store.presignUploadPart({
          bucket: target.bucket,
          key: session.key,
          uploadId: session.uploadId,
          partNumber,
          contentLength: sessionPartLength(session, partNumber),
          expiresInSeconds: RESUMABLE_PART_URL_TTL_SECONDS,
        }),
        method: 'PUT',
        headers: {},
      };
    }),
  );

  return NextResponse.json({ parts });
}

export const POST = withCorsRoute(withErrorHandler(handleSignParts));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
