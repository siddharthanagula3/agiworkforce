import 'server-only';

import {
  DEFAULT_ORPHAN_MULTIPART_AGE_MS,
  supportsMultipartUploads,
  type MultipartObjectStore,
  type MultipartUploadHandle,
  type UploadedPart,
} from '@agiworkforce/object-storage';
import {
  ManagedCloudProjectKnowledgeRegisterRequestSchema,
  RESUMABLE_UPLOAD_KINDS,
  RESUMABLE_UPLOAD_MAX_BYTES,
  resumableUploadPartCount,
  resumableUploadPartRange,
  type ResumableUploadKind,
} from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';
import { isPrivateObjectStorageConfigured } from '@/lib/server/object-storage';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';
import { readSignedUploadClaims, signUploadClaims } from '@/lib/server/upload-signing';

const SESSION_VERSION = 1;
const SESSION_PURPOSE = `agi-resumable-upload-session-v${SESSION_VERSION}`;
const SESSION_SURFACES =
  ManagedCloudProjectKnowledgeRegisterRequestSchema.shape.sourceSurface.options;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export const RESUMABLE_UPLOAD_SESSION_TTL_MS = DEFAULT_ORPHAN_MULTIPART_AGE_MS;
export const RESUMABLE_PART_URL_TTL_SECONDS = 900;

export interface ResumableUploadSession {
  v: number;
  userId: string;
  organizationId: string | null;
  kind: ResumableUploadKind;
  key: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  byteCount: number;
  partBytes: number;
  checksumSha256: string;
  projectId: string | null;
  sourceSurface: (typeof SESSION_SURFACES)[number] | null;
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

function parseSession(value: unknown): ResumableUploadSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const claims = value as Record<string, unknown>;
  const kind = claims['kind'];
  const sourceSurface = claims['sourceSurface'];
  if (
    claims['v'] !== SESSION_VERSION ||
    typeof claims['userId'] !== 'string' ||
    !claims['userId'] ||
    (claims['organizationId'] !== null && typeof claims['organizationId'] !== 'string') ||
    typeof kind !== 'string' ||
    !(RESUMABLE_UPLOAD_KINDS as readonly string[]).includes(kind) ||
    typeof claims['key'] !== 'string' ||
    !claims['key'] ||
    typeof claims['uploadId'] !== 'string' ||
    !claims['uploadId'] ||
    typeof claims['fileName'] !== 'string' ||
    typeof claims['mimeType'] !== 'string' ||
    typeof claims['byteCount'] !== 'number' ||
    !Number.isSafeInteger(claims['byteCount']) ||
    claims['byteCount'] <= 0 ||
    claims['byteCount'] > RESUMABLE_UPLOAD_MAX_BYTES[kind as ResumableUploadKind] ||
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
