import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudProjectKnowledgeFileSchema,
  ManagedCloudResumableUploadCompleteRequestSchema,
  RESUMABLE_UPLOAD_SESSION_PARAM,
  type ManagedCloudResumableUploadCompleteResponse,
} from '@agiworkforce/cloud-contracts';
import type { UploadedPart } from '@agiworkforce/object-storage';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveProductAnalyticsSurface } from '@/lib/server/product-analytics';
import {
  completeChatAttachmentUpload,
  findCompletedChatAttachment,
  resolveTemporaryChatUpload,
  resolveUploadSourceSurface,
} from '@/lib/server/chat-attachment-completion';
import {
  findProjectKnowledgeFileByChecksum,
  registerProjectKnowledgeFile,
} from '@/lib/server/project-knowledge-files';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import {
  assertSessionPartNumber,
  missingParts,
  readResumableUploadSession,
  resumableUploadTarget,
  sessionHandle,
  sessionPartCount,
  sessionPartLength,
  storedBytes,
  type ResumableUploadSession,
  type ResumableUploadTarget,
} from '../resumable-upload';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ uploadId: string }> };

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

async function sessionFor(
  request: NextRequest,
  context: RouteContext,
  token: string | null | undefined,
): Promise<{
  db: ScopedDb;
  userId: string;
  organizationId: string | null;
  session: ResumableUploadSession;
}> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { uploadId } = await context.params;
  if (!uploadId || uploadId.length > 1024) throw createError.notFound('Upload not found');
  const session = await readResumableUploadSession(token, { userId, organizationId, uploadId });
  return { db, userId, organizationId, session };
}

function sessionToken(request: NextRequest): string | null {
  return new URL(request.url).searchParams.get(RESUMABLE_UPLOAD_SESSION_PARAM);
}

async function sessionIsClosed(
  target: ResumableUploadTarget,
  session: ResumableUploadSession,
): Promise<boolean> {
  const pending = await target.store
    .listPendingMultipartUploads(target.bucket, session.key)
    .catch(() => null);
  return pending !== null && !pending.some((upload) => upload.uploadId === session.uploadId);
}

function uploadNoLongerOpen(): never {
  throw createError
    .notFound('This upload is no longer open. Start it again to finish the file.')
    .asUserSafe();
}

async function onOpenSession<T>(
  target: ResumableUploadTarget,
  session: ResumableUploadSession,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (await sessionIsClosed(target, session)) uploadNoLongerOpen();
    throw error;
  }
}

async function handleProgress(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId, session } = await sessionFor(request, context, sessionToken(request));

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const target = resumableUploadTarget();
  const parts = await onOpenSession(target, session, () =>
    target.store.listUploadedParts(sessionHandle(target, session)),
  );

  return NextResponse.json({
    uploadId: session.uploadId,
    partBytes: session.partBytes,
    parts: parts.map((part) => ({ partNumber: part.partNumber, size: part.size })),
    bytesStored: storedBytes(parts),
  });
}

async function handleRelayPart(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId, session } = await sessionFor(request, context, sessionToken(request));

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-resumable-part', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const partNumber = assertSessionPartNumber(
    session,
    Number(new URL(request.url).searchParams.get('partNumber') ?? Number.NaN),
  );
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength !== sessionPartLength(session, partNumber)) {
    throw createError.validation(
      `Part ${partNumber} must carry ${sessionPartLength(session, partNumber)} bytes.`,
    );
  }

  const target = resumableUploadTarget();
  const part = await onOpenSession(target, session, () =>
    target.store.uploadPart({ ...sessionHandle(target, session), partNumber, body }),
  );

  return NextResponse.json({ part: { partNumber: part.partNumber, size: part.size } });
}

async function assembleParts(
  target: ResumableUploadTarget,
  session: ResumableUploadSession,
): Promise<'assembled' | 'closed'> {
  const handle = sessionHandle(target, session);
  let parts: UploadedPart[];
  try {
    parts = await target.store.listUploadedParts(handle);
  } catch (error) {
    if (await sessionIsClosed(target, session)) return 'closed';
    throw error;
  }
  const missing = missingParts(session, parts);
  if (missing.length > 0) {
    throw createError.conflict(
      `Part ${missing[0]} of this upload has not arrived yet. Resume the upload to send it.`,
    );
  }
  const partCount = sessionPartCount(session);
  await onOpenSession(target, session, () =>
    target.store.completeMultipartUpload({
      ...handle,
      parts: parts.filter((part) => part.partNumber <= partCount),
    }),
  );
  return 'assembled';
}

