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

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_PREFIXES: readonly string[] = [
  'application/pdf',
  'text/',
  'application/json',
  'application/xml',
];

export const IMAGE_ATTACHMENT_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];

export const DENIED_ATTACHMENT_MIME_TYPES: readonly string[] = ['image/svg+xml', 'image/svg'];

export const DENIED_ATTACHMENT_EXTENSIONS: readonly string[] = ['svg', 'svgz'];

export const IMAGE_ATTACHMENT_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
];

export const TEXT_ATTACHMENT_EXTENSIONS: readonly string[] = [
  'txt',
  'md',
  'csv',
  'json',
  'xml',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rs',
  'go',
  'java',
  'html',
  'css',
];

export const ALLOWED_ATTACHMENT_EXTENSIONS: readonly string[] = [
  ...IMAGE_ATTACHMENT_EXTENSIONS,
  'pdf',
  ...TEXT_ATTACHMENT_EXTENSIONS,
];

export const ALLOWED_ATTACHMENT_ACCEPT = [
  ...IMAGE_ATTACHMENT_MIME_TYPES,
  'application/pdf',
  'text/*',
  'application/json',
  'application/xml',
  ...ALLOWED_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

export type AttachmentValidation =
  | { ok: true }
  | { ok: false; reason: 'too-large' | 'unsupported-type' | 'empty'; message: string };

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

export function validateAttachmentMeta(
  name: string,
  mimeType: string,
  byteCount: number,
): AttachmentValidation {
  if (byteCount === 0) {
    return {
      ok: false,
      reason: 'empty',
      message: `${name} is empty.`,
    };
  }
  if (byteCount > MAX_ATTACHMENT_BYTES) {
    const limitMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    return {
      ok: false,
      reason: 'too-large',
      message: `${name} is larger than the ${limitMb} MiB attachment limit.`,
    };
  }
  const mime = (mimeType ?? '').split(';', 1)[0]!.trim().toLowerCase();
  const ext = fileExtension(name);
  const unsupported: AttachmentValidation = {
    ok: false,
    reason: 'unsupported-type',
    message: `${name} (${mime || 'unknown type'}) is not an accepted attachment type.`,
  };
  if (DENIED_ATTACHMENT_MIME_TYPES.includes(mime) || DENIED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return unsupported;
  }
  const mimeAllowed =
    mime.length > 0 &&
    (IMAGE_ATTACHMENT_MIME_TYPES.includes(mime) ||
      ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)));
  const extAllowed = ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext);
  if (!mimeAllowed && !extAllowed) {
    return unsupported;
  }
  return { ok: true };
}

export function validateAttachmentFile(file: File): AttachmentValidation {
  return validateAttachmentMeta(file.name, file.type, file.size);
}

export interface SignedUploadRequest {
  name: string;
  mimeType: string;
  size: number;
  sha256?: string;
}

export interface SignedUploadResponse {
  attachmentId: string;
  uploadUrl: string;
  uploadMethod: 'PUT' | 'POST';
  uploadHeaders?: Record<string, string>;
  expiresAt: string;
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
