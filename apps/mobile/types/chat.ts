/**
 * Chat types for the mobile app.
 *
 * The base `ChatMessage` contract is imported from `@agiworkforce/types`.
 * Mobile-specific fields are added via `MobileChatMessage`.
 */

import type {
  ArtifactManifest,
  ChatMessage as CanonicalChatMessage,
  ComputeSession,
  GeneratedFile,
} from '@agiworkforce/types';

export type { CanonicalChatMessage };

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType = 'text' | 'image';

export interface MessageAttachment {
  /** Remote URL after upload */
  url: string;
  /** MIME type */
  mimeType: string;
  /** Original file name */
  fileName: string;
  /**
   * Owner-scoped media asset id returned by the chat-attachment completion
   * route. Present only for attachments that were uploaded to managed cloud;
   * local-only attachments carry a device `file://` url and no asset id.
   * The completions API hydrates provider content from this id — an
   * authenticated `/api/files/{id}` URL is not fetchable by a provider.
   */
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
  /** Structured web_search results (favicon/title/domain cards), when present. */
  searchResults?: ToolSearchResult[];
  /**
   * True while this MCP/connector tool call is suspended awaiting the user's
   * approve/reject decision (manual-approval mode, `x_tool_approval_request`).
   * Cleared once a further `x_tool_status`/`x_tool_result` event lands for the
   * same call (approved calls resume executing; rejected calls get a denial
   * result) or once `resolveToolApproval` records a local decision.
   */
  requiresApproval?: boolean;
  /** Persisted local choice while a multi-call approval waits for every decision. */
  approvalDecision?: 'approved' | 'rejected';
  /**
   * The server's `tool_call_id` for a call requiring approval — the id the
   * resume request (`POST /api/llm/v1/chat/completions/approve`) references in
   * `tool_approvals[].tool_call_id`. Only set when `requiresApproval` is/was
   * true; other tool families key by `id` alone.
   */
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

/**
 * Mobile-specific chat message.
 *
 * Extends the canonical `ChatMessage` with mobile-only fields: image generation
 * state, approval requests, agent status steps, and citations.
 *
 * NOTE: `attachments` is narrowed to `MessageAttachment[]` (the mobile-specific
 * shape with `url`, `mimeType`, `fileName`) instead of the canonical
 * `ChatAttachment[]` (which requires `id`, `name`, `size`). This override is
 * intentional: the mobile API response returns the lighter `MessageAttachment`
 * shape and the render layer depends on `fileName` and direct `url` access.
 */
export interface ChatMessage extends Omit<CanonicalChatMessage, 'attachments'> {
  /** Last managed-cloud message revision observed by the delta-sync client. */
  serverVersion?: string;
  /** Mobile-specific file attachments (overrides canonical ChatAttachment[]) */
  attachments?: MessageAttachment[];
  /** Inline artifacts (code, research, email, etc.) */
  artifacts?: Artifact[];
  /** Tool calls executed during this message */
  toolCalls?: ToolCall[];
  /** Pending approval requests */
  approvalRequests?: ApprovalRequest[];
  /** Status steps for agent execution */
  steps?: StatusStep[];
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
  /** True when the message is waiting in the offline queue to be sent */
  isQueued?: boolean;
  /** ID of the corresponding offlineQueue entry (cleared after successful send) */
  offlineQueueId?: string;
  /** On-device performance — tokens per second (populated after first token) */
  tokensPerSecond?: number;
  /** On-device performance — first-token latency in milliseconds */
  firstTokenLatencyMs?: number;
  /** Runtime tier: 'Tier 1' | 'Tier 2' | 'Tier 3' */
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
  /** Provider used in this conversation. Local Mode uses "local"; AGI Cloud uses "cloud_managed". */
  provider?: string;
  /** Local and Cloud histories are separate privacy boundaries on mobile. */
  executionMode?: 'local' | 'cloud';
  tags?: string[];
  /** Optional project ID this conversation belongs to */
  projectId?: string;
  /** Whether this is a temporary (unsaved) conversation */
  temporary?: boolean;
  /** True when there are messages newer than the last time the user opened this chat */
  unread?: boolean;
  /** Last server-owned Managed Cloud sync revision. Missing legacy state means `0`. */
  serverVersion?: string;
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
