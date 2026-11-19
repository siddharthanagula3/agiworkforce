import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudChatLargeFileCompleteResponseSchema,
  ManagedCloudProjectKnowledgeFileSchema,
  ManagedCloudResumableUploadCompleteRequestSchema,
  RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
  RESUMABLE_UPLOAD_SEGMENT_OFFSET_PARAM,
  RESUMABLE_UPLOAD_SESSION_PARAM,
  isChatFileIntakeCancellable,
  isChatFileIntakeTerminal,
  type ChatFileIntakeState,
  type ManagedCloudResumableUploadAbortResponse,
  type ManagedCloudResumableUploadCompleteResponse,
} from '@agiworkforce/cloud-contracts';
import type { UploadedPart } from '@agiworkforce/object-storage';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { logger } from '@/lib/logger';
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
import {
  cancelIntakeByStagingKey,
  markUploaded,
  readIntakeStatus,
} from '@/lib/server/chat-file-intake/store';
import {
  cancelChatFileIntake,
  defaultIntakeTransitionDeps,
} from '@/lib/server/chat-file-intake/transitions';
import { startChatFileIntakeWorkflow } from '@/lib/workflows/start-chat-file-intake-workflow';
import {
  assertSessionPartNumber,
  chatFileIntakeForClient,
  isChatLargeFileSession,
  largeFileNeedsDirectUpload,
  missingParts,
  readResumableUploadSession,
  relaySegmentOffsetsBefore,
  waitingRelaySegmentKeys,
  resumableUploadTarget,
  sessionHandle,
  sessionPartCount,
  sessionPartLength,
  storedBytes,
  type ResumableUploadSession,
  type ResumableUploadTarget,
} from '../resumable-upload';
import { relaySegmentKey } from '../relay-segments';

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

function segmentOffset(request: NextRequest, partLength: number): number {
  const raw = new URL(request.url).searchParams.get(RESUMABLE_UPLOAD_SEGMENT_OFFSET_PARAM);
  if (raw === null) return 0;
  const offset = Number(raw);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset >= partLength ||
    offset % RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES !== 0
  ) {
    throw createError.validation(
      'That segment does not start where a segment of this part starts.',
    );
  }
  return offset;
}

async function discardRelaySegments(
  target: ResumableUploadTarget,
  keys: readonly string[],
): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      target.store.delete(target.bucket, key).catch((error: unknown) => {
        logger.warn({ objectKey: key, error }, 'A relayed upload segment was not removed');
      }),
    ),
  );
}

/**
 * Storage refuses a part smaller than the multipart minimum unless it is the
 * last, and the web host refuses a request body over its platform limit, so a
 * part relayed through this route arrives in segments. Each segment but the
 * last waits in storage; the last one joins them and stores the whole part.
 */
async function joinRelayedPart(
  target: ResumableUploadTarget,
  session: ResumableUploadSession,
  partNumber: number,
  offset: number,
  last: Uint8Array,
): Promise<Uint8Array> {
  const earlier = relaySegmentOffsetsBefore(offset);
  const stored = await Promise.all(
    earlier.map((start) =>
      target.store.get(target.bucket, relaySegmentKey(session, partNumber, start)),
    ),
  );
  const joined = new Uint8Array(offset + last.byteLength);
  for (const [index, segment] of stored.entries()) {
    if (segment?.data.byteLength !== RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES) {
      throw createError
        .conflict(
          `Part ${partNumber} of this upload is missing a piece. Resume the upload to send it.`,
        )
        .asUserSafe();
    }
    joined.set(segment.data, earlier[index]!);
  }
  joined.set(last, offset);
  return joined;
}

