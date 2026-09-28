import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  SURFACE_REQUEST_HEADER,
  type ManagedCloudChatAttachment,
} from '@agiworkforce/cloud-contracts';
import {
  SYNCED_APP_SURFACES,
  type ProductAnalyticsSurface,
  type SyncedAppSurface,
} from '@agiworkforce/types';
import type { NextRequest } from 'next/server';
import { createError, isAppError } from '@/lib/errors';
import {
  copyPrivateObjectIfUnchanged,
  deletePrivateObject,
  getBoundedPrivateObject,
  StoredObjectTooLargeError,
  type BoundedStoredObject,
} from '@/lib/server/object-storage';
import {
  scanUploadBytes,
  uploadFindingRejects,
  uploadRefusalMessage,
} from '@/lib/security/upload-scan';
import {
  inspectOutboundContent,
  type OutboundFinding,
} from '@/lib/security/outbound-content-inspection';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { matchDenylistedUpload, recordModerationEvent } from '@/lib/moderation';
import { logger } from '@/lib/logger';
import {
  getMediaAssetByContentHash,
  getMediaAssetByStoragePathname,
  insertMediaAsset,
  type MediaAssetForServing,
} from '@/lib/server/media-assets';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { assertFileStorageAvailable } from '@/lib/server/file-storage';
import { isChatImageMimeType, isSupportedChatAttachment } from '@/lib/chat-attachment-policy';
import { trackProductAnalyticsEvent } from '@/lib/server/product-analytics';

const UPLOAD_INSPECTION_BYTES = 256_000;

const UNSUPPORTED_CHAT_ATTACHMENT_MESSAGE =
  'Chat supports images, PDFs, Word, Excel, PowerPoint, and text or code files.';
const SAFETY_CHECK_REFUSAL_MESSAGE =
  'This file could not be attached because its contents failed a safety check.';

export interface ChatAttachmentCompletionInput {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  sourceSurface: SyncedAppSurface;
  analyticsSurface: ProductAnalyticsSurface;
  storageKey: string;
  fileName: string;
  mimeType: string;
  byteCount: number;
  conversationId?: string | undefined;
  temporary?: boolean | undefined;
  checksumSha256?: string | undefined;
}

export function resolveUploadSourceSurface(request: NextRequest): SyncedAppSurface {
  const declared = request.headers.get(SURFACE_REQUEST_HEADER)?.trim().toLowerCase() ?? '';
  return (SYNCED_APP_SURFACES as readonly string[]).includes(declared)
    ? (declared as SyncedAppSurface)
    : 'web';
}

