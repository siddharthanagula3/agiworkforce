/**
 * Shared conversation and message contracts for the AGI Workforce platform.
 *
 * These types define the cross-surface contract for conversations, messages,
 * artifacts, and runtime activity. Each surface may extend these with
 * surface-specific fields (e.g., desktop uses numeric IDs from SQLite,
 * mobile uses string IDs from the API).
 *
 * ## ID strategy
 *
 * The shared contract uses `string` for all identifiers (`ConversationId`,
 * `MessageId`, `ActionId`). This is the lowest-common-denominator type that
 * works across all surfaces:
 *   - **Web / Mobile / Extension**: UUIDs from Supabase (already strings).
 *   - **Desktop**: SQLite autoincrement integers. The desktop surface widens
 *     its local types to `string | number` and coerces at the boundary.
 *
 * Branded type aliases are provided so that call sites self-document which
 * kind of identifier they carry, but at runtime these are plain strings.
 *
 * ## Stability notes
 *
 * **Stable (shared now)**:
 *   - ConversationId, MessageId, ActionId (branded string aliases)
 *   - MessageRole, MessageKind, MessageStatus, ActionStatus
 *   - ConversationBase, MessageBase
 *   - ArtifactType, ArtifactBase
 *   - ApprovalRequestBase, RiskLevel
 *   - ToolCallStatus, RuntimeActivityStep
 *   - FileAttachmentBase
 *
 * **Unstable (remain surface-local for now)**:
 *   - Desktop: ToolCallUI, ToolResultUI, ToolExecutionWorkflow
 *   - Mobile: StreamChunk, ImageGen fields
 *   - Web: ResearchTask, ResearchStep
 *
 * Canonical source: this file.
 */

// ============================================================================
// Branded ID Types
// ============================================================================

/**
 * Opaque brand tag for branded ID types.
 *
 * Usage: `ConversationId` is structurally `string` but nominally distinct from
 * `MessageId` — TypeScript will warn if you accidentally swap them.
 */
declare const __brand: unique symbol;

/**
 * Branded string alias for conversation identifiers.
 *
 * - Web / Mobile / Extension: UUID from Supabase.
 * - Desktop: Stringified SQLite autoincrement integer.
 */
export type ConversationId = string & { readonly [__brand]: 'ConversationId' };

/**
 * Branded string alias for message identifiers.
 *
 * - Web / Mobile / Extension: UUID from Supabase.
 * - Desktop: Stringified SQLite integer or a `msg-*` prefixed string.
 */
export type MessageId = string & { readonly [__brand]: 'MessageId' };

/**
 * Branded string alias for action identifiers.
 *
 * Actions represent discrete units of agent work (tool calls, agent actions,
 * MCP requests) within a conversation. Each action belongs to a message.
 */
export type ActionId = string & { readonly [__brand]: 'ActionId' };

// ============================================================================
// Enums — Message Kind, Status, Action Status
// ============================================================================

/**
 * The kind (content type) of a message.
 *
 * Surfaces may not support all kinds. Unknown kinds should be rendered as
 * `'text'` with a fallback indicator.
 */
export type MessageKind =
  /** Plain text or markdown content. */
  | 'text'
  /** An image attachment or generated image. */
  | 'image'
  /** A tool call request from the assistant. */
  | 'tool_call'
  /** A tool result returned to the assistant. */
  | 'tool_result'
  /** A system-generated notification (not from user or model). */
  | 'system'
  /** An agent status update (thinking, searching, etc.). */
  | 'status'
  /** An artifact (code, document, chart, etc.) delivered inline. */
  | 'artifact';

/**
 * Lifecycle status of a message.
 *
 * Messages progress through these states linearly. Once a message reaches
 * `'delivered'` or `'error'`, it does not transition further.
 */
export type MessageStatus =
  /** Message is being composed or queued locally. */
  | 'pending'
  /** Message is being sent to the backend / model. */
  | 'sending'
  /** Message content is actively streaming from the model. */
  | 'streaming'
  /** Message has been fully received and persisted. */
  | 'delivered'
  /** Message failed to send or stream. */
  | 'error';

/**
 * Lifecycle status of an agent action (tool call, MCP request, etc.).
 *
 * Matches the status vocabulary used in database.ts `AgentActionStatus` and
 * runtime.ts `RuntimeActivityStatus`, establishing a single canonical set.
 */
export type ActionStatus =
  /** Action is queued but has not started executing. */
  | 'pending'
  /** Action is currently executing. */
  | 'running'
  /** Action finished successfully. */
  | 'completed'
  /** Action finished with an error. */
  | 'failed'
  /** Action was cancelled before completion. */
  | 'cancelled';

// ============================================================================
// Existing Stable Types
// ============================================================================

