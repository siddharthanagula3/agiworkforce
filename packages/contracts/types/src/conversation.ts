import { RUN_STATUS_LABELS } from './cross-device';
import type { LifecycleStatus, WorkLifecycleStatus } from './lifecycle-status';

declare const __brand: unique symbol;

export type ConversationId = string & { readonly [__brand]: 'ConversationId' };

export type MessageId = string & { readonly [__brand]: 'MessageId' };

export type ActionId = string & { readonly [__brand]: 'ActionId' };

/**
 * The block kinds a conversation can carry. A client publishes the subset it
 * renders, so a kind added here reaches an older build as an unknown block it
 * degrades rather than as an empty bubble.
 */
export const MESSAGE_KINDS = [
  'text',
  /** Prose the sender marked up, which a plain-text client renders as its source. */
  'markdown',
  /** A source listing with a language, distinct from an artifact the reader can edit. */
  'code',
  /** An image attachment or generated image. */
  'image',
  /** A recording or a spoken reply, with a transcript for a client that cannot play it. */
  'audio',
  'video',
  /** A file the sender attached, carried by reference rather than by value. */
  'file',
  /** A file this turn produced, addressable after the turn by its own id. */
  'generated_file',
  /** A reference to a source, which a client that cannot render it shows as a link. */
  'citation',
  /** A request for the reader to allow or refuse an action before it runs. */
  'approval',
  /** A failure the reader is meant to see, as opposed to one the transcript swallows. */
  'error',
  /** A place or a route, which degrades to its address rather than to an empty frame. */
  'location',
  /** A typed payload with a schema, for a reader that does something with it. */
  'structured_data',
  'table',
  'chart',
  /** A summary the model wrote of how it reached the answer, never the raw trace. */
  'reasoning',
  /** What the model did in a browser, kept separate from the tool call that drove it. */
  'browser_action',
  /** What the model did on the machine, kept separate from the tool call that drove it. */
  'computer_action',
  /** A tool call request from the assistant. */
  'tool_call',
  /** A tool result returned to the assistant. */
  'tool_result',
  /** A system-generated notification (not from user or model). */
  'system',
  /** An agent status update (thinking, searching, etc.). */
  'status',
  /** An artifact (code, document, chart, etc.) delivered inline. */
  'artifact',
] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];

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

export const TURN_COMPLETION_STATUSES = ['complete', 'truncated'] as const;

export type TurnCompletionStatus = (typeof TURN_COMPLETION_STATUSES)[number];

/** The routing decision a turn was admitted under, before any failover moved it. */
export interface AssistantTurnRequestedRoute {
  lane: string | null;
  slot: string | null;
  taskType: string | null;
  planId: string | null;
}

/** The route that actually answered, which differs from the requested one after failover. */
export interface AssistantTurnServedRoute {
  provider: string;
  harnessId: string | null;
  usedFallback: boolean;
  fallbackReason: string | null;
  movedFromModel: string | null;
  retries: number;
}

export interface AssistantTurnReasoningProfile {
  thinking: boolean;
  effort: string | null;
  budgetTokens: number | null;
}

/**
 * `observed` is what the turn's own loop reported; `evidenced` is what the
 * persisted row can still prove ran once the loop is gone.
 */
export interface AssistantTurnToolInvocations {
  offered: readonly string[];
  observed: boolean;
  evidenced: readonly string[];
}

/**
 * How a persisted assistant turn was served. Every field is written on every
 * turn, so a reader never has to tell absent from did not happen.
 */
export interface AssistantTurnAttribution {
  completionStatus: TurnCompletionStatus;
  requestedModel: string;
  servedModel: string;
  requestedRoute: AssistantTurnRequestedRoute;
  servedRoute: AssistantTurnServedRoute;
  reasoningProfile: AssistantTurnReasoningProfile;
  toolInvocations: AssistantTurnToolInvocations;
}

export const ASSISTANT_TURN_ATTRIBUTION_KEYS = [
  'completionStatus',
  'requestedModel',
  'servedModel',
  'requestedRoute',
  'servedRoute',
  'reasoningProfile',
  'toolInvocations',
] as const satisfies readonly (keyof AssistantTurnAttribution)[];

export type AssistantTurnAttributionKey = (typeof ASSISTANT_TURN_ATTRIBUTION_KEYS)[number];

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
