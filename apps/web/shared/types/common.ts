/**
 * Common Shared Types
 * Consolidated type definitions used across the codebase
 *
 * This file provides canonical definitions to eliminate duplicate types.
 * Import from @shared/types for all common types.
 */

// ============================================================================
// COMMON ENUMS AND PRIMITIVES
// ============================================================================

/**
 * Standard loading/async operation status
 */
export type Status = 'idle' | 'loading' | 'success' | 'error';

/**
 * Message role in conversations
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Message delivery/send status
 */
export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Tool call execution status
 */
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Participant type in conversations
 */
export type ParticipantType = 'user' | 'agent' | 'system';

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Standard API response wrapper
 * Use this for all API responses across the application
 */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
  message?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Paginated response structure
 */
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

/**
 * Standard API error structure
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// CHAT MESSAGE TYPES
// ============================================================================

/**
 * Chat message metadata - model and token usage info
 */
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
  // Extended fields used by chat features
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
  /** Allow additional metadata fields */
  [key: string]: unknown;
}

/**
 * Base chat message interface
 * Use this as the foundation for all message types
 */
export interface BaseChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date | string;
  metadata?: MessageMetadata;
}

/**
 * Simple chat message for basic use cases (hooks, local state)
 * Use this for simple chat implementations without multi-agent features
 */
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

/**
 * Chat message with session/conversation context
 * Full-featured message for multi-agent chat systems
 */
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

/**
 * Mission Control chat message with extended display options
 */
export interface MissionChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: MCPToolCallInfo[];
  reasoning?: string;
  status?: 'thinking' | 'working' | 'completed' | 'error';
}

/**
 * MCP Tool call information for display
 */
export interface MCPToolCallInfo {
  tool: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

/**
 * Chat message record for database persistence
 */
export interface ChatMessageRecord {
  id: string;
  session_id?: string;
  conversation_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool call information within a message
 */
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

/**
 * Message attachment (files, images, etc.)
 */
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

/**
 * Message reaction (likes, helpful, etc.)
 */
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

/**
 * Thinking/reasoning step for AI responses
 */
export interface ThinkingStep {
  id: string;
  step: number;
  description: string;
  reasoning?: string;
  timestamp: Date | string;
  duration?: number;
}

/**
 * Citation/source reference
 */
export interface Citation {
  id: string;
  title: string;
  url: string;
  description?: string;
  favicon?: string;
  snippet?: string;
  timestamp?: Date | string;
}

// ============================================================================
// CHAT SESSION/CONVERSATION TYPES
// ============================================================================

/**
 * Chat session representing a conversation
 */
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

/**
 * Chat/conversation settings
 */
export interface ChatSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
}

/**
 * Typing indicator for real-time chat
 */
export interface TypingIndicator {
  participantId: string;
  participantName: string;
  conversationId: string;
  isTyping?: boolean;
  startedAt: Date | string;
}

// ============================================================================
// AI EMPLOYEE TYPES (MARKETPLACE & CHAT)
// ============================================================================

/**
 * AI provider types
 */
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

/**
 * Employee status in the system
 */
export type AIEmployeeStatus =
  | 'available'
  | 'busy'
  | 'offline'
  | 'working'
  | 'thinking'
  | 'idle'
  | 'maintenance';

/**
 * Simplified AI employee for chat/selector use
 */
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

/**
 * AI agent for marketplace display
 * All agents are freely available — no ownership or pricing model
 */
export interface MarketplaceEmployee extends AIEmployeeBasic {
  category: string;
  provider: AIProvider;
  /** @deprecated Pricing removed — all agents are free to chat with */
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
  /** @deprecated Ownership model removed — all agents always available */
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

/**
 * Performance metrics for AI employee
 */
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

// ============================================================================
// TOOL TYPES
// ============================================================================

/**
 * Tool definition for AI capabilities
 */
export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  category?: 'search' | 'code' | 'image' | 'file' | 'system' | string;
  icon?: string;
  status?: 'available' | 'limited' | 'unavailable';
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// STREAMING TYPES
// ============================================================================

/**
 * Streaming update for real-time message generation
 */
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

// ============================================================================
// BASE ENTITY TYPES
// ============================================================================

/**
 * Base entity with common fields
 */
export interface BaseEntity {
  id: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================================================
// ORCHESTRATION TYPES
// ============================================================================

/**
 * Agent capability for collaboration manager
 * Used in multi-agent orchestration for team collaboration
 */
export interface CollaborationAgentCapability {
  employeeId: string;
  employeeName: string;
  role: string;
  provider: string;
  skills: string[];
  tools: string[];
  specialization: string[];
  canDelegate: boolean;
  priority: number; // 1-10, higher means better for leadership
}

/**
 * Agent capability for collaboration protocol
 * Used for multi-agent conversations with tool usage
 */
export interface ProtocolAgentCapability {
  agentId: string;
  name: string;
  avatar?: string;
  expertise: string[];
  tools: string[];
  systemPrompt: string;
  model: string;
  temperature: number;
}

/**
 * Agent capability for employee selection/reasoning
 * Used for intelligent agent selection based on task requirements
 */
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

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

// Export type aliases for backward compatibility
export type { ApiResponse as APIResponse };
