import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { z } from 'zod';
import { MAX_CHAT_ATTACHMENT_BYTES, ManagedCloudChatAttachmentSchema } from './chat-attachments';
import {
  ManagedCloudProjectKnowledgeFileSchema,
  ManagedCloudProjectKnowledgeRegisterRequestSchema,
} from './project-knowledge';

export const MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH = '/api/files/uploads';

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

export const RESUMABLE_UPLOAD_PART_BYTES = 5 * 1024 * 1024;

export const RESUMABLE_UPLOAD_KINDS = ['chat-attachment', 'knowledge-file'] as const;
export type ResumableUploadKind = (typeof RESUMABLE_UPLOAD_KINDS)[number];

export const RESUMABLE_UPLOAD_MAX_BYTES: Readonly<Record<ResumableUploadKind, number>> =
  Object.freeze({
    'chat-attachment': MAX_CHAT_ATTACHMENT_BYTES,
    'knowledge-file': MAX_ATTACHMENT_BYTES,
  });

export function shouldUploadInParts(byteCount: number): boolean {
  return byteCount > RESUMABLE_UPLOAD_PART_BYTES;
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
    byteCount: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
    checksumSha256: Sha256HexSchema,
  }),
  z.object({
    kind: z.literal('knowledge-file'),
    projectId: z.string().min(1).max(200),
    fileName: FileNameSchema,
    mimeType: MimeTypeSchema,
    byteCount: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
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
