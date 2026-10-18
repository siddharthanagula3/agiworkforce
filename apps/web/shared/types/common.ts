export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ParticipantType = 'user' | 'agent' | 'system';

export interface AgentTranscriptMetadata {
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
  metadata?: AgentTranscriptMetadata;
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
