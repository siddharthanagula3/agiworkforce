import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CHAT_LARGE_FILE_MAX_BYTES,
  CHAT_LARGE_FILE_UPLOAD_KIND,
  ManagedCloudChatLargeFileCreateRequestSchema,
  ManagedCloudResumableUploadCreateRequestSchema,
  RESUMABLE_UPLOAD_PART_BYTES,
  chatLargeFilePartBytes,
  resumableUploadPartCount,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { MultipartUploadHandle } from '@agiworkforce/object-storage';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isSupportedChatAttachment } from '@/lib/chat-attachment-policy';
import { uploadObjectKey } from '@/lib/server/upload-keys';
import { checkProjectKnowledgeCapacity } from '@/lib/server/project-knowledge-files';
import {
  CHAT_ATTACHMENT_UNSUPPORTED_MESSAGE,
  admitAttachmentUpload,
  admitChatLargeFileUpload,
  confirmChatLargeFileAdmission,
} from '@/lib/server/attachment-allowance';
import { resolveTemporaryChatUpload } from '@/lib/server/chat-attachment-completion';
import { refundDailyLargeFileBytes } from '@/lib/server/chat-file-intake/quotas';
import { cancelIntakeByStagingKey, insertIntake } from '@/lib/server/chat-file-intake/store';
import { issueResumableUploadSession, resumableUploadTarget } from './resumable-upload';

interface UploadScope {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
}

function sessionResponse(
  opened: { uploadId: string; token: string; expiresAt: number },
  byteCount: number,
  partBytes: number,
): NextResponse {
  return NextResponse.json({
    uploadId: opened.uploadId,
    session: opened.token,
    partBytes,
    partCount: resumableUploadPartCount(byteCount, partBytes),
    expiresAt: new Date(opened.expiresAt).toISOString(),
  });
}

function isChatLargeFileCreate(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { kind?: unknown }).kind === CHAT_LARGE_FILE_UPLOAD_KIND
  );
}

/**
 * A chat file over the inline limit. Admission charges the day's large file
 * bytes, so every step after it that fails gives them back: until the intake
 * row is committed directly, after it through the row's cancel. The row is
 * written and the slot and storage are judged in one transaction under the
 * person's create lock, so of creates that overlap the ones that fit are kept
 * and a refused create leaves no row. A multipart upload the client will not
 * receive is aborted, never left without a pointer.
 */
