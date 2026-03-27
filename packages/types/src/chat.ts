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
 *   model: 'claude-opus-4-6',
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
 *   model: 'claude-opus-4-6',
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
