import 'server-only';

import {
  DEFAULT_ORPHAN_MULTIPART_AGE_MS,
  supportsMultipartUploads,
  type MultipartObjectStore,
  type MultipartUploadHandle,
  type UploadedPart,
} from '@agiworkforce/object-storage';
import {
  CHAT_LARGE_FILE_MAX_BYTES,
  CHAT_LARGE_FILE_UPLOAD_KIND,
  ManagedCloudChatFileIntakeSchema,
  ManagedCloudProjectKnowledgeRegisterRequestSchema,
  RESUMABLE_UPLOAD_KINDS,
  RESUMABLE_UPLOAD_MAX_BYTES,
  RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
  chatFileIntakeClientState,
  resumableUploadPartCount,
  resumableUploadPartRange,
  type ChatFileIntakeFailureCode,
  type ChatFileIntakeRefusalCode,
  type ChatLargeFileUploadKind,
  type ManagedCloudChatFileIntake,
  type ResumableUploadKind,
} from '@agiworkforce/cloud-contracts';
import { isChatImageMimeType } from '@/lib/chat-attachment-policy';
import { AppError, ErrorCode, createError } from '@/lib/errors';
import {
  UPLOAD_CHANGED_DURING_CHECK_MESSAGE,
  UPLOAD_ENCRYPTED_MESSAGE,
  UPLOAD_LIMITS_EXCEEDED_MESSAGE,
  UPLOAD_REJECTED_MESSAGE,
  UPLOAD_SCAN_UNAVAILABLE_MESSAGE,
  UPLOAD_STORAGE_FULL_MESSAGE,
} from '@/lib/security/upload-scan';
import type { ChatFileIntakeRow } from '@/lib/server/chat-file-intake/store';
import { isPrivateObjectStorageConfigured } from '@/lib/server/object-storage';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';
import { readSignedUploadClaims, signUploadClaims } from '@/lib/server/upload-signing';
import { relaySegmentKey } from './relay-segments';

const SESSION_VERSION = 1;
const SESSION_PURPOSE = `agi-resumable-upload-session-v${SESSION_VERSION}`;
const SESSION_SURFACES =
  ManagedCloudProjectKnowledgeRegisterRequestSchema.shape.sourceSurface.options;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RESUMABLE_UPLOAD_SESSION_TTL_MS = DEFAULT_ORPHAN_MULTIPART_AGE_MS;
export const RESUMABLE_PART_URL_TTL_SECONDS = 900;

export interface ResumableUploadSession {
  v: number;
  userId: string;
  organizationId: string | null;
  kind: ResumableUploadKind | ChatLargeFileUploadKind;
  key: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  byteCount: number;
  partBytes: number;
  checksumSha256: string;
  projectId: string | null;
  sourceSurface: (typeof SESSION_SURFACES)[number] | null;
  /** The intake row a `chat-large-file` session feeds; absent on every other kind. */
  intakeId?: string;
  expiresAt: number;
}

export interface ResumableUploadTarget {
  store: MultipartObjectStore;
  bucket: string;
}

export function resumableUploadTarget(): ResumableUploadTarget {
  const bucket = objectStorageConfig().privateBucket;
  if (!isPrivateObjectStorageConfigured() || !bucket) {
    throw createError.capabilityUnavailable(
      'Uploading a file in parts is not available on this deployment.',
    );
  }
  const store = getObjectStore();
  if (!supportsMultipartUploads(store)) {
    throw createError.capabilityUnavailable(
      'Uploading a file in parts is not available on this deployment.',
    );
  }
  return { store, bucket };
}

export function sessionHandle(
  target: ResumableUploadTarget,
  session: ResumableUploadSession,
): MultipartUploadHandle {
  return { bucket: target.bucket, key: session.key, uploadId: session.uploadId };
}

export function sessionPartCount(session: ResumableUploadSession): number {
  return resumableUploadPartCount(session.byteCount, session.partBytes);
}

export function sessionPartLength(session: ResumableUploadSession, partNumber: number): number {
  const range = resumableUploadPartRange(partNumber, session.byteCount, session.partBytes);
  return range.end - range.start;
}

/** The offsets of every segment a relayed part waits on before its last one. */
export function relaySegmentOffsetsBefore(offset: number): number[] {
  const offsets: number[] = [];
  for (let start = 0; start < offset; start += RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES) {
    offsets.push(start);
  }
  return offsets;
}

