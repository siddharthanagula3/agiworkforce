import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  deletePrivateObject,
  getBoundedPrivateObject,
  isPrivateObjectStorageConfigured,
  StoredObjectTooLargeError,
  copyPrivateObjectIfUnchanged,
  type BoundedStoredObject,
} from '@/lib/server/object-storage';
import { scanUploadBytes } from '@/lib/security/upload-scan';
import { matchDenylistedUpload, recordModerationEvent } from '@/lib/moderation';
import { logger } from '@/lib/logger';
import { getMediaAssetByStoragePathname, insertMediaAsset } from '@/lib/server/media-assets';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import {
  isChatImageMimeType,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_BYTES,
} from '@/lib/chat-attachment-policy';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { SYNCED_APP_SURFACES, type SyncedAppSurface } from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

const CompleteChatAttachmentSchema = z.object({
  storageKey: z.string().min(1).max(600),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
});

async function purgeRejectedUpload(userId: string, storageKey: string): Promise<void> {
  try {
    await deletePrivateObject(storageKey);
  } catch (deleteError) {
    logger.error(
      { err: deleteError, userId, storageKey },
      '[uploads] CRITICAL: could not delete a rejected upload from private storage',
    );
  }
}

async function handleComplete(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const declaredSurface = request.headers.get('x-agi-surface')?.trim().toLowerCase();
  const sourceSurface: SyncedAppSurface = (SYNCED_APP_SURFACES as readonly string[]).includes(
    declaredSurface ?? '',
  )
    ? (declaredSurface as SyncedAppSurface)
    : 'web';

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign');
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPrivateObjectStorageConfigured()) {
    throw createError.internal('Private object storage is not configured');
  }

  const organizationId = await resolveActiveOrganizationId(getNeonDb(), userId);

  const parsed = CompleteChatAttachmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const { storageKey, fileName, mimeType, byteCount } = parsed.data;
  const expectedPrefix = `chat-attachments/${userId}/`;
  if (
    !storageKey.startsWith(expectedPrefix) ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(storageKey) ||
    storageKey.includes('//') ||
    storageKey.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw createError.forbidden('Invalid upload destination');
  }
  if (!isSupportedChatAttachment(fileName, mimeType)) {
    throw createError.validation(
      'Chat supports images, PDFs, and text/code files. Convert Office files to PDF first.',
    );
  }

  const scannedKey = sealedChatAttachmentPathname(storageKey);
  const existing =
    (await getMediaAssetByStoragePathname(userId, scannedKey, organizationId)) ??
    (await getMediaAssetByStoragePathname(userId, storageKey, organizationId));
  if (existing) {
    return NextResponse.json({
      attachment: {
        id: existing.id,
        name: String(existing.metadata['filename'] ?? fileName),
        mimeType: existing.mimeType,
        byteCount: existing.byteSize ?? byteCount,
        type: isChatImageMimeType(existing.mimeType) ? 'image' : 'file',
        url: `/api/files/${existing.id}`,
      },
    });
  }

  let object: BoundedStoredObject | null;
  try {
    object = await getBoundedPrivateObject(storageKey, byteCount);
  } catch (error) {
    if (!(error instanceof StoredObjectTooLargeError)) throw error;
    logger.warn(
      { userId, storageKey, byteCount, storedBytes: error.contentLength },
      '[uploads] rejected an upload whose stored object exceeded its declared size',
    );
    await purgeRejectedUpload(userId, storageKey);
    throw createError.validation('Uploaded file size does not match the selected file.');
  }
  if (!object) throw createError.notFound('Uploaded file bytes were not found');
  if (object.data.byteLength !== byteCount) {
    throw createError.validation('Uploaded file size does not match the selected file.');
  }
  const storedContentType = object.contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (storedContentType && storedContentType !== mimeType.trim().toLowerCase()) {
    throw createError.validation('Uploaded file type does not match the selected file.');
  }

  const hashMatch = matchDenylistedUpload(object.data);
  if (hashMatch.matched) {
    await purgeRejectedUpload(userId, storageKey);
    recordModerationEvent({
      surface: 'upload',
      action: 'block',
      categories: ['known_illegal_media'],
      ruleIds: ['upload.hash-denylist'],
      userId,
      contentSha256: hashMatch.sha256,
      ...(hashMatch.listLabel ? { listLabel: hashMatch.listLabel } : {}),
      storageKey,
    });
    throw createError.validation(
      'This file could not be attached because its contents failed a safety check.',
    );
  }

  const scan = await scanUploadBytes(object.data, mimeType);
  if (!scan.ok) {
    logger.warn(
      { userId, storageKey, fileName, findings: scan.findings },
      '[uploads] rejected an attachment that failed content inspection',
    );
    await purgeRejectedUpload(userId, storageKey);
    throw createError.validation(
      'This file could not be attached because its contents failed a safety check.',
    );
  }

  // The presigned PUT for `storageKey` stays valid for minutes after this check, so the
  // scanned bytes are sealed under a key no presign covers before anything can serve them.
  const sealed = object.etag
    ? await copyPrivateObjectIfUnchanged({
        sourceKey: storageKey,
        destinationKey: scannedKey,
        etag: object.etag,
      })
    : false;
  if (!sealed) {
    logger.warn(
      { userId, storageKey, hadEtag: Boolean(object.etag) },
      '[uploads] rejected an attachment whose bytes changed after inspection',
    );
    await purgeRejectedUpload(userId, storageKey);
    throw createError.validation(
      'The uploaded file changed during its safety check. Upload it again.',
    );
  }
  await purgeRejectedUpload(userId, storageKey);

  const id = await insertMediaAsset({
    userId,
    organizationId,
    kind: isChatImageMimeType(mimeType) ? 'image' : 'file',
    mimeType,
    byteSize: object.data.byteLength,
    storageUrl: scannedKey,
    storagePathname: scannedKey,
    sourceSurface,
    metadata: {
      filename: fileName,
      origin: 'upload',
      surface: 'file',
      source: 'chat-attachment',
      previewable: isChatImageMimeType(mimeType) || mimeType === 'application/pdf',
    },
  });
  if (!id) {
    throw createError.internal('Chat attachment storage is not provisioned');
  }

  return NextResponse.json({
    attachment: {
      id,
      name: fileName,
      mimeType,
      byteCount: object.data.byteLength,
      type: isChatImageMimeType(mimeType) ? 'image' : 'file',
      url: `/api/files/${id}`,
    },
  });
}

export const POST = withCorsRoute(withErrorHandler(handleComplete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