async function createChatLargeFileUpload(
  request: NextRequest,
  scope: UploadScope,
  rawBody: unknown,
): Promise<NextResponse> {
  const parsed = ManagedCloudChatLargeFileCreateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const body = parsed.data;
  const validation = validateAttachmentMeta(
    body.fileName,
    body.mimeType,
    body.byteCount,
    CHAT_LARGE_FILE_MAX_BYTES,
  );
  if (!validation.ok) throw createError.validation(validation.message);
  if (!isSupportedChatAttachment(body.fileName, body.mimeType)) {
    throw createError.validation(CHAT_ATTACHMENT_UNSUPPORTED_MESSAGE);
  }

  const { db, userId, organizationId } = scope;
  const target = resumableUploadTarget();
  const conversation = await resolveTemporaryChatUpload({
    db,
    userId,
    organizationId,
    conversationId: body.conversationId,
    temporary: body.temporary,
  });
  const temporaryChat = conversation.temporary;
  const admitted = await admitChatLargeFileUpload({
    db,
    userId,
    organizationId,
    request,
    fileName: body.fileName,
    mimeType: body.mimeType,
    byteCount: body.byteCount,
    temporaryChat,
  });
  const refund = () =>
    refundDailyLargeFileBytes({
      userId,
      bytes: admitted.dailyBytesCharged,
      chargedAtMs: admitted.chargedAtMs,
    });

  const key = uploadObjectKey('chat-attachment', { userId, fileName: body.fileName });
  const partBytes = chatLargeFilePartBytes(body.byteCount);
  let handle: MultipartUploadHandle;
  try {
    handle = await target.store.createMultipartUpload({
      bucket: target.bucket,
      key,
      contentType: body.mimeType,
    });
  } catch (error) {
    await refund();
    throw error;
  }

  const abortUpload = () =>
    target.store.abortMultipartUpload(handle).catch((abortError: unknown) => {
      logger.warn(
        { error: abortError, objectKey: key },
        '[chat-files] a large upload the client will not receive could not be aborted',
      );
    });

  let intakeId: string;
  try {
    intakeId = await db.transaction(async (tx) => {
      await tx.execute(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `agi:chat-file-intake:${userId}`,
      ]);
      const intake = await insertIntake(tx, {
        userId,
        organizationId,
        conversationId: conversation.conversationId,
        temporaryChat,
        fileName: body.fileName,
        mimeType: body.mimeType,
        byteCount: body.byteCount,
        declaredSha256: body.checksumSha256,
        stagingKey: key,
        multipartUploadId: handle.uploadId,
        partBytes,
        dailyBytesCharged: admitted.dailyBytesCharged,
        nowMs: admitted.chargedAtMs,
      });
      await confirmChatLargeFileAdmission({
        db: tx,
        userId,
        organizationId,
        temporaryChat,
        admitted,
      });
      return intake.id;
    });
  } catch (error) {
    await abortUpload();
    await refund();
    throw error;
  }

  let token: string;
  let expiresAt: number;
  try {
    ({ token, expiresAt } = await issueResumableUploadSession({
      userId,
      organizationId,
      kind: CHAT_LARGE_FILE_UPLOAD_KIND,
      key,
      uploadId: handle.uploadId,
      fileName: body.fileName,
      mimeType: body.mimeType,
      byteCount: body.byteCount,
      partBytes,
      checksumSha256: body.checksumSha256.toLowerCase(),
      projectId: null,
      sourceSurface: null,
      intakeId,
    }));
  } catch (error) {
    await abortUpload();
    await cancelIntakeByStagingKey(db, {
      userId,
      stagingKey: key,
      storedBytes: 0,
      nowMs: Date.now(),
    }).catch((cancelError: unknown) => {
      logger.warn(
        { error: cancelError, intakeId },
        '[chat-files] an intake the client never received could not be cancelled; the idle rule ends it',
      );
    });
    throw error;
  }
  return sessionResponse(
    { uploadId: handle.uploadId, token, expiresAt },
    body.byteCount,
    partBytes,
  );
}

async function handleCreateUpload(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const rawBody: unknown = await request.json().catch(() => null);
  if (isChatLargeFileCreate(rawBody)) {
    return createChatLargeFileUpload(request, { db, userId, organizationId }, rawBody);
  }

  const parsed = ManagedCloudResumableUploadCreateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const body = parsed.data;

  const validation = validateAttachmentMeta(body.fileName, body.mimeType, body.byteCount);
  if (!validation.ok) throw createError.validation(validation.message);

  const projectId = body.kind === 'knowledge-file' ? body.projectId : null;
  if (body.kind === 'chat-attachment' && !isSupportedChatAttachment(body.fileName, body.mimeType)) {
    throw createError.validation(CHAT_ATTACHMENT_UNSUPPORTED_MESSAGE);
  }
  if (body.kind === 'knowledge-file') {
    await checkProjectKnowledgeCapacity(
      { db, userId, organizationId, projectId: body.projectId },
      body,
    );
  }

  await admitAttachmentUpload({
    db,
    userId,
    organizationId,
    kind: body.kind,
    byteCount: body.byteCount,
    mimeType: body.mimeType,
  });

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

  return sessionResponse(
    { uploadId: handle.uploadId, token, expiresAt },
    body.byteCount,
    RESUMABLE_UPLOAD_PART_BYTES,
  );
}

export const POST = withCorsRoute(withErrorHandler(handleCreateUpload));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
