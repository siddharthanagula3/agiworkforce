import attachmentPolicy from './attachment-policy.json';
/**
 * Chat Types
 *
 * High-level chat types that wrap the lower-level conversation contracts.
 * These provide the most commonly used shapes for chat features across
 * desktop, web, mobile, and extension surfaces.
 *
 * For branded ID types and base interfaces, see `conversation.ts`.
 *
 * @module chat
 * @packageDocumentation
 */

import type {
  MessageRole,
  MessageKind,
  MessageStatus,
  ConversationId,
  ArtifactBase,
} from './conversation';

// Note: MessageRole, MessageKind, MessageStatus are already exported from

/**
 * A chat message suitable for cross-surface consumption.
 *
 * Extends the shared `MessageBase` contract with commonly needed fields.
 * Surfaces may further extend this with surface-specific properties.
 *
 * @example
 * ```typescript
 * const msg: ChatMessage = {
 *   id: 'msg-001',
 *   conversationId: 'conv-abc',
 *   role: 'assistant',
 *   content: 'Here is the refactored code...',
 *   kind: 'text',
 *   status: 'delivered',
 *   model: selectedModel.id,
 *   provider: selectedModel.provider,
 *   createdAt: '2026-03-15T10:30:00Z',
 *   tokenCount: 512,
 * };
 * ```
 */
export interface ChatMessage {
  id: string;

  conversationId: string;

  role: MessageRole;

  content: string;

  kind?: MessageKind;

  status?: MessageStatus;

  createdAt: string;

  model?: string;

  provider?: string;

  tokenCount?: number;

  cost?: number;

  reasoning?: string;

  isStreaming?: boolean;

  attachments?: ChatAttachment[];

  artifacts?: ArtifactBase[];

  metadata?: Record<string, unknown>;
}

export interface ChatAttachment {
  id: string;

  name: string;

  size: number;

  mimeType: string;

  url?: string;
}

export const MAX_ATTACHMENT_BYTES = attachmentPolicy.maxBytes;

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_PREFIXES: readonly string[] =
  attachmentPolicy.allowedMimePrefixes;

export const IMAGE_ATTACHMENT_MIME_TYPES: readonly string[] = attachmentPolicy.imageMimeTypes;

export const DENIED_ATTACHMENT_MIME_TYPES: readonly string[] = attachmentPolicy.deniedMimeTypes;

export const DENIED_ATTACHMENT_EXTENSIONS: readonly string[] = attachmentPolicy.deniedExtensions;

export const IMAGE_ATTACHMENT_EXTENSIONS: readonly string[] = attachmentPolicy.imageExtensions;

export const OFFICE_ATTACHMENT_MIME_TYPES: readonly string[] = attachmentPolicy.officeMimeTypes;

export const OFFICE_ATTACHMENT_EXTENSIONS: readonly string[] = attachmentPolicy.officeExtensions;

export const TEXT_ATTACHMENT_EXTENSIONS: readonly string[] = attachmentPolicy.textExtensions;

export const ALLOWED_ATTACHMENT_EXTENSIONS: readonly string[] = [
  ...IMAGE_ATTACHMENT_EXTENSIONS,
  ...attachmentPolicy.fixedExtensions,
  ...TEXT_ATTACHMENT_EXTENSIONS,
  ...OFFICE_ATTACHMENT_EXTENSIONS,
];

export const ALLOWED_ATTACHMENT_ACCEPT = [
  ...IMAGE_ATTACHMENT_MIME_TYPES,
  'application/pdf',
  ...OFFICE_ATTACHMENT_MIME_TYPES,
  'text/*',
  'application/json',
  'application/xml',
  ...ALLOWED_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

export type AttachmentValidation =
  { ok: true } | { ok: false; reason: 'too-large' | 'unsupported-type' | 'empty'; message: string };

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isTextAttachmentMeta(name: string, mimeType: string): boolean {
  const mime = (mimeType ?? '').split(';', 1)[0]!.trim().toLowerCase();
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
    return true;
  }
  if (mime.startsWith('image/') || mime === 'application/pdf') return false;
  return TEXT_ATTACHMENT_EXTENSIONS.includes(fileExtension(name));
}

export function isAcceptedAttachmentType(name: string, mimeType: string): boolean {
  const mime = (mimeType ?? '').split(';', 1)[0]!.trim().toLowerCase();
  const ext = fileExtension(name);
  if (DENIED_ATTACHMENT_MIME_TYPES.includes(mime) || DENIED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return false;
  }
  const mimeAllowed =
    mime.length > 0 &&
    (IMAGE_ATTACHMENT_MIME_TYPES.includes(mime) ||
      OFFICE_ATTACHMENT_MIME_TYPES.includes(mime) ||
      ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)));
  return mimeAllowed || ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext);
}

export function validateAttachmentMeta(
  name: string,
  mimeType: string,
  byteCount: number,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): AttachmentValidation {
  if (byteCount === 0) {
    return {
      ok: false,
      reason: 'empty',
      message: `${name} is empty.`,
    };
  }
  if (byteCount > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    return {
      ok: false,
      reason: 'too-large',
      message: `${name} is larger than the ${limitMb} MiB attachment limit.`,
    };
  }
  if (!isAcceptedAttachmentType(name, mimeType)) {
    const mime = (mimeType ?? '').split(';', 1)[0]!.trim().toLowerCase();
    return {
      ok: false,
      reason: 'unsupported-type',
      message: `${name} (${mime || 'unknown type'}) is not an accepted attachment type.`,
    };
  }
  return { ok: true };
}

export function validateAttachmentFile(file: File): AttachmentValidation {
  return validateAttachmentMeta(file.name, file.type, file.size);
}

/**
 * A chat conversation with its messages and metadata.
 *
 * This is the cross-surface conversation shape. Desktop, web, and mobile
 * may extend this with surface-specific fields.
 *
 * @example
 * ```typescript
 * const conversation: Conversation = {
 *   id: 'conv-abc',
 *   title: 'Code Review Discussion',
 *   model: selectedModel.id,
 *   provider: selectedModel.provider,
 *   messageCount: 12,
 *   createdAt: '2026-03-15T10:00:00Z',
 *   updatedAt: '2026-03-15T10:30:00Z',
 * };
 * ```
 */
export interface Conversation {
  id: string | ConversationId;

  title: string;

  model?: string;

  provider?: string;

  messageCount?: number;

  createdAt: string;

  updatedAt: string;

  customInstructions?: string;

  tags?: string[];

  metadata?: Record<string, unknown>;
}
