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
  // Jupyter notebooks. Served as JSON by most tools, but given their own type
  // so the extractor can pull CELLS rather than dumping raw notebook JSON —
  // which is mostly base64 image outputs and metadata.
  'application/x-ipynb+json',
  'application/xml',
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
  return CHAT_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
    ? 'text/plain'
    : null;
}

export function isChatImageMimeType(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(
    mimeType.trim().toLowerCase(),
  );
}

/** Anthropic's text document block requires text/plain. */
export function normalizeChatDocumentMimeType(mimeType: string): string {
  const mime = mimeType.trim().toLowerCase();
  if (mime === 'application/pdf') return mime;
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
