import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
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
import {
  getMediaAssetByContentHash,
  getMediaAssetByStoragePathname,
  insertMediaAsset,
} from '@/lib/server/media-assets';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import {
  isChatImageMimeType,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_BYTES,
} from '@/lib/chat-attachment-policy';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { SYNCED_APP_SURFACES, type SyncedAppSurface } from '@agiworkforce/types';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  resolveProductAnalyticsSurface,
  trackProductAnalyticsEvent,
} from '@/lib/server/product-analytics';

const CompleteChatAttachmentSchema = z.object({
  storageKey: z.string().min(1).max(600),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
  conversationId: z.string().min(1).max(200).optional(),
  temporary: z.boolean().optional(),
});

/**
 * Temporary Chat's file policy (§18): an attachment that arrives in a temporary
 * chat is not a Library file and is purged with the chat.
 *
 * The conversation's own `is_temporary` decides it whenever the chat exists.
 * The client's flag is the fallback for the first upload into a chat that has
 * no row yet, and it is safe to trust in that direction only: it can shorten
 * what is kept, never extend it, so a client that lies about being temporary
 * costs its own user a Library entry and reaches nothing else.
 */
async function isTemporaryChatUpload(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
  input: { conversationId?: string | undefined; temporary?: boolean | undefined },
): Promise<boolean> {
  if (!input.conversationId) return input.temporary === true;
  try {
    const [row] = await db.query<{ is_temporary: boolean }>(
      `select is_temporary
         from web_conversations
        where id = $1 and user_id = $2 and deleted_at is null
        limit 1`,
      [input.conversationId, userId],
    );
    return row ? row.is_temporary : input.temporary === true;
  } catch (error) {
    logger.warn(
      { err: error, userId, conversationId: input.conversationId },
      '[uploads] temporary-chat lookup failed; honouring the declared flag',
    );
    return input.temporary === true;
  }
}

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
  const { db, userId, organizationId } = await getUserScopedDb(request);
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

  const parsed = CompleteChatAttachmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const { storageKey, fileName, mimeType, byteCount } = parsed.data;
  const temporaryChat = await isTemporaryChatUpload(db, userId, {
    conversationId: parsed.data.conversationId,
    temporary: parsed.data.temporary,
  });
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
      'Chat supports images, PDFs, Word, Excel, PowerPoint, and text or code files.',
    );
  }

  const scannedKey = sealedChatAttachmentPathname(storageKey);
  const existing =
    (await getMediaAssetByStoragePathname(userId, scannedKey, organizationId, db, temporaryChat)) ??
    (await getMediaAssetByStoragePathname(userId, storageKey, organizationId, db, temporaryChat));
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

  const duplicate = await getMediaAssetByContentHash(
    userId,
    hashMatch.sha256,
    organizationId,
    db,
    temporaryChat,
  );
  if (duplicate) {
    await purgeRejectedUpload(userId, storageKey);
    logger.info(
      { userId, byteCount: object.data.byteLength },
      '[uploads] reused an attachment already held for these bytes; the copy was not stored',
    );
    return NextResponse.json({
      attachment: {
        id: duplicate.id,
        name: String(duplicate.metadata['filename'] ?? fileName),
        mimeType: duplicate.mimeType,
        byteCount: duplicate.byteSize ?? object.data.byteLength,
        type: isChatImageMimeType(duplicate.mimeType) ? 'image' : 'file',
        url: `/api/files/${duplicate.id}`,
      },
    });
  }

  const scan = await scanUploadBytes(object.data, mimeType, fileName);
  if (!scan.ok) {
    trackProductAnalyticsEvent(
      { userId, organizationId },
      {
        name: 'file_processed',
        surface: resolveProductAnalyticsSurface(request),
        outcome: 'failed',
        properties: { errorCode: 'content_inspection' },
      },
    );
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

  const id = await insertMediaAsset(
    {
      userId,
      organizationId,
      kind: isChatImageMimeType(mimeType) ? 'image' : 'file',
      mimeType,
      byteSize: object.data.byteLength,
      storageUrl: scannedKey,
      storagePathname: scannedKey,
      contentSha256: hashMatch.sha256,
      sourceSurface,
      temporaryChat,
      metadata: {
        filename: fileName,
        origin: 'upload',
        surface: 'file',
        source: 'chat-attachment',
        previewable: isChatImageMimeType(mimeType) || mimeType === 'application/pdf',
      },
    },
    db,
  );
  if (!id) {
    throw createError.internal('Chat attachment storage is not provisioned');
  }

  const analyticsSurface = resolveProductAnalyticsSurface(request);
  trackProductAnalyticsEvent(
    { userId, organizationId },
    { name: 'file_uploaded', surface: analyticsSurface },
  );
  trackProductAnalyticsEvent(
    { userId, organizationId },
    { name: 'file_processed', surface: analyticsSurface, outcome: 'succeeded' },
  );

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
