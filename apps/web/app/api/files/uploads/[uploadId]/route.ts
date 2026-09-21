import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { objectChecksum, type UploadedPart } from '@agiworkforce/object-storage';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { refuseUnsafeUpload } from '@/lib/security/upload-scan';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { upsertVideoMediaAsset } from '@/lib/server/media-assets';
import { authenticatedMediaUrl } from '@/lib/server/media-storage';
import {
  assertPartNumber,
  assertPartSize,
  isResumableMimeType,
  resumableUploadTarget,
  storedBytes,
  MAX_RESUMABLE_UPLOAD_BYTES,
  RESUMABLE_PART_SIZE_BYTES,
  type ResumableUploadTarget,
} from '../resumable-upload';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ uploadId: string }> };

const FIRST_PART = 1;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CompleteUploadSchema = z.object({
  assetId: z.string().regex(UUID_RE),
  mimeType: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
});

interface ResolvedSession {
  userId: string;
  organizationId: string | null;
  assetId: string;
  mimeType: 'video/mp4' | 'video/webm' | 'video/quicktime';
  uploadId: string;
}

async function resolveSession(
  request: NextRequest,
  context: RouteContext,
  input: { assetId: string | null; mimeType: string | null },
): Promise<ResolvedSession & { db: Awaited<ReturnType<typeof getUserScopedDb>>['db'] }> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { uploadId } = await context.params;

  if (!uploadId || uploadId.length > 512) throw createError.notFound('Upload not found');
  if (!input.assetId || !UUID_RE.test(input.assetId)) {
    throw createError.validation('An upload names the asset it is filling.');
  }
  if (!input.mimeType || !isResumableMimeType(input.mimeType)) {
    throw createError.validation('Resumable uploads carry video content.');
  }

  return {
    db,
    userId,
    organizationId,
    assetId: input.assetId,
    mimeType: input.mimeType,
    uploadId,
  };
}

function queryInput(request: NextRequest): { assetId: string | null; mimeType: string | null } {
  const params = new URL(request.url).searchParams;
  return { assetId: params.get('assetId'), mimeType: params.get('mimeType') };
}

/**
 * A session the host no longer holds is the ordinary end of an upload that was
 * cancelled, abandoned or swept away, not a fault. The pending listing is read
 * only after a call has already failed, so a healthy upload never pays for it
 * and a storage outage is still reported as one.
 */
async function sessionIsClosed(target: ResumableUploadTarget, uploadId: string): Promise<boolean> {
  const pending = await target.store
    .listPendingMultipartUploads(target.bucket, target.key)
    .catch(() => null);
  return pending !== null && !pending.some((upload) => upload.uploadId === uploadId);
}

function uploadNoLongerOpen(): never {
  throw createError
    .notFound('This upload is no longer open. Start it again to finish the file.')
    .asUserSafe();
}

async function onOpenSession<T>(
  target: ResumableUploadTarget,
  uploadId: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (await sessionIsClosed(target, uploadId)) uploadNoLongerOpen();
    throw error;
  }
}

async function handleListParts(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await resolveSession(request, context, queryInput(request));

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', session.userId);
  if (rateLimitResponse) return rateLimitResponse;

  const target = resumableUploadTarget(session.userId, session.assetId, session.mimeType);
  const parts = await onOpenSession(target, session.uploadId, () =>
    target.store.listUploadedParts({
      bucket: target.bucket,
      key: target.key,
      uploadId: session.uploadId,
    }),
  );

  return NextResponse.json({
    uploadId: session.uploadId,
    partSizeBytes: RESUMABLE_PART_SIZE_BYTES,
    parts,
    bytesStored: storedBytes(parts),
  });
}