/** Roles a message can have in a conversation. */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Artifact types produced by AI models.
 *
 * Superset of all surface variants. Not all surfaces support all types.
 */
export type ArtifactType =
  | 'code'
  | 'react'
  | 'chart'
  | 'diagram'
  | 'table'
  | 'mermaid'
  | 'spreadsheet'
  | 'presentation'
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'music'
  | 'search'
  | 'document'
  | 'markdown'
  | 'json'
  | 'csv'
  | 'svg'
  | 'email'
  | 'research';

/** Core artifact shape shared across all surfaces. */
export interface ArtifactBase {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

/** Risk level for tool approval requests. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Tool approval request — shared contract for desktop and mobile. */
export interface ApprovalRequestBase {
  id: string;
  toolName: string;
  description: string;
  riskLevel: RiskLevel;
  status: 'pending' | 'approved' | 'rejected';
}

/** Status of a tool call execution. */
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Runtime activity step displayed in the transcript.
 *
 * Used by both desktop (inline activity) and mobile (status steps)
 * to show agentic loop progress.
 */
export interface RuntimeActivityStep {
  id: string;
  icon?: string;
  message: string;
  detail?: string;
  progress?: number;
  status: 'running' | 'completed' | 'failed';
}

/**
 * File attachment — shared shape for message attachments.
 */
export interface FileAttachmentBase {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

// ============================================================================
// Base Conversation Interface
// ============================================================================

/**
 * Minimal conversation shape shared across all surfaces.
 *
 * Each surface extends this with surface-specific fields. For example:
 *
 * ```typescript
 * // Desktop (apps/desktop/src/types/chat.ts)
 * // Uses Omit to replace the branded ConversationId with SQLite number id
 * interface Conversation extends Omit<ConversationBase, 'id'> {
 *   id: number;  // SQLite autoincrement
 *   custom_instructions?: string;
 * }
 *
 * // Web (apps/web/shared/stores/chat-store.ts)
 * interface Conversation extends ConversationBase {
 *   messages: Message[];
 *   model: string;
 *   settings: { temperature: number; ... };
 * }
 * ```
 */
export interface ConversationBase {
  /** Unique conversation identifier. */
  id: ConversationId;

  /** Human-readable conversation title. */
  title: string;

  /** ISO 8601 timestamp when the conversation was created. */
  created_at: string;

  /** ISO 8601 timestamp when the conversation was last modified. */
  updated_at: string;
}

// ============================================================================
// Base Message Interface
// ============================================================================

/**
 * Minimal message shape shared across all surfaces.
 *
 * Each surface extends this with surface-specific fields. For example:
 *
 * ```typescript
 * // Desktop (apps/desktop/src/types/chat.ts)
 * interface Message extends MessageBase {
 *   id: number;  // SQLite autoincrement — widened from MessageId
 *   tokens?: number;
 *   tool_calls?: ToolCallUI[];
 * }
 *
 * // Mobile (apps/mobile/types/chat.ts)
 * interface ChatMessage extends MessageBase {
 *   reasoning?: string;
 *   imageUrl?: string;
 *   isStreaming?: boolean;
 * }
 * ```
 */
export interface MessageBase {
  /** Unique message identifier. */
  id: MessageId;

  /** Conversation this message belongs to. */
  conversation_id: ConversationId;

  /** Who produced this message. */
  role: MessageRole;

  /** The message content (text, markdown, serialized artifact, etc.). */
  content: string;

  /** Content type of the message payload. Defaults to `'text'` if absent. */
  kind?: MessageKind;

  /** Lifecycle status of this message. Defaults to `'delivered'` if absent. */
  status?: MessageStatus;

  /** ISO 8601 timestamp when the message was created. */
  created_at: string;

  /** Model used to generate this message (null for user messages). */
  model?: string;

  /** Provider that served the model (null for user messages). */
  provider?: string;
}

// ============================================================================
// Base Action Interface
// ============================================================================

/**
 * Minimal action shape shared across all surfaces.
 *
 * An action represents a discrete unit of agent work — a tool call, an MCP
 * request, a file operation, etc. Actions belong to a message and carry their
 * own lifecycle status.
 *
 * Corresponds to `vibe_agent_actions` in the database schema.
 */
export interface ActionBase {
  /** Unique action identifier. */
  id: ActionId;

  /** Message that triggered this action. */
  message_id: MessageId;

  /** Conversation this action belongs to (denormalized for query convenience). */
  conversation_id: ConversationId;

  /** Freeform action type string (e.g., `"tool_call"`, `"mcp_request"`). */
  action_type: string;

  /** Lifecycle status of this action. */
  status: ActionStatus;

  /** ISO 8601 timestamp when the action was created. */
  created_at: string;

  /** ISO 8601 timestamp when the action completed (null while running). */
  completed_at?: string;

  /** Error message when status is `'failed'`. */
  error?: string;
}
