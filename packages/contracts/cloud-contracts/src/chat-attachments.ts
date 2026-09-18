import {
  createFileReference,
  isTextLikeFileMediaType,
  toManagedFile,
  type FileLineage,
  type FileReference,
  type ManagedFile,
  type SourceSurface,
} from '@agiworkforce/types';
import { z } from 'zod';

export const MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH = '/api/uploads/presign';
export const MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH = '/api/uploads/chat-attachment/complete';

export const MAX_CHAT_ATTACHMENT_BYTES = 12 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_COUNT = 10;

export const CHAT_ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/javascript',
  'text/typescript',
  'text/html',
  'text/css',
  'application/json',
  'application/x-ipynb+json',
  'application/xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

const CHAT_ATTACHMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.ipynb',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.rs',
  '.go',
  '.rb',
  '.sh',
  '.yml',
  '.yaml',
  '.toml',
  '.docx',
  '.xlsx',
  '.pptx',
] as const;

export function chatAttachmentAcceptAttribute(): string {
  return [...CHAT_ATTACHMENT_MIME_TYPES, ...CHAT_ATTACHMENT_EXTENSIONS].join(',');
}

export function isSupportedChatAttachment(fileName: string, mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  if ((CHAT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime)) return true;
  if (mime.startsWith('text/')) return true;
  const lowerName = fileName.trim().toLowerCase();
  return CHAT_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

export function resolveChatAttachmentMimeType(fileName: string, mimeType: string): string | null {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized) return isSupportedChatAttachment(fileName, normalized) ? normalized : null;
  const lowerName = fileName.trim().toLowerCase();
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.gif')) return 'image/gif';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.ipynb')) return 'application/x-ipynb+json';
  if (lowerName.endsWith('.json')) return 'application/json';
  if (lowerName.endsWith('.xml')) return 'application/xml';
  if (lowerName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lowerName.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lowerName.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return CHAT_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
    ? 'text/plain'
    : null;
}

export function isChatImageMimeType(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
    mimeType.trim().toLowerCase(),
  );
}

/**
 * The type a document attachment is described by once it reaches a model.
 *
 * A PDF stays a PDF, because a route with a native file channel reads the
 * bytes. Anything else the accept list admits decodes to characters, so it
 * keeps its own type: a `.csv` announced as `text/csv` tells the model it is
 * looking at rows, which collapsing everything to `text/plain` threw away.
 *
 * The fallback is still `text/plain`, and it is reachable: an extension on the
 * accept list with no recognised media type (`.rs`, `.toml`) arrives labelled
 * that way already. What must never reach it is opaque bytes: an Office
 * package is read into text before this point and arrives as that text, so
 * nothing that fails to decode is ever labelled as though it would.
 */
export function normalizeChatDocumentMimeType(mimeType: string): string {
  const mime = mimeType.trim().toLowerCase();
  if (mime === 'application/pdf') return mime;
  if (isTextLikeFileMediaType(mime)) return mime;
  return 'text/plain';
}

export const ManagedCloudChatAttachmentPresignRequestSchema = z.object({
  kind: z.literal('chat-attachment'),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
});

export const ManagedCloudChatAttachmentPresignResponseSchema = z.object({
  storageKey: z.string().min(1),
  uploadUrl: z.string().url(),
  uploadMethod: z.literal('PUT'),
  uploadHeaders: z.record(z.string(), z.string()),
});

export const ManagedCloudChatAttachmentCompleteRequestSchema = z.object({
  storageKey: z.string().min(1).max(600),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteCount: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
  /**
   * The conversation the file is being attached to, when it already exists.
   * The server reads its own `is_temporary` from this rather than trusting
   * `temporary`, which only covers a chat that has not been created yet.
   */
  conversationId: z.string().min(1).max(200).optional(),
  /** The composer is in Temporary Chat. Only ever shortens what is kept. */
  temporary: z.boolean().optional(),
});

export const ManagedCloudChatAttachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  byteCount: z.number().int().positive(),
  type: z.enum(['image', 'file']),
  url: z.string().startsWith('/api/files/'),
});

export const ManagedCloudChatAttachmentCompleteResponseSchema = z.object({
  attachment: ManagedCloudChatAttachmentSchema,
});

export type ManagedCloudChatAttachment = z.infer<typeof ManagedCloudChatAttachmentSchema>;

/**
 * The canonical reference to an uploaded attachment. A text-like upload is
 * read back as text, so its parse status is pending until an extractor has
 * run; opaque bytes are never parsed and say so.
 */
export function chatAttachmentFileReference(
  attachment: ManagedCloudChatAttachment,
  options: { sourceSurface?: SourceSurface | null; checksumSha256?: string | null } = {},
): FileReference {
  return createFileReference({
    id: attachment.id,
    name: attachment.name,
    mediaType: attachment.mimeType,
    byteCount: attachment.byteCount,
    uri: attachment.url,
    origin: 'upload',
    parseStatus: isTextLikeFileMediaType(attachment.mimeType) ? 'pending' : 'not_applicable',
    checksumSha256: options.checksumSha256 ?? null,
    sourceSurface: options.sourceSurface ?? null,
  });
}

/**
 * The same reference carrying the version and lineage every surface stores it
 * with. An upload is always version 1 of its own chain: it was not derived from
 * anything the platform holds, which is exactly what an empty
 * `derivedFromFileId` says.
 */
export function chatAttachmentManagedFile(
  attachment: ManagedCloudChatAttachment,
  options: {
    sourceSurface?: SourceSurface | null;
    checksumSha256?: string | null;
    lineage?: Partial<FileLineage>;
  } = {},
): ManagedFile {
  return toManagedFile(chatAttachmentFileReference(attachment, options), options.lineage ?? {});
}
