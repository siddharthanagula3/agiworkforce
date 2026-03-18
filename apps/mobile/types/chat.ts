/**
 * Chat types for the mobile app.
 * Ported from desktop stores/chat/types.ts — adapted for mobile API consumption.
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType = 'text' | 'image';

export interface MessageAttachment {
  /** Remote URL after upload */
  url: string;
  /** MIME type */
  mimeType: string;
  /** Original file name */
  fileName: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  /** Uploaded attachments (images, files) */
  attachments?: MessageAttachment[];
  /** Thinking/reasoning content from Claude or similar */
  reasoning?: string;
  /** Inline artifacts (code, research, email, etc.) */
  artifacts?: Artifact[];
  /** Tool calls executed during this message */
  toolCalls?: ToolCall[];
  /** Pending approval requests */
  approvalRequests?: ApprovalRequest[];
  /** Status steps for agent execution */
  steps?: StatusStep[];
  /** Whether this message is currently streaming */
  isStreaming?: boolean;
  /** Model used for this message */
  model?: string;
  /** Message type — 'image' when the assistant generated an image */
  type?: MessageType;
  /** URL of a generated image */
  imageUrl?: string;
  /** Revised prompt returned by the image generation model */
  revisedPrompt?: string;
  /** Whether an image is currently being generated for this message */
  isGeneratingImage?: boolean;
  /** Image generation progress (0–100) */
  imageGenProgress?: number;
  /** Image generation status */
  imageGenStatus?: 'pending' | 'generating' | 'completed' | 'failed';
  /** Estimated seconds remaining for image generation */
  imageGenEstimatedTime?: number;
  /** Error message if image generation failed */
  imageGenError?: string;
  /** Image generation prompt */
  imageGenPrompt?: string;
  /** Citations from RAG or web search */
  citations?: Array<{ url: string; title?: string; snippet?: string }>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  pinned: boolean;
  lastMessage?: string;
  model?: string;
  tags?: string[];
}

export interface Artifact {
  id: string;
  type: 'code' | 'email' | 'research' | 'image' | 'chart' | 'document';
  title: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  command?: string;
  filePath?: string;
  input?: string;
  output?: string;
  status: 'running' | 'completed' | 'failed';
  duration?: number;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ApprovalRequest {
  id: string;
  toolName: string;
  description: string;
  riskLevel: RiskLevel;
  type: 'file_delete' | 'command' | 'api_call' | 'data_modification' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  countdown?: number;
}

export type StepIcon = 'thinking' | 'searching' | 'coding' | 'command' | 'success' | 'error';

export interface StatusStep {
  id: string;
  icon: StepIcon;
  message: string;
  detail?: string;
  progress?: number;
  status: 'running' | 'completed' | 'failed';
}

export type AutoApproveMode = 'ask' | 'smart' | 'full';

export type ConversationGroup = 'Today' | 'Yesterday' | 'This Week' | 'Older';

/**
 * Typed chunk emitted by the SSE streaming service.
 * Maps to StreamDelta in services/streaming.ts.
 */
export interface StreamChunk {
  type: 'content' | 'thinking' | 'artifact' | 'done' | 'error';
  content?: string;
  error?: string;
}
