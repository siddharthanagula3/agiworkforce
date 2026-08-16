
import type { InteractiveCard } from '@agiworkforce/types';
import type {
  ArtifactManifest,
  ChatMessage as CanonicalChatMessage,
  ComputeSession,
  GeneratedFile,
} from '@agiworkforce/types';

export type { CanonicalChatMessage };

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType = 'text' | 'image' | 'video';

export interface MessageAttachment {
  url: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
  assetId?: string;
}

export interface Artifact {
  id: string;
  type: 'code' | 'email' | 'research' | 'image' | 'chart' | 'document';
  title: string;
  content: string;
  language?: string;
  computeSession?: ComputeSession;
  generatedFile?: GeneratedFile;
  artifactManifest?: ArtifactManifest;
  metadata?: Record<string, unknown>;
}

export interface ToolSearchResult {
  url: string;
  title: string;
  snippet?: string;
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
  searchResults?: ToolSearchResult[];
  requiresApproval?: boolean;
  approvalDecision?: 'approved' | 'rejected';
  toolCallId?: string;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ApprovalRequest {
  id: string;
  toolName: string;
  description: string;
  riskLevel: RiskLevel;
  type: 'file_delete' | 'command' | 'api_call' | 'data_modification' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  expiresAt?: string;
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

export interface ChatMessage extends Omit<CanonicalChatMessage, 'attachments'> {
  serverVersion?: string;
  attachments?: MessageAttachment[];
  artifacts?: Artifact[];
  toolCalls?: ToolCall[];
  approvalRequests?: ApprovalRequest[];
  steps?: StatusStep[];
  type?: MessageType;
  imageUrl?: string;
  imageGenPersisted?: boolean;
  revisedPrompt?: string;
  isGeneratingImage?: boolean;
  imageGenProgress?: number;
  imageGenStatus?: 'pending' | 'generating' | 'completed' | 'failed';
  imageGenEstimatedTime?: number;
  imageGenError?: string;
  imageGenPrompt?: string;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  isGeneratingVideo?: boolean;
  videoGenStatus?: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';
  videoGenProgress?: number;
  videoGenError?: string;
  videoGenPrompt?: string;
  citations?: Array<{ url: string; title?: string; snippet?: string }>;
  interactiveCards?: InteractiveCard[];
  isQueued?: boolean;
  offlineQueueId?: string;
  tokensPerSecond?: number;
  firstTokenLatencyMs?: number;
  runtimeTier?: import('@/src/features/chat/components/PerformanceChip').RuntimeTier;
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
  provider?: string;
  executionMode?: 'local' | 'cloud';
  tags?: string[];
  projectId?: string;
  temporary?: boolean;
  unread?: boolean;
  serverVersion?: string;
  parentConversationId?: string;
  forkPointMessageId?: string;
}

export type AutoApproveMode = 'ask' | 'smart' | 'full';

export type ConversationGroup = 'Today' | 'Yesterday' | 'This Week' | 'Older';

export interface StreamChunk {
  type: 'content' | 'thinking' | 'artifact' | 'done' | 'error';
  content?: string;
  error?: string;
}
