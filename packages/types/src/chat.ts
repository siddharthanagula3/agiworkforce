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
// conversation.ts via the barrel. No re-export here to avoid duplicates.

// ============================================================================
// ChatMessage
// ============================================================================

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
 *   model: 'claude-opus-4.8',
 *   provider: 'anthropic',
 *   createdAt: '2026-03-15T10:30:00Z',
 *   tokenCount: 512,
 * };
 * ```
 */
export interface ChatMessage {
  /** Unique message identifier. */
  id: string;

  /** Conversation this message belongs to. */
  conversationId: string;

  /** Who produced this message. */
  role: MessageRole;

  /** The message content (text, markdown, serialized artifact, etc.). */
  content: string;

  /** Content type of the message payload. Defaults to `'text'` if absent. */
  kind?: MessageKind;

  /** Lifecycle status of this message. Defaults to `'delivered'` if absent. */
  status?: MessageStatus;

  /** ISO 8601 timestamp when the message was created. */
  createdAt: string;

  /** Model used to generate this message (null for user messages). */
  model?: string;

  /** Provider that served the model (null for user messages). */
  provider?: string;

  /** Number of tokens in this message. */
  tokenCount?: number;

  /** Cost in USD for generating this message. */
  cost?: number;

  /** Thinking / reasoning content from the model, if any. */
  reasoning?: string;

  /** Whether this message is currently streaming tokens from the model. */
  isStreaming?: boolean;

  /** File attachments associated with this message. */
  attachments?: ChatAttachment[];

  /** Structured artifacts generated inline with the message. */
  artifacts?: ArtifactBase[];

  /** Arbitrary metadata. */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ChatAttachment
// ============================================================================

/**
 * A file or media attachment on a chat message.
 */
export interface ChatAttachment {
  /** Unique attachment identifier. */
  id: string;

  /** Display file name. */
  name: string;

  /** File size in bytes. */
  size: number;

  /** MIME type (e.g., `"image/png"`, `"application/pdf"`). */
  mimeType: string;

  /** URL to access the attachment (may be a blob URL or remote URL). */
  url?: string;
}

// ============================================================================
// Attachment validation
// ============================================================================

/**
 * Hard cap on per-attachment size accepted by the composer. Above this, the
 * payload bloats the prompt budget on local providers and triggers gateway
 * 413s on cloud providers. Round-2 audit P0 #4 (2026-05-21).
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MiB

/**
 * Explicit MIME prefixes accepted as inline attachments. Anything outside
 * this set is rejected at the composer before it ever reaches a provider.
 */
export const ALLOWED_ATTACHMENT_MIME_PREFIXES: readonly string[] = [
  'image/',
  'application/pdf',
  'text/',
  'application/json',
  'application/xml',
];

/**
 * File-extension fallback for files whose MIME type the browser reports as
 * an empty string (rare on macOS Drag from Finder). Mirrors the existing
 * `<input accept>` list.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
  'pdf',
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

/**
 * Single source of truth for the `<input accept="...">` value used by every
 * file-picker in the composer. Keeps the picker, drag-drop, and paste paths
 * accepting exactly the same set.
 */
export const ALLOWED_ATTACHMENT_ACCEPT =
  'image/*,application/pdf,text/*,application/json,application/xml,' +
  ALLOWED_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/**
 * Result of validating a candidate attachment file. Composers should surface
 * the `reason` to the user when `ok` is false.
 */
export type AttachmentValidation =
  | { ok: true }
  | { ok: false; reason: 'too-large' | 'unsupported-type' | 'empty'; message: string };

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Validate a candidate File against the attachment contract. Returns
 * `{ ok: true }` when the file is accepted; otherwise a structured rejection
 * with a user-presentable message.
 *
 * Validation order is fixed (empty → too-large → unsupported) so callers can
 * rely on the first-failure being the most-actionable for the user.
 */
export function validateAttachmentFile(file: File): AttachmentValidation {
  if (file.size === 0) {
    return {
      ok: false,
      reason: 'empty',
      message: `${file.name} is empty.`,
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const limitMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    return {
      ok: false,
      reason: 'too-large',
      message: `${file.name} is larger than the ${limitMb} MiB attachment limit.`,
    };
  }
  const mime = (file.type ?? '').toLowerCase();
  const mimeAllowed =
    mime.length > 0 && ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  const extAllowed = ALLOWED_ATTACHMENT_EXTENSIONS.includes(fileExtension(file.name));
  if (!mimeAllowed && !extAllowed) {
    return {
      ok: false,
      reason: 'unsupported-type',
      message: `${file.name} (${mime || 'unknown type'}) is not an accepted attachment type.`,
    };
  }
  return { ok: true };
}

// ============================================================================
// Signed-URL upload contract (Cloud Managed only — waitlist-gated in v1)
// ============================================================================

/**
 * Request a server-signed upload URL for an attachment. Used when AGI's
 * Cloud Managed plan is active so large attachments don't traverse the
 * websocket/http chat request body. v1 Local-only does NOT use this path —
 * the contract is defined here so consumer surfaces can compile against it
 * before the Cloud Managed waitlist opens.
 */
export interface SignedUploadRequest {
  /** Filename as it should be presented in the UI (not the storage key). */
  name: string;
  /** Browser-reported MIME type. */
  mimeType: string;
  /** Byte size, must be <= MAX_ATTACHMENT_BYTES. */
  size: number;
  /** Optional SHA-256 hex digest for end-to-end integrity verification. */
  sha256?: string;
}

/**
 * Server response carrying a one-shot signed upload URL plus the canonical
 * attachment id the client should reference after the upload completes.
 */
export interface SignedUploadResponse {
  /** Canonical attachment id; round-trip with subsequent chat messages. */
  attachmentId: string;
  /** Pre-signed PUT (or POST) URL the client uses to upload the bytes. */
  uploadUrl: string;
  /** HTTP method to use against `uploadUrl` (usually `"PUT"`). */
  uploadMethod: 'PUT' | 'POST';
  /** Optional headers the server requires (`Content-Type`, x-amz-* etc). */
  uploadHeaders?: Record<string, string>;
  /** Wall-clock expiry, ISO 8601 — clients should not retry past this. */
  expiresAt: string;
}

// ============================================================================
// Conversation
// ============================================================================

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
 *   model: 'claude-opus-4.8',
 *   provider: 'anthropic',
 *   messageCount: 12,
 *   createdAt: '2026-03-15T10:00:00Z',
 *   updatedAt: '2026-03-15T10:30:00Z',
 * };
 * ```
 */
export interface Conversation {
  /** Unique conversation identifier. */
  id: string | ConversationId;

  /** Human-readable conversation title. */
  title: string;

  /** LLM model used in this conversation. */
  model?: string;

  /** LLM provider used in this conversation. */
  provider?: string;

  /** Number of messages in this conversation. */
  messageCount?: number;

  /** ISO 8601 timestamp when the conversation was created. */
  createdAt: string;

  /** ISO 8601 timestamp when the conversation was last modified. */
  updatedAt: string;

  /** Custom system instructions for this conversation. */
  customInstructions?: string;

  /** Tags for organization and filtering. */
  tags?: string[];

  /** Arbitrary metadata. */
  metadata?: Record<string, unknown>;
}
