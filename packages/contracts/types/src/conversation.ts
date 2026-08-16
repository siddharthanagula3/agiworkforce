

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

export type ActionStatus =
  | 'pending'
  /** Action is currently executing. */
  | 'running'
  /** Action finished successfully. */
  | 'completed'
  /** Action finished with an error. */
  | 'failed'
  /** Action was cancelled before completion. */
  | 'cancelled';

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

export interface RuntimeActivityStep {
  id: string;
  icon?: string;
  message: string;
  detail?: string;
  progress?: number;
  status: 'running' | 'completed' | 'failed';
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
