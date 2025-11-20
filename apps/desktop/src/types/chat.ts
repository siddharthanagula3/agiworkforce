// Types matching Rust backend models

import type { ToolCallUI, ToolResultUI, ToolExecutionWorkflow } from './toolCalling';
import type { TaskMetadata } from '../lib/taskMetadata';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  tokens?: number;
  cost?: number;
  created_at: string; // ISO date string from Rust
  artifacts?: Artifact[];
  attachments?: FileAttachment[];
  tool_calls?: ToolCallUI[]; // AI function/tool calls
  tool_results?: ToolResultUI[]; // Results from tool executions
  workflow?: ToolExecutionWorkflow; // Multi-step agent workflow
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string; // ISO date string from Rust
  updated_at: string; // ISO date string from Rust
}

export interface ConversationStats {
  message_count: number;
  total_tokens: number;
  total_cost: number;
}

// Artifact types
export type ArtifactType = 'code' | 'chart' | 'diagram' | 'table' | 'mermaid';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string;
  language?: string; // For code artifacts
  metadata?: Record<string, unknown>; // For charts, diagrams, etc.
}

// File attachment types
export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string; // MIME type
  url?: string; // For uploaded files
  data?: string; // Base64 data for previews
  uploadProgress?: number;
  error?: string;
}

export type SupportedFileType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/svg+xml'
  | 'application/pdf'
  | 'text/plain'
  | 'text/csv'
  | 'application/json'
  | 'text/javascript'
  | 'text/typescript'
  | 'text/html'
  | 'text/css'
  | 'text/markdown';

// Request/Response types for Tauri commands

export interface CreateConversationRequest {
  title: string;
}

export interface CreateMessageRequest {
  conversation_id: number;
  role: string;
  content: string;
  tokens?: number;
  cost?: number;
  artifacts?: Artifact[];
  attachments?: FileAttachment[];
}

export interface UpdateConversationRequest {
  title: string;
}

export interface ChatRoutingPreferences {
  provider?: string | undefined;
  model?: string | undefined;
  strategy?: string | undefined;
  costPriority?: 'low' | 'balanced';
}

export interface ChatSendMessageRequest extends ChatRoutingPreferences {
  conversationId?: number | null;
  content: string;
  stream?: boolean;
  workflowHash?: string;
  taskMetadata?: TaskMetadata;
  providerOverride?: string;
  modelOverride?: string;
  enableTools?: boolean;
  conversationMode?: 'safe' | 'full_control';
}

export interface ChatSendMessageResponse {
  conversation: Conversation;
  user_message: Message;
  assistant_message: Message;
  stats: ConversationStats;
  last_message: string | null;
}

// Frontend-specific types (extends backend types)

export interface MessageUI extends Message {
  timestamp: Date; // Converted from created_at
  streaming?: boolean;
  // tool_calls, tool_results, and workflow inherited from Message
}

export interface ConversationUI extends Conversation {
  lastMessage?: string | undefined;
  messageCount: number;
  updatedAt: Date; // Converted from updated_at
  pinned?: boolean;
  unreadCount?: number;
}

export interface CostOverviewResponse {
  today_total: number;
  month_total: number;
  monthly_budget?: number | null;
  remaining_budget?: number | null;
}

export interface CostTimeseriesPoint {
  date: string;
  total_cost: number;
}

export interface ProviderCostBreakdown {
  provider: string;
  total_cost: number;
}

export interface ConversationCostBreakdown {
  conversation_id: number;
  title: string;
  total_cost: number;
}

export interface CostAnalyticsResponse {
  timeseries: CostTimeseriesPoint[];
  providers: ProviderCostBreakdown[];
  top_conversations: ConversationCostBreakdown[];
}

export interface ChatStreamStartPayload {
  conversationId: number;
  messageId: number;
  createdAt: string;
}

export interface ChatStreamChunkPayload {
  conversationId: number;
  messageId: number;
  delta: string;
  content: string;
}

export interface ChatStreamEndPayload {
  conversationId: number;
  messageId: number;
}
