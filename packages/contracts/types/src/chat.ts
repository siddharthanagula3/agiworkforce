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
 *   model: selectedModel.id,
 *   provider: selectedModel.provider,
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
 * this set — or outside `IMAGE_ATTACHMENT_MIME_TYPES`, which images are
 * matched against by exact type rather than by prefix — is rejected at the
 * composer before it ever reaches a provider.
 */
export const ALLOWED_ATTACHMENT_MIME_PREFIXES: readonly string[] = [
  'application/pdf',
  'text/',
  'application/json',
  'application/xml',
];

/**
 * Raster image types accepted as attachments.
 *
 * Deliberately an explicit roster rather than an `image/` prefix. SVG is
 * markup, not a raster image: it carries `<script>`, inline event handlers,
 * and `<foreignObject>`, and object storage hands an upload back under the
 * Content-Type the client declared at presign time. An accepted SVG is
 * therefore stored XSS on the storage origin — reachable the moment the
 * browser's direct PUT lands, before any server-side step runs.
 */
export const IMAGE_ATTACHMENT_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];

/**
 * Types and extensions refused ahead of every allowlist. Checked first because
 * the same SVG bytes also arrive as `text/xml` or `application/xml`, both of
 * which a prefix in `ALLOWED_ATTACHMENT_MIME_PREFIXES` matches.
 */
export const DENIED_ATTACHMENT_MIME_TYPES: readonly string[] = ['image/svg+xml', 'image/svg'];

export const DENIED_ATTACHMENT_EXTENSIONS: readonly string[] = ['svg', 'svgz'];

/**
 * File-extension fallback for files whose MIME type the browser reports as
 * an empty string (rare on macOS Drag from Finder). Mirrors the existing
 * `<input accept>` list.
 */
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

/**
 * Single source of truth for the `<input accept="...">` value used by every
 * file-picker in the composer. Keeps the picker, drag-drop, and paste paths
 * accepting exactly the same set — the image types are spelled out rather than
 * globbed as `image/*` so the picker never offers a file the validator below
 * will refuse.
 */
export const ALLOWED_ATTACHMENT_ACCEPT = [
  ...IMAGE_ATTACHMENT_MIME_TYPES,
  'application/pdf',
  'text/*',
  'application/json',
  'application/xml',
  ...ALLOWED_ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

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
 * True when an accepted attachment is safe to decode as UTF-8 text. MIME wins
 * for known binary/text types; the shared extension roster is the fallback
 * when Finder or a browser reports an empty/generic MIME type.
 */
export function isTextAttachmentMeta(name: string, mimeType: string): boolean {
  const mime = (mimeType ?? '').split(';', 1)[0]!.trim().toLowerCase();
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
    return true;
  }
  if (mime.startsWith('image/') || mime === 'application/pdf') return false;
  return TEXT_ATTACHMENT_EXTENSIONS.includes(fileExtension(name));
}

/**
 * Core attachment-contract check on primitive fields. Shared by
 * `validateAttachmentFile` (browser `File`) and any server route that only
 * has `{ fileName, mimeType, byteCount }` from a JSON body and shouldn't
 * materialize a `File`/`Blob` just to re-run this check.
 *
 * Validation order is fixed (empty → too-large → unsupported) so callers can
 * rely on the first-failure being the most-actionable for the user.
 */
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
  // Strip `; charset=…` before matching: an unstripped parameter defeats an
  // equality check while still satisfying a `startsWith` prefix, which is
  // exactly how a denied type would slip back in.
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

/**
 * Validate a candidate File against the attachment contract. Returns
 * `{ ok: true }` when the file is accepted; otherwise a structured rejection
 * with a user-presentable message.
 */
export function validateAttachmentFile(file: File): AttachmentValidation {
  return validateAttachmentMeta(file.name, file.type, file.size);
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
 *   model: selectedModel.id,
 *   provider: selectedModel.provider,
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