/** Every segment of this upload that could be waiting in storage for the rest of its part. */
export function waitingRelaySegmentKeys(session: ResumableUploadSession): string[] {
  const keys: string[] = [];
  for (let partNumber = 1; partNumber <= sessionPartCount(session); partNumber += 1) {
    const partLength = sessionPartLength(session, partNumber);
    const lastSegmentStart =
      Math.floor((partLength - 1) / RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES) *
      RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES;
    for (const start of relaySegmentOffsetsBefore(lastSegmentStart)) {
      keys.push(relaySegmentKey(session, partNumber, start));
    }
  }
  return keys;
}

export function assertSessionPartNumber(session: ResumableUploadSession, value: number): number {
  const partCount = sessionPartCount(session);
  if (!Number.isSafeInteger(value) || value < 1 || value > partCount) {
    throw createError.validation(`A part number must be between 1 and ${partCount}.`);
  }
  return value;
}

export function storedBytes(parts: readonly UploadedPart[]): number {
  return parts.reduce((total, part) => total + part.size, 0);
}

export function missingParts(
  session: ResumableUploadSession,
  parts: readonly UploadedPart[],
): number[] {
  const stored = new Map(parts.map((part) => [part.partNumber, part.size]));
  const missing: number[] = [];
  for (let partNumber = 1; partNumber <= sessionPartCount(session); partNumber += 1) {
    if (stored.get(partNumber) !== sessionPartLength(session, partNumber)) missing.push(partNumber);
  }
  return missing;
}

export async function issueResumableUploadSession(
  session: Omit<ResumableUploadSession, 'v' | 'expiresAt'>,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + RESUMABLE_UPLOAD_SESSION_TTL_MS;
  const token = await signUploadClaims(SESSION_PURPOSE, {
    ...session,
    v: SESSION_VERSION,
    expiresAt,
  });
  return { token, expiresAt };
}

function sessionMaxBytes(kind: unknown): number | null {
  if (kind === CHAT_LARGE_FILE_UPLOAD_KIND) return CHAT_LARGE_FILE_MAX_BYTES;
  return typeof kind === 'string' && (RESUMABLE_UPLOAD_KINDS as readonly string[]).includes(kind)
    ? RESUMABLE_UPLOAD_MAX_BYTES[kind as ResumableUploadKind]
    : null;
}

function validIntakeClaim(kind: unknown, intakeId: unknown): boolean {
  if (kind === CHAT_LARGE_FILE_UPLOAD_KIND)
    return typeof intakeId === 'string' && UUID.test(intakeId);
  return intakeId === undefined;
}

export const LARGE_FILE_NEEDS_DIRECT_UPLOAD_CODE = 'large_file_needs_direct_upload';

/** A large file's parts never pass through a function; an origin storage refuses cannot send them. */
export function largeFileNeedsDirectUpload(): AppError {
  return new AppError(
    ErrorCode.CONFLICT,
    'Files this large can only be uploaded from a page that sends them straight to storage.',
    409,
    { code: LARGE_FILE_NEEDS_DIRECT_UPLOAD_CODE },
  ).asUserSafe();
}

export function isChatLargeFileSession(
  session: ResumableUploadSession,
): session is ResumableUploadSession & { kind: ChatLargeFileUploadKind; intakeId: string } {
  return session.kind === CHAT_LARGE_FILE_UPLOAD_KIND && typeof session.intakeId === 'string';
}