async function isTemporaryChatUpload(
  db: Pick<DatabaseAdapter, 'query'>,
  scope: { userId: string; organizationId: string | null },
  input: { conversationId?: string | undefined; temporary?: boolean | undefined },
): Promise<boolean> {
  const { userId, organizationId } = scope;
  if (!input.conversationId) return input.temporary === true;
  try {
    const [row] = await db.query<{ is_temporary: boolean }>(
      `select is_temporary
         from web_conversations
        where id = $1
          and user_id = $2
          and organization_id is not distinct from $3
          and deleted_at is null
        limit 1`,
      [input.conversationId, userId, organizationId],
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

function reportedUploadFindings(
  findings: Awaited<ReturnType<typeof scanUploadBytes>>['findings'],
): OutboundFinding[] {
  const counts = new Map<string, OutboundFinding>();
  for (const finding of findings) {
    if (uploadFindingRejects(finding)) continue;
    const existing = counts.get(finding.code);
    if (existing) existing.count += 1;
    else
      counts.set(finding.code, {
        scanner: 'upload_scan',
        name: finding.code,
        severity: 'medium',
        count: 1,
      });
  }
  return [...counts.values()];
}

export async function purgeChatAttachmentUpload(userId: string, storageKey: string): Promise<void> {
  try {
    await deletePrivateObject(storageKey);
  } catch (deleteError) {
    logger.error(
      { err: deleteError, userId, storageKey },
      '[uploads] CRITICAL: could not delete a rejected upload from private storage',
    );
  }
}

export function isOwnedChatAttachmentUploadKey(storageKey: string, userId: string): boolean {
  const expectedPrefix = `chat-attachments/${userId}/`;
  return (
    storageKey.startsWith(expectedPrefix) &&
    storageKey.length > expectedPrefix.length &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(storageKey) &&
    !storageKey.includes('//') &&
    !storageKey.split('/').some((segment) => segment === '.' || segment === '..')
  );
}

function attachmentFrom(
  asset: Pick<MediaAssetForServing, 'id' | 'mimeType' | 'byteSize' | 'metadata'>,
  fallbackName: string,
  fallbackBytes: number,
): ManagedCloudChatAttachment {
  return {
    id: asset.id,
    name: String(asset.metadata['filename'] ?? fallbackName),
    mimeType: asset.mimeType,
    byteCount: asset.byteSize ?? fallbackBytes,
    type: isChatImageMimeType(asset.mimeType) ? 'image' : 'file',
    url: `/api/files/${asset.id}`,
  };
}

export async function findCompletedChatAttachment(
  input: Pick<
    ChatAttachmentCompletionInput,
    'db' | 'userId' | 'organizationId' | 'storageKey' | 'fileName' | 'byteCount'
  > & { temporaryChat: boolean },
): Promise<ManagedCloudChatAttachment | null> {
  const { db, userId, organizationId, storageKey, temporaryChat } = input;
  const existing =
    (await getMediaAssetByStoragePathname(
      userId,
      sealedChatAttachmentPathname(storageKey),
      organizationId,
      db,
      temporaryChat,
    )) ??
    (await getMediaAssetByStoragePathname(userId, storageKey, organizationId, db, temporaryChat));
  return existing ? attachmentFrom(existing, input.fileName, input.byteCount) : null;
}

export async function resolveTemporaryChatUpload(
  input: Pick<
    ChatAttachmentCompletionInput,
    'db' | 'userId' | 'organizationId' | 'conversationId' | 'temporary'
  >,
): Promise<boolean> {
  return isTemporaryChatUpload(input.db, input, {
    conversationId: input.conversationId,
    temporary: input.temporary,
  });
}

export async function completeChatAttachmentUpload(
  input: ChatAttachmentCompletionInput,
): Promise<ManagedCloudChatAttachment> {
  const { db, userId, organizationId, storageKey, fileName, mimeType, byteCount } = input;
  const temporaryChat = await resolveTemporaryChatUpload(input);
  if (!isOwnedChatAttachmentUploadKey(storageKey, userId)) {
    throw createError.forbidden('Invalid upload destination');
  }
  if (!isSupportedChatAttachment(fileName, mimeType)) {
    throw createError.validation(UNSUPPORTED_CHAT_ATTACHMENT_MESSAGE);
  }

  const completed = await findCompletedChatAttachment({ ...input, temporaryChat });
  if (completed) return completed;

  const scannedKey = sealedChatAttachmentPathname(storageKey);
  let object: BoundedStoredObject | null;
  try {
    object = await getBoundedPrivateObject(storageKey, byteCount);
  } catch (error) {
    if (!(error instanceof StoredObjectTooLargeError)) throw error;
    logger.warn(
      { userId, storageKey, byteCount, storedBytes: error.contentLength },
      '[uploads] rejected an upload whose stored object exceeded its declared size',
    );
    await purgeChatAttachmentUpload(userId, storageKey);
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
    await purgeChatAttachmentUpload(userId, storageKey);
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
    throw createError.validation(SAFETY_CHECK_REFUSAL_MESSAGE);
  }
  if (input.checksumSha256 && hashMatch.sha256 !== input.checksumSha256.toLowerCase()) {
    await purgeChatAttachmentUpload(userId, storageKey);
    throw createError.validation(
      'The uploaded bytes do not match the file you selected. Upload it again.',
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
    await purgeChatAttachmentUpload(userId, storageKey);
    logger.info(
      { userId, byteCount: object.data.byteLength },
      '[uploads] reused an attachment already held for these bytes; the copy was not stored',
    );
    return attachmentFrom(duplicate, fileName, object.data.byteLength);
  }

  if (!temporaryChat) {
    try {
      await assertFileStorageAvailable({ db, userId, organizationId }, object.data.byteLength);
    } catch (error) {
      if (isAppError(error) && error.statusCode < 500) {
        await purgeChatAttachmentUpload(userId, storageKey);
      }
      throw error;
    }
  }

  const scan = await scanUploadBytes(object.data, mimeType, {
    leadsObject: true,
    filename: fileName,
  });
  if (!scan.ok) {
    trackProductAnalyticsEvent(
      { userId, organizationId },
      {
        name: 'file_processed',
        surface: input.analyticsSurface,
        outcome: 'failed',
        properties: { errorCode: 'content_inspection' },
      },
    );
    logger.warn(
      { userId, storageKey, fileName, findings: scan.findings },
      '[uploads] rejected an attachment that failed content inspection',
    );
    await purgeChatAttachmentUpload(userId, storageKey);
    throw createError.validation(uploadRefusalMessage(scan.findings, SAFETY_CHECK_REFUSAL_MESSAGE));
  }

  const dlp = await inspectOutboundContent({
    channel: 'upload',
    value: {
      fileName,
      mimeType,
      content: object.data.subarray(0, UPLOAD_INSPECTION_BYTES),
    },
    userId,
    organizationId,
    resourceId: scannedKey,
    priorFindings: reportedUploadFindings(scan.findings),
    resolveMode: async () => {
      const policy = await resolveSecretHandlingPolicy(db, userId);
      return policy.mode === 'redact' ? { ...policy, mode: 'block' } : policy;
    },
  });
  if (dlp.action === 'blocked') {
    logger.warn(
      { userId, storageKey, fileName },
      '[uploads] rejected an attachment that the workspace data policy blocks',
    );
    await purgeChatAttachmentUpload(userId, storageKey);
    throw createError.validation(dlp.message);
  }

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
    await purgeChatAttachmentUpload(userId, storageKey);
    throw createError.validation(
      'The uploaded file changed during its safety check. Upload it again.',
    );
  }
  await purgeChatAttachmentUpload(userId, storageKey);

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
      sourceSurface: input.sourceSurface,
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

  trackProductAnalyticsEvent(
    { userId, organizationId },
    { name: 'file_uploaded', surface: input.analyticsSurface },
  );
  trackProductAnalyticsEvent(
    { userId, organizationId },
    { name: 'file_processed', surface: input.analyticsSurface, outcome: 'succeeded' },
  );

  return {
    id,
    name: fileName,
    mimeType,
    byteCount: object.data.byteLength,
    type: isChatImageMimeType(mimeType) ? 'image' : 'file',
    url: `/api/files/${id}`,
  };
}
