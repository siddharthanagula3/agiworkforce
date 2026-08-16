

export type Status = 'idle' | 'loading' | 'success' | 'error';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ParticipantType = 'user' | 'agent' | 'system';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
  message?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
  hasMore?: boolean;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export interface MessageMetadata {
  model?: string;
  provider?: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  processingTime?: number;
  temperature?: number;
  maxTokens?: number;
  employeeId?: string;
  toolCalls?: ToolCall[];
  attachments?: Attachment[];
  thinkingProcess?: ThinkingStep[];
  reasoning?: string;
  status?: 'thinking' | 'working' | 'completed' | 'error';
  mode?: string;
  isThinking?: boolean;
  isSearching?: boolean;
  isToolProcessing?: boolean;
  isPinned?: boolean;
  employeeName?: string;
  employeeAvatar?: string;
  selectionReason?: string;
  thinkingSteps?: string[];
  toolType?: string;
  toolResult?: unknown;
  toolData?: unknown;
  imageUrl?: string;
  imageData?: unknown;
  videoUrl?: string;
  thumbnailUrl?: string;
  videoData?: unknown;
  searchResults?: unknown;
  documentTitle?: string;
  documentData?: unknown;
  downloadData?: { filename: string; content: string; contentType: string };
  [key: string]: unknown;
}

export interface BaseChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date | string;
  metadata?: MessageMetadata;
}

export interface SimpleChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  error?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    result?: unknown;
  }>;
}

export interface ChatMessage extends BaseChatMessage {
  sessionId?: string;
  conversationId?: string;
  senderId?: string;
  senderName?: string;
  senderType?: ParticipantType;
  deliveryStatus?: MessageDeliveryStatus;
  readBy?: string[];
  replyTo?: string;
  reactions?: MessageReaction[];
  isStreaming?: boolean;
  streamingComplete?: boolean;
  edited?: boolean;
  editCount?: number;
  error?: string;
  updatedAt?: Date | string;
}

export interface MissionChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: MCPToolCallInfo[];
  reasoning?: string;
  status?: 'thinking' | 'working' | 'completed' | 'error';
}

export interface MCPToolCallInfo {
  tool: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export interface ChatMessageRecord {
  id: string;
  session_id?: string;
  conversation_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  type?: string;
  arguments?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  result?: unknown;
  status: ToolCallStatus;
  error?: string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  timestamp?: Date | string;
  executionTime?: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'document' | 'audio' | 'video' | 'code' | string;
  size: number;
  url: string;
  mimeType?: string;
  thumbnailUrl?: string;
  uploadedAt?: Date | string;
}

export interface MessageReaction {
  type:
    | 'up'
    | 'down'
    | 'helpful'
    | 'creative'
    | 'accurate'
    | 'like'
    | 'unhelpful'
    | 'insightful'
    | 'flag'
    | 'bookmark';
  userId: string;
  timestamp: Date | string;
}

export interface ThinkingStep {
  id: string;
  step: number;
  description: string;
  reasoning?: string;
  timestamp: Date | string;
  duration?: number;
}

export interface Citation {
  id: string;
  title: string;
  url: string;
  description?: string;
  favicon?: string;
  snippet?: string;
  timestamp?: Date | string;
}

export interface ChatSession {
  id: string;
  title: string;
  summary?: string;
  preview?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  messageCount: number;
  tokenCount?: number;
  cost?: number;
  isPinned?: boolean;
  isArchived?: boolean;
  isStarred?: boolean;
  folder?: string;
  tags: string[];
  sharedLink?: string;
  participants: string[];
  metadata?: Record<string, unknown>;
}

export interface ChatSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
}

export interface TypingIndicator {
  participantId: string;
  participantName: string;
  conversationId: string;
  isTyping?: boolean;
  startedAt: Date | string;
}

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'perplexity'
  | 'grok'
  | 'deepseek'
  | 'qwen'
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'custom';

export type AIEmployeeStatus =
  | 'available'
  | 'busy'
  | 'offline'
  | 'working'
  | 'thinking'
  | 'idle'
  | 'maintenance';

export interface AIEmployeeBasic {
  id: string;
  name: string;
  role?: string;
  description: string;
  avatar?: string;
  color?: string;
  status?: AIEmployeeStatus;
  capabilities?: string[];
  tools?: string[];
}

export interface MarketplaceEmployee extends AIEmployeeBasic {
  category: string;
  provider: AIProvider;
  /** @deprecated Pricing removed · all agents are free to chat with */
  price?: number;
  /** @deprecated Pricing removed */
  originalPrice?: number;
  /** @deprecated Pricing removed */
  yearlyPrice?: number;
  skills: string[];
  specialty: string;
  fitLevel?: 'excellent' | 'good' | 'fair';
  popular?: boolean;
  new?: boolean;
  /** @deprecated Ownership model removed · all agents always available */
  isHired?: boolean;
  /** @deprecated Ratings removed */
  rating?: number;
  /** @deprecated Reviews removed */
  reviews?: number;
  /** @deprecated Reviews removed */
  successRate?: number;
  /** @deprecated Reviews removed */
  avgResponseTime?: string;
  examples?: string[];
  defaultTools?: string[];
}

export interface AIEmployeePerformance {
  tasksCompleted: number;
  successRate: number;
  avgResponseTime: number;
  totalReviews?: number;
  rating?: number;
  efficiency?: number;
  accuracy?: number;
  quality?: number;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  category?: 'search' | 'code' | 'image' | 'file' | 'system' | string;
  icon?: string;
  status?: 'available' | 'limited' | 'unavailable';
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}

export interface StreamingUpdate {
  type: 'content' | 'tool_call' | 'error' | 'done';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
  metadata?: {
    tokensUsed?: number;
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    cost?: number;
    metrics?: unknown;
  };
}

export interface BaseEntity {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CollaborationAgentCapability {
  employeeId: string;
  employeeName: string;
  role: string;
  provider: string;
  skills: string[];
  tools: string[];
  specialization: string[];
  canDelegate: boolean;
  priority: number;
}

export interface AgentStatus {
  agentName: string;
  status:
    | 'idle'
    | 'thinking'
    | 'analyzing'
    | 'working'
    | 'waiting'
    | 'completed'
    | 'blocked'
    | 'error';
  currentTask?: string;
  progress: number;
  toolsUsing?: string[];
  blockedBy?: string;
  output?: unknown;
}

export interface AgentCommunication {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'handoff' | 'collaboration' | 'status' | 'error' | 'completion';
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SelectionAgentCapability {
  agentType: string;
  name: string;
  description: string;
  strengths: string[];
  limitations: string[];
  supportedDomains: string[];
  supportedIntents: string[];
  costPerOperation: number;
  averageResponseTime: number;
  reliability: number;
  maxComplexity?: string;
  tools: string[];
  apiProvider: string;
  model: string;
}

export type { ApiResponse as APIResponse };
