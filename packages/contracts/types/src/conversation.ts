import { RUN_STATUS_LABELS } from './cross-device';
import type { LifecycleStatus, WorkLifecycleStatus } from './lifecycle-status';

declare const __brand: unique symbol;

export type ConversationId = string & { readonly [__brand]: 'ConversationId' };

export type MessageId = string & { readonly [__brand]: 'MessageId' };

export type ActionId = string & { readonly [__brand]: 'ActionId' };

export type MessageKind =
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

export type MessageStatus =
  | 'pending'
  /** Message is being sent to the backend / model. */
  | 'sending'
  /** Message content is actively streaming from the model. */
  | 'streaming'
  /** Message has been fully received and persisted. */
  | 'delivered'
  /** Message failed to send or stream. */
  | 'error';

export type ActionStatus = WorkLifecycleStatus;

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type ArtifactType =
  | 'code'
  | 'react'
  | 'component'
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

export interface ArtifactBase {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string;
  language?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  conversationId?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequestBase {
  id: string;
  toolName: string;
  description: string;
  riskLevel: RiskLevel;
  status: 'pending' | 'approved' | 'rejected';
}

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

export const TOOL_CALL_STATUS_LABELS = Object.freeze({
  pending: RUN_STATUS_LABELS.queued,
  running: RUN_STATUS_LABELS.running,
  awaiting_approval: 'Waiting for approval',
  completed: RUN_STATUS_LABELS.completed,
  failed: RUN_STATUS_LABELS.failed,
  cancelled: RUN_STATUS_LABELS.cancelled,
});

export type ToolCallDisplayStatus = keyof typeof TOOL_CALL_STATUS_LABELS;

export function toolCallStatusLabel(status: ToolCallDisplayStatus): string {
  return TOOL_CALL_STATUS_LABELS[status];
}

export const RUNTIME_ACTIVITY_STEP_STATUSES = [
  'running',
  'completed',
  'failed',
] as const satisfies readonly LifecycleStatus[];

export type RuntimeActivityStepStatus = (typeof RUNTIME_ACTIVITY_STEP_STATUSES)[number];

export interface RuntimeActivityStep {
  id: string;
  icon?: string;
  message: string;
  detail?: string;
  progress?: number;
  status: RuntimeActivityStepStatus;
}

export interface FileAttachmentBase {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

export interface ConversationBase {
  id: ConversationId;

  title: string;

  created_at: string;

  updated_at: string;
}

export interface MessageBase {
  id: MessageId;

  conversation_id: ConversationId;

  role: MessageRole;

  content: string;

  kind?: MessageKind;

  status?: MessageStatus;

  created_at: string;

  model?: string;

  provider?: string;
}

export const RETRIEVED_HISTORY_SOURCES = [
  'conversation',
  'artifact',
  'research_report',
  'project_knowledge',
  'developer_session',
] as const;

export type RetrievedHistorySource = (typeof RETRIEVED_HISTORY_SOURCES)[number];

/**
 * One passage of the account's own history that was retrieved for a turn. The
 * shared shape exists so a surface can cite what it read back without each
 * surface inventing its own citation type.
 */
export interface RetrievedHistoryPassage {
  source: RetrievedHistorySource;
  sourceId: string;
  title: string;
  snippet: string;
  score: number;
  messageId?: MessageId;
  indexedAt: string | null;
}

export interface RetrievedHistory {
  query: string;
  passages: readonly RetrievedHistoryPassage[];
  /** True when the retriever stopped at its candidate ceiling, not at the end. */
  truncated: boolean;
}

export const CONVERSATION_DERIVED_STATE_KINDS = [
  'title',
  'summary',
  'search_index',
  'embedding',
  'retrieved_history',
] as const;

export type ConversationDerivedStateKind = (typeof CONVERSATION_DERIVED_STATE_KINDS)[number];

export type DerivedStateRegeneration =
  'on_write' | 'on_read_if_missing' | 'scheduled' | 'manual' | 'per_request';

export type DerivedStateDeletionPropagation =
  'foreign_key_cascade' | 'background_job' | 'not_stored';

/**
 * Every piece of state derived from a conversation, with the two answers a
 * derived value must have: how it is rebuilt, and what removes it when the
 * source is deleted. A kind with neither is an orphan waiting to happen.
 */
export interface ConversationDerivedStateDescriptor {
  kind: ConversationDerivedStateKind;
  regeneratedBy: DerivedStateRegeneration;
  deletionPropagation: DerivedStateDeletionPropagation;
}

export const CONVERSATION_DERIVED_STATE: Readonly<
  Record<ConversationDerivedStateKind, ConversationDerivedStateDescriptor>
> = Object.freeze({
  title: {
    kind: 'title',
    regeneratedBy: 'on_read_if_missing',
    deletionPropagation: 'foreign_key_cascade',
  },
  summary: {
    kind: 'summary',
    regeneratedBy: 'on_write',
    deletionPropagation: 'foreign_key_cascade',
  },
  search_index: {
    kind: 'search_index',
    regeneratedBy: 'on_write',
    deletionPropagation: 'foreign_key_cascade',
  },
  embedding: {
    kind: 'embedding',
    regeneratedBy: 'scheduled',
    deletionPropagation: 'background_job',
  },
  retrieved_history: {
    kind: 'retrieved_history',
    regeneratedBy: 'per_request',
    deletionPropagation: 'not_stored',
  },
});

export interface ActionBase {
  id: ActionId;

  message_id: MessageId;

  conversation_id: ConversationId;

  action_type: string;

  status: ActionStatus;

  created_at: string;

  completed_at?: string;

  error?: string;
}
