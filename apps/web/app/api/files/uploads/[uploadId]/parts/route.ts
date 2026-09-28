import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudResumableUploadPartsRequestSchema,
  managedCloudResumableUploadSessionPath,
  type ManagedCloudResumableUploadSignedPart,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { uploadNeedsSameOriginRelay } from '@/lib/server/upload-transport';
import {
  RESUMABLE_PART_URL_TTL_SECONDS,
  assertSessionPartNumber,
  readResumableUploadSession,
  resumableUploadTarget,
  sessionPartLength,
} from '../../resumable-upload';

type RouteContext = { params: Promise<{ uploadId: string }> };

async function handleSignParts(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId, organizationId } = await getUserScopedDb(request);
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
  const relay = uploadNeedsSameOriginRelay(request);
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
