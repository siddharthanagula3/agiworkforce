import uploadContract from './upload-contract.json' with { type: 'json' };
import { MAX_PLAN_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { z } from 'zod';
import {
  CHAT_LARGE_FILE_POLICY,
  MAX_CHAT_ATTACHMENT_BYTES,
  ManagedCloudChatAttachmentSchema,
} from './chat-attachments';
import { ManagedCloudChatFileIntakeSchema } from './chat-file-intake';
import {
  ManagedCloudProjectKnowledgeFileSchema,
  ManagedCloudProjectKnowledgeRegisterRequestSchema,
} from './project-knowledge';

export const MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH = uploadContract.resumablePath;

export function managedCloudResumableUploadPath(uploadId: string): string {
  return `${MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH}/${encodeURIComponent(uploadId)}`;
}

export function managedCloudResumableUploadPartsPath(uploadId: string): string {
  return `${managedCloudResumableUploadPath(uploadId)}/parts`;
}

export const RESUMABLE_UPLOAD_SESSION_PARAM = 'session';

export function managedCloudResumableUploadSessionPath(uploadId: string, session: string): string {
  return `${managedCloudResumableUploadPath(uploadId)}?${RESUMABLE_UPLOAD_SESSION_PARAM}=${encodeURIComponent(session)}`;
}

export const RESUMABLE_UPLOAD_PART_BYTES = uploadContract.partBytes;

/**
 * The most one request through the web host may carry. Storage refuses a part
 * under {@link RESUMABLE_UPLOAD_PART_BYTES} unless it is the last, and the host
 * refuses a body over its platform limit, so a relayed part goes in segments of
 * this size and the server joins them into the part.
 */
export const RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES = uploadContract.relaySegmentBytes;

export const RESUMABLE_UPLOAD_SEGMENT_OFFSET_PARAM = 'offset';

export const RESUMABLE_UPLOAD_KINDS = ['chat-attachment', 'knowledge-file'] as const;
export type ResumableUploadKind = (typeof RESUMABLE_UPLOAD_KINDS)[number];

export const RESUMABLE_UPLOAD_MAX_BYTES: Readonly<Record<ResumableUploadKind, number>> =
  Object.freeze({
    'chat-attachment': MAX_CHAT_ATTACHMENT_BYTES,
    'knowledge-file': MAX_PLAN_ATTACHMENT_BYTES,
  });

/**
 * A chat file over the inline limit. It is not one of {@link RESUMABLE_UPLOAD_KINDS}:
 * a server that predates it refuses it, and a client sends it only to a server
 * that offered large files.
 */
export const CHAT_LARGE_FILE_UPLOAD_KIND = 'chat-large-file';
export type ChatLargeFileUploadKind = typeof CHAT_LARGE_FILE_UPLOAD_KIND;

export const CHAT_LARGE_FILE_MAX_BYTES = CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes;

export const RESUMABLE_UPLOAD_LARGE_PART_BYTES = uploadContract.largeFilePartBytes;

export const RESUMABLE_UPLOAD_LARGE_PART_THRESHOLD_BYTES = uploadContract.largeFileThresholdBytes;

export const RESUMABLE_UPLOAD_PART_CONCURRENCY: Readonly<{ web: number; mobile: number }> =
  Object.freeze({
    web: uploadContract.partConcurrencyWeb,
    mobile: uploadContract.partConcurrencyMobile,
  });

export function chatLargeFilePartBytes(byteCount: number): number {
  return byteCount > RESUMABLE_UPLOAD_LARGE_PART_THRESHOLD_BYTES
    ? RESUMABLE_UPLOAD_LARGE_PART_BYTES
    : RESUMABLE_UPLOAD_PART_BYTES;
}

/** A file one relayed request could not carry goes in parts, which the server can relay in segments. */
export function shouldUploadInParts(byteCount: number): boolean {
  return byteCount > RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES;
}

export function resumableUploadPartCount(byteCount: number, partBytes: number): number {
  return Math.max(1, Math.ceil(byteCount / partBytes));
}

export interface ResumableUploadPartRange {
  start: number;
  end: number;
}

export function resumableUploadPartRange(
  partNumber: number,
  byteCount: number,
  partBytes: number,
): ResumableUploadPartRange {
  const start = (partNumber - 1) * partBytes;
  return { start, end: Math.min(start + partBytes, byteCount) };
}

const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const FileNameSchema = z.string().min(1).max(255);
const MimeTypeSchema = z.string().min(1).max(255);

export const ManagedCloudResumableUploadCreateRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('chat-attachment'),
    fileName: FileNameSchema,
    mimeType: MimeTypeSchema,
    byteCount: z.number().int().positive().max(MAX_PLAN_ATTACHMENT_BYTES),
    checksumSha256: Sha256HexSchema,
  }),
  z.object({
    kind: z.literal('knowledge-file'),
    projectId: z.string().min(1).max(200),
    fileName: FileNameSchema,
    mimeType: MimeTypeSchema,
    byteCount: z.number().int().positive().max(MAX_PLAN_ATTACHMENT_BYTES),
    checksumSha256: Sha256HexSchema,
    sourceSurface: ManagedCloudProjectKnowledgeRegisterRequestSchema.shape.sourceSurface,
  }),
]);
export type ManagedCloudResumableUploadCreateRequest = z.infer<
  typeof ManagedCloudResumableUploadCreateRequestSchema