function parseSession(value: unknown): ResumableUploadSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const claims = value as Record<string, unknown>;
  const kind = claims['kind'];
  const sourceSurface = claims['sourceSurface'];
  const maxBytes = sessionMaxBytes(kind);
  if (
    maxBytes === null ||
    !validIntakeClaim(kind, claims['intakeId']) ||
    claims['v'] !== SESSION_VERSION ||
    typeof claims['userId'] !== 'string' ||
    !claims['userId'] ||
    (claims['organizationId'] !== null && typeof claims['organizationId'] !== 'string') ||
    typeof claims['key'] !== 'string' ||
    !claims['key'] ||
    typeof claims['uploadId'] !== 'string' ||
    !claims['uploadId'] ||
    typeof claims['fileName'] !== 'string' ||
    typeof claims['mimeType'] !== 'string' ||
    typeof claims['byteCount'] !== 'number' ||
    !Number.isSafeInteger(claims['byteCount']) ||
    claims['byteCount'] <= 0 ||
    claims['byteCount'] > maxBytes ||
    typeof claims['partBytes'] !== 'number' ||
    !Number.isSafeInteger(claims['partBytes']) ||
    claims['partBytes'] <= 0 ||
    typeof claims['checksumSha256'] !== 'string' ||
    !SHA256_HEX.test(claims['checksumSha256']) ||
    (claims['projectId'] !== null && typeof claims['projectId'] !== 'string') ||
    (sourceSurface !== null && !(SESSION_SURFACES as readonly unknown[]).includes(sourceSurface)) ||
    typeof claims['expiresAt'] !== 'number' ||
    !Number.isSafeInteger(claims['expiresAt'])
  ) {
    return null;
  }
  return claims as unknown as ResumableUploadSession;
}

export async function readResumableUploadSession(
  token: string | null | undefined,
  scope: { userId: string; organizationId: string | null; uploadId: string },
): Promise<ResumableUploadSession> {
  const session = token ? parseSession(await readSignedUploadClaims(SESSION_PURPOSE, token)) : null;
  if (!session || session.userId !== scope.userId || session.uploadId !== scope.uploadId) {
    throw createError.notFound('Upload not found');
  }
  if (session.expiresAt < Date.now()) {
    throw createError
      .notFound('This upload is no longer open. Start it again to finish the file.')
      .asUserSafe();
  }
  if (session.organizationId !== scope.organizationId) {
    throw createError
      .conflict('This upload was started in another workspace. Switch back to finish it.')
      .asUserSafe();
  }
  return session;
}

const INTAKE_REFUSAL_COPY: Partial<Record<ChatFileIntakeRefusalCode, string>> = {
  encrypted: UPLOAD_ENCRYPTED_MESSAGE,
  limits_exceeded: UPLOAD_LIMITS_EXCEEDED_MESSAGE,
  changed_during_check: UPLOAD_CHANGED_DURING_CHECK_MESSAGE,
  storage_full: UPLOAD_STORAGE_FULL_MESSAGE,
};

const INTAKE_FAILURE_COPY: Record<ChatFileIntakeFailureCode, string> = {
  scan_unavailable: UPLOAD_SCAN_UNAVAILABLE_MESSAGE,
  stalled: UPLOAD_SCAN_UNAVAILABLE_MESSAGE,
};

/** A sealed intake whose file was deleted since: there is nothing left to attach. */
function chatFileNoLongerStored(): AppError {
  return createError
    .notFound('This file is no longer stored. Attach it again to use it.')
    .asUserSafe();
}

/**
 * An intake row as its owner's client reads it. The schema refuses a row whose
 * fields do not explain its state, so an inconsistent row is never sent.
 */
export function chatFileIntakeForClient(row: ChatFileIntakeRow): ManagedCloudChatFileIntake {
  const state = chatFileIntakeClientState(row.state);
  if (state === 'ready' && row.mediaAssetId === null) throw chatFileNoLongerStored();
  return ManagedCloudChatFileIntakeSchema.parse({
    id: row.id,
    state,
    ...(state === 'ready' && row.mediaAssetId !== null
      ? {
          attachment: {
            id: row.mediaAssetId,
            name: row.fileName,
            mimeType: row.mimeType,
            byteCount: row.byteCount,
            type: isChatImageMimeType(row.mimeType) ? 'image' : 'file',
            url: `/api/files/${row.mediaAssetId}`,
          },
        }
      : {}),
    ...(state === 'rejected' && row.refusalCode !== null
      ? {
          refusalCode: row.refusalCode,
          message: INTAKE_REFUSAL_COPY[row.refusalCode] ?? UPLOAD_REJECTED_MESSAGE,
        }
      : {}),
    ...(state === 'failed' && row.failureCode !== null
      ? { failureCode: row.failureCode, message: INTAKE_FAILURE_COPY[row.failureCode] }
      : {}),
    ...(state === 'cancelled' && row.cancelReason !== null
      ? { cancelReason: row.cancelReason }
      : {}),
  });
}
