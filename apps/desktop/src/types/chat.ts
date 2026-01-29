import type { TaskMetadata } from '../lib/taskMetadata';
import type { ToolCallUI, ToolExecutionWorkflow, ToolResultUI } from './toolCalling';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
  input_cost?: number;
  output_cost?: number;
  model?: string;
  provider?: string;
  created_at: string;
  artifacts?: Artifact[];
  attachments?: FileAttachment[];
  tool_calls?: ToolCallUI[];
  tool_results?: ToolResultUI[];
  workflow?: ToolExecutionWorkflow;
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  /** Per-conversation custom instructions that override global instructions */
  custom_instructions?: string;
}

export interface ConversationStats {
  message_count: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

export type ArtifactType =
  | 'code'
  | 'chart'
  | 'diagram'
  | 'table'
  | 'mermaid'
  | 'spreadsheet'
  | 'presentation'
  | 'html'
  | 'image';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  data?: string;
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

export interface CreateConversationRequest {
  title: string;
}

export interface CreateMessageRequest {
  conversation_id: number;
  role: string;
  content: string;
  tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
  input_cost?: number;
  output_cost?: number;
  model?: string;
  provider?: string;
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
  conversationMode?: 'auto' | 'manual';
  /** Custom instructions to include in the system prompt */
  customInstructions?: string;
}

export interface CreditsInfo {
  cost_cents: number;
  remaining_cents: number;
  daily_limit?: number;
  daily_used?: number;
  daily_remaining?: number;
  daily_reset_at?: string;
}

export interface ChatSendMessageResponse {
  conversation: Conversation;
  user_message: Message;
  assistant_message: Message;
  stats: ConversationStats;
  last_message: string | null;
  credits?: CreditsInfo | null;
}

export interface MessageUI extends Message {
  timestamp: Date;
  streaming?: boolean;
}

export interface ConversationUI extends Conversation {
  lastMessage?: string | undefined;
  messageCount: number;
  updatedAt: Date;
  pinned?: boolean;
  unreadCount?: number;
  /** Per-conversation custom instructions */
  customInstructions?: string;
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

export interface ResearchStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp?: number;
  details?: string;
}

export interface ResearchTask {
  id: string;
  query: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
  steps: ResearchStep[];
  findings: string[];
  sources: { title: string; url: string; domain?: string }[];
  timeElapsed?: string;
  timeRemaining?: string;
}