async function handleUploadPart(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await resolveSession(request, context, queryInput(request));

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-resumable-part', session.userId);
  if (rateLimitResponse) return rateLimitResponse;

  const partNumber = assertPartNumber(
    Number(new URL(request.url).searchParams.get('partNumber') ?? Number.NaN),
  );
  const body = new Uint8Array(await request.arrayBuffer());
  assertPartSize(partNumber, body.byteLength);
  // Fails fast so a rejected object is not carried to 256 MB first. Only part
  // one leads the object; the assembled bytes are inspected at completion.
  await refuseUnsafeUpload(body, session.mimeType, { leadsObject: partNumber === FIRST_PART });

  const target = resumableUploadTarget(session.userId, session.assetId, session.mimeType);
  const part = await onOpenSession(target, session.uploadId, () =>
    target.store.uploadPart({
      bucket: target.bucket,
      key: target.key,
      uploadId: session.uploadId,
      partNumber,
      body,
      checksumSha256: objectChecksum(body),
    }),
  );

  return NextResponse.json({ part });
}

/**
 * The only place the whole object exists. A per-part scan cannot see a
 * signature or a secret that straddles a part boundary, so the assembled bytes
 * are read back once and the object is purged when they are refused.
 */
async function inspectAssembledObject(
  target: ReturnType<typeof resumableUploadTarget>,
  fileName: string,
  mimeType: string,
): Promise<void> {
  const object = await target.store.get(target.bucket, target.key);
  if (!object) throw createError.internal('The completed upload could not be read back.');
  try {
    await refuseUnsafeUpload(object.data, mimeType, { leadsObject: true, filename: fileName });
  } catch (error) {
    await target.store.delete(target.bucket, target.key);
    throw error;
  }
}

async function handleCompleteUpload(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const parsed = CompleteUploadSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const session = await resolveSession(request, context, {
    assetId: parsed.data.assetId,
    mimeType: parsed.data.mimeType,
  });

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', session.userId);
  if (rateLimitResponse) return rateLimitResponse;

  const target = resumableUploadTarget(session.userId, session.assetId, session.mimeType);
  const handle = { bucket: target.bucket, key: target.key, uploadId: session.uploadId };
  const parts: UploadedPart[] = await onOpenSession(target, session.uploadId, () =>
    target.store.listUploadedParts(handle),
  );
  if (parts.length === 0) {
    throw createError.validation('No part of this upload has been stored yet.');
  }
  const byteSize = storedBytes(parts);
  if (byteSize > MAX_RESUMABLE_UPLOAD_BYTES) {
    await target.store.abortMultipartUpload(handle);
    throw createError.validation('The upload is larger than the limit for a single file.');
  }

  await onOpenSession(target, session.uploadId, () =>
    target.store.completeMultipartUpload({ ...handle, parts }),
  );
  await inspectAssembledObject(target, parsed.data.fileName, session.mimeType);

  const id = await upsertVideoMediaAsset(
    {
      id: session.assetId,
      userId: session.userId,
      organizationId: session.organizationId,
      mimeType: session.mimeType,
      storageUrl: authenticatedMediaUrl(session.assetId),
      storagePathname: target.key,
      byteSize,
      prompt: '',
      provider: 'upload',
      model: '',
      sourceSurface: 'web',
      metadata: { filename: parsed.data.fileName },
    },
    session.db,
  );

  return NextResponse.json({ id, url: authenticatedMediaUrl(id), byteSize, parts: parts.length });
}

async function handleAbortUpload(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const session = await resolveSession(request, context, queryInput(request));

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', session.userId);
  if (rateLimitResponse) return rateLimitResponse;

  const target = resumableUploadTarget(session.userId, session.assetId, session.mimeType);
  try {
    await target.store.abortMultipartUpload({
      bucket: target.bucket,
      key: target.key,
      uploadId: session.uploadId,
    });
  } catch (error) {
    if (!(await sessionIsClosed(target, session.uploadId))) throw error;
  }

  return NextResponse.json({ aborted: true });
}

export const GET = withErrorHandler(handleListParts);
export const PUT = withErrorHandler(handleUploadPart);
export const POST = withErrorHandler(handleCompleteUpload);
export const DELETE = withErrorHandler(handleAbortUpload);