>;

export const ManagedCloudResumableUploadSessionSchema = z.object({
  uploadId: z.string().min(1),
  session: z.string().min(1),
  partBytes: z.number().int().positive(),
  partCount: z.number().int().positive(),
  expiresAt: z.string().min(1),
});
export type ManagedCloudResumableUploadSession = z.infer<
  typeof ManagedCloudResumableUploadSessionSchema
>;

export const ManagedCloudResumableUploadProgressSchema = z.object({
  uploadId: z.string().min(1),
  partBytes: z.number().int().positive(),
  parts: z.array(
    z.object({
      partNumber: z.number().int().positive(),
      size: z.number().int().nonnegative(),
    }),
  ),
  bytesStored: z.number().int().nonnegative(),
});

export const ManagedCloudResumableUploadPartsRequestSchema = z.object({
  session: z.string().min(1),
  partNumbers: z.array(z.number().int().positive()).min(1),
});

export const ManagedCloudResumableUploadSignedPartSchema = z.object({
  partNumber: z.number().int().positive(),
  url: z.string().url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  /** Present when the part goes through the web host: send it in segments of at most this many bytes. */
  segmentBytes: z.number().int().positive().optional(),
});
export type ManagedCloudResumableUploadSignedPart = z.infer<
  typeof ManagedCloudResumableUploadSignedPartSchema
>;

export const ManagedCloudResumableUploadPartsResponseSchema = z.object({
  parts: z.array(ManagedCloudResumableUploadSignedPartSchema),
});

export const ManagedCloudResumableUploadCompleteRequestSchema = z.object({
  session: z.string().min(1),
  conversationId: z.string().min(1).max(200).optional(),
  temporary: z.boolean().optional(),
});
export type ManagedCloudResumableUploadCompleteRequest = z.infer<
  typeof ManagedCloudResumableUploadCompleteRequestSchema
>;

export const ManagedCloudResumableUploadCompleteResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chat-attachment'), attachment: ManagedCloudChatAttachmentSchema }),
  z.object({ kind: z.literal('knowledge-file'), file: ManagedCloudProjectKnowledgeFileSchema }),
]);
export type ManagedCloudResumableUploadCompleteResponse = z.infer<
  typeof ManagedCloudResumableUploadCompleteResponseSchema
>;

/**
 * Only a file over the inline limit takes this kind, so a file within it
 * always keeps the synchronous path.
 */
export const ManagedCloudChatLargeFileCreateRequestSchema = z.object({
  kind: z.literal(CHAT_LARGE_FILE_UPLOAD_KIND),
  fileName: FileNameSchema,
  mimeType: MimeTypeSchema,
  byteCount: z.number().int().gt(MAX_CHAT_ATTACHMENT_BYTES).max(CHAT_LARGE_FILE_MAX_BYTES),
  checksumSha256: Sha256HexSchema,
  conversationId: ManagedCloudResumableUploadCompleteRequestSchema.shape.conversationId,
  temporary: ManagedCloudResumableUploadCompleteRequestSchema.shape.temporary,
});
export type ManagedCloudChatLargeFileCreateRequest = z.infer<
  typeof ManagedCloudChatLargeFileCreateRequestSchema
>;

export const ManagedCloudChatLargeFileCompleteResponseSchema = z.object({
  kind: z.literal('chat-attachment-intake'),
  intake: ManagedCloudChatFileIntakeSchema,
});
export type ManagedCloudChatLargeFileCompleteResponse = z.infer<
  typeof ManagedCloudChatLargeFileCompleteResponseSchema
>;

/**
 * `intake` is named only when the cancel came too late to stop the file being
 * added, so a client can read that intake instead of leaving it unannounced.
 */
export const ManagedCloudResumableUploadAbortResponseSchema = z.object({
  aborted: z.literal(true),
  intake: z.object({ id: z.string().uuid() }).optional(),
});
export type ManagedCloudResumableUploadAbortResponse = z.infer<
  typeof ManagedCloudResumableUploadAbortResponseSchema
>;