async function handleRelayPart(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId, session } = await sessionFor(request, context, sessionToken(request));

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-resumable-part', userId);
  if (rateLimitResponse) return rateLimitResponse;

  if (isChatLargeFileSession(session)) throw largeFileNeedsDirectUpload();

  const partNumber = assertSessionPartNumber(
    session,
    Number(new URL(request.url).searchParams.get('partNumber') ?? Number.NaN),
  );
  const partLength = sessionPartLength(session, partNumber);
  const offset = segmentOffset(request, partLength);
  const body = new Uint8Array(await request.arrayBuffer());
  const wholePart = offset === 0 && body.byteLength === partLength;
  const segmentLength = Math.min(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES, partLength - offset);
  if (!wholePart && body.byteLength !== segmentLength) {
    throw createError.validation(
      offset === 0 && segmentLength === partLength
        ? `Part ${partNumber} must carry ${partLength} bytes.`
        : `This segment of part ${partNumber} must carry ${segmentLength} bytes.`,
    );
  }

  const target = resumableUploadTarget();
  if (!wholePart && offset + body.byteLength < partLength) {
    if (await sessionIsClosed(target, session)) uploadNoLongerOpen();
    const key = relaySegmentKey(session, partNumber, offset);
    await onOpenSession(target, session, () =>
      target.store.put({
        bucket: target.bucket,
        key,
        body,
        contentType: 'application/octet-stream',
        contentLength: body.byteLength,
      }),
    );
    if (await sessionIsClosed(target, session)) {
      await discardRelaySegments(target, [key]);
      uploadNoLongerOpen();
    }
    return NextResponse.json({ segment: { partNumber, offset, size: body.byteLength } });
  }

  const partBody = wholePart
    ? body
    : await joinRelayedPart(target, session, partNumber, offset, body);
  const joinedSegments = wholePart
    ? []
    : relaySegmentOffsetsBefore(offset).map((start) => relaySegmentKey(session, partNumber, start));
  let part: UploadedPart;
  try {
    part = await target.store.uploadPart({
      ...sessionHandle(target, session),
      partNumber,
      body: partBody,
    });
  } catch (error) {
    if (!(await sessionIsClosed(target, session))) throw error;
    await discardRelaySegments(target, joinedSegments);
    uploadNoLongerOpen();
  }
  await discardRelaySegments(target, joinedSegments);

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
      session.key,
    );
    return file ? knowledgeFileCompletion(file) : null;
  }
  const { temporary: temporaryChat } = await resolveTemporaryChatUpload({
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
  const registration = await registerProjectKnowledgeFile(projectScope, {
    fileName: session.fileName,
    mimeType: session.mimeType,
    byteCount: session.byteCount,
    checksumSha256: session.checksumSha256,
    sourceSurface: session.sourceSurface,
    storageUri: session.key,
  });
  return knowledgeFileCompletion(registration.file);
}

async function discardStagingObject(target: ResumableUploadTarget, key: string): Promise<void> {
  await target.store.delete(target.bucket, key).catch((error: unknown) => {
    logger.warn(
      { objectKey: key, error },
      '[chat-files] an unclaimed staging object was not removed',
    );
  });
}

function intakeAccepted(row: Parameters<typeof chatFileIntakeForClient>[0]): NextResponse {
  const accepted = ManagedCloudChatLargeFileCompleteResponseSchema.parse({
    kind: 'chat-attachment-intake',
    intake: chatFileIntakeForClient(row),
  });
  return NextResponse.json(accepted, { status: 202 });
}

/**
 * A `chat-large-file` session. Its bytes are checked by the intake workflow,
 * so the answer is the intake, never the attachment. A repeated complete
 * answers the same intake; an object whose intake row is gone or ended
 * without a seal is deleted, because nothing else points at it.
 */
async function completeChatLargeFile(
  db: ScopedDb,
  scope: { userId: string; organizationId: string | null },
  session: ResumableUploadSession & { intakeId: string },
): Promise<NextResponse> {
  const target = resumableUploadTarget();
  const assembled = await assembleParts(target, session);
  if (assembled === 'assembled' || (await target.store.head(target.bucket, session.key))) {
    const uploaded = await markUploaded(db, {
      userId: scope.userId,
      stagingKey: session.key,
      nowMs: Date.now(),
    });
    if (uploaded) {
      try {
        await startChatFileIntakeWorkflow({
          intakeId: uploaded.id,
          userId: scope.userId,
          organizationId: uploaded.organizationId,
        });
      } catch (error) {
        logger.warn(
          { err: error, intakeId: uploaded.id },
          '[chat-files] intake workflow did not start; the sweeper will retry it',
        );
      }
      return intakeAccepted(uploaded);
    }
  }
  const current = await readIntakeStatus(db, { userId: scope.userId, intakeId: session.intakeId });
  if (!current || current.state === 'awaiting_parts') {
    await discardStagingObject(target, session.key);
    uploadNoLongerOpen();
  }
  if (isChatFileIntakeTerminal(current.state) && current.state !== 'sealed') {
    await discardStagingObject(target, session.key);
  }
  return intakeAccepted(current);
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

  if (isChatLargeFileSession(session)) {
    return completeChatLargeFile(db, { userId, organizationId }, session);
  }

  const finished = await finishedUpload(db, { userId, organizationId }, session, parsed.data);
  if (finished) return NextResponse.json(finished);

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

async function storedBytesBeforeAbort(
  target: ResumableUploadTarget,
  session: ResumableUploadSession,
): Promise<number> {
  try {
    return storedBytes(await target.store.listUploadedParts(sessionHandle(target, session)));
  } catch (error) {
    logger.warn(
      { objectKey: session.key, error },
      '[chat-files] the stored parts could not be listed; nothing is refunded',
    );
    return session.byteCount;
  }
}

const ENDED_WITHOUT_FILE_STATES: ReadonlySet<ChatFileIntakeState> = new Set(['rejected', 'failed']);

/**
 * A `chat-large-file` session is ended from the parts the client already
 * stored: the upload is aborted, then its intake row is cancelled, giving back
 * the declared bytes the parts did not store and freeing its slot at once. A
 * cancel that arrives after the complete moved the row on cancels the intake
 * as its own `DELETE` would, so a file the person cancelled is not added.
 */
async function abortChatLargeFile(
  db: ScopedDb,
  userId: string,
  target: ResumableUploadTarget,
  session: ResumableUploadSession & { intakeId: string },
): Promise<NextResponse> {
  const stored = await storedBytesBeforeAbort(target, session);
  try {
    await target.store.abortMultipartUpload(sessionHandle(target, session));
  } catch (error) {
    if (!(await sessionIsClosed(target, session))) throw error;
  }
  const cancelled = await cancelIntakeByStagingKey(db, {
    userId,
    stagingKey: session.key,
    storedBytes: stored,
    nowMs: Date.now(),
  });
  if (!cancelled) {
    const cancelIntake = () =>
      cancelChatFileIntake(defaultIntakeTransitionDeps(db, userId), {
        userId,
        intakeId: session.intakeId,
      });
    let result = await cancelIntake();
    if (result.outcome === 'not_cancellable' && isChatFileIntakeCancellable(result.row.state)) {
      result = await cancelIntake();
    }
    if (result.outcome === 'not_cancellable') {
      logger.warn(
        { intakeId: session.intakeId, state: result.row.state },
        '[chat-files] an upload was aborted after its intake could no longer be cancelled',
      );
      if (!ENDED_WITHOUT_FILE_STATES.has(result.row.state)) {
        const late: ManagedCloudResumableUploadAbortResponse = {
          aborted: true,
          intake: { id: result.row.id },
        };
        return NextResponse.json(late);
      }
    }
  }
  return NextResponse.json({ aborted: true });
}

async function handleAbort(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, session } = await sessionFor(request, context, sessionToken(request));

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-presign', userId);
  if (rateLimitResponse) return rateLimitResponse;

  const target = resumableUploadTarget();
  if (isChatLargeFileSession(session)) return abortChatLargeFile(db, userId, target, session);
  try {
    await target.store.abortMultipartUpload(sessionHandle(target, session));
  } catch (error) {
    if (!(await sessionIsClosed(target, session))) throw error;
  }
  await discardRelaySegments(target, waitingRelaySegmentKeys(session));

  return NextResponse.json({ aborted: true });
}

export const GET = withCorsRoute(withErrorHandler(handleProgress));
export const PUT = withErrorHandler(handleRelayPart);
export const POST = withCorsRoute(withErrorHandler(handleComplete));
export const DELETE = withCorsRoute(withErrorHandler(handleAbort));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