function knowledgeFileCompletion(file: unknown): ManagedCloudResumableUploadCompleteResponse {
  const parsed = ManagedCloudProjectKnowledgeFileSchema.safeParse(file);
  if (!parsed.success) {
    throw createError.internal('The project source was stored but could not be described.');
  }
  return { kind: 'knowledge-file', file: parsed.data };
}

async function finishedUpload(
  db: ScopedDb,
  scope: { userId: string; organizationId: string | null },
  session: ResumableUploadSession,
  completion: { conversationId?: string | undefined; temporary?: boolean | undefined },
): Promise<ManagedCloudResumableUploadCompleteResponse | null> {
  if (session.kind === 'knowledge-file') {
    if (!session.projectId) return null;
    const file = await findProjectKnowledgeFileByChecksum(
      { db, ...scope, projectId: session.projectId },
      session.checksumSha256,
    );
    return file ? knowledgeFileCompletion(file) : null;
  }
  const temporaryChat = await resolveTemporaryChatUpload({
    db,
    ...scope,
    conversationId: completion.conversationId,
    temporary: completion.temporary,
  });
  const attachment = await findCompletedChatAttachment({
    db,
    ...scope,
    storageKey: session.key,
    fileName: session.fileName,
    byteCount: session.byteCount,
    temporaryChat,
  });
  return attachment ? { kind: 'chat-attachment', attachment } : null;
}

async function finishKnowledgeFile(
  db: ScopedDb,
  scope: { userId: string; organizationId: string | null },
  session: ResumableUploadSession,
): Promise<ManagedCloudResumableUploadCompleteResponse> {
  const projectId = session.projectId;
  if (!projectId || !session.sourceSurface) throw createError.notFound('Upload not found');
  const projectScope = { db, ...scope, projectId };
  try {
    const registration = await registerProjectKnowledgeFile(projectScope, {
      fileName: session.fileName,
      mimeType: session.mimeType,
      byteCount: session.byteCount,
      checksumSha256: session.checksumSha256,
      sourceSurface: session.sourceSurface,
      storageUri: session.key,
    });
    if (registration.status === 'unavailable') {
      throw createError.capabilityUnavailable('Project sources are not available yet.');
    }
    return knowledgeFileCompletion(registration.file);
  } catch (error) {
    if (isAppError(error) && error.statusCode < 500) {
      await deleteProjectKnowledgeObject(session.key).catch((deleteError: unknown) => {
        logger.error(
          { err: deleteError, userId: scope.userId, projectId, objectKey: session.key },
          '[uploads] an assembled project source that failed registration was not deleted',
        );
      });
    }
    throw error;
  }
}

async function handleComplete(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const parsed = ManagedCloudResumableUploadCompleteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  const { db, userId, organizationId, session } = await sessionFor(
    request,
    context,
    parsed.data.session,
  );

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const target = resumableUploadTarget();
  if ((await assembleParts(target, session)) === 'closed') {
    const finished = await finishedUpload(db, { userId, organizationId }, session, parsed.data);
    if (finished) return NextResponse.json(finished);
    if (!(await target.store.head(target.bucket, session.key))) uploadNoLongerOpen();
  }

  if (session.kind === 'knowledge-file') {
    return NextResponse.json(await finishKnowledgeFile(db, { userId, organizationId }, session));
  }

  const attachment = await completeChatAttachmentUpload({
    db,
    userId,
    organizationId,
    sourceSurface: resolveUploadSourceSurface(request),
    analyticsSurface: resolveProductAnalyticsSurface(request),
    storageKey: session.key,
    fileName: session.fileName,
    mimeType: session.mimeType,
    byteCount: session.byteCount,
    conversationId: parsed.data.conversationId,
    temporary: parsed.data.temporary,
    checksumSha256: session.checksumSha256,
  });
  const response: ManagedCloudResumableUploadCompleteResponse = {
    kind: 'chat-attachment',
    attachment,
  };
  return NextResponse.json(response);
}

async function handleAbort(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId, session } = await sessionFor(request, context, sessionToken(request));

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const target = resumableUploadTarget();
  try {
    await target.store.abortMultipartUpload(sessionHandle(target, session));
  } catch (error) {
    if (!(await sessionIsClosed(target, session))) throw error;
  }

  return NextResponse.json({ aborted: true });
}

export const GET = withCorsRoute(withErrorHandler(handleProgress));
export const PUT = withErrorHandler(handleRelayPart);
export const POST = withCorsRoute(withErrorHandler(handleComplete));
export const DELETE = withCorsRoute(withErrorHandler(handleAbort));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
