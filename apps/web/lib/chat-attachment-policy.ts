/**
 * Cross-provider chat-attachment policy.
 *
 * Keep this narrower than the project-knowledge contract: every accepted type
 * must be representable without lossy/silent dropping by Gemini, OpenAI
 * Responses, and Anthropic Messages. Office binaries are handled by the
 * sandbox/Office creation pipeline instead of pretending every chat provider
 * can read them natively.
 */

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
  'application/xml',
] as const;

const CHAT_ATTACHMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.csv',
  '.json',
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
