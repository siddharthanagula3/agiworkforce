/**
 * Web-surface chat message metadata types.
 *
 * The shared `ChatMessage.metadata` field is typed as `Record<string, unknown>`
 * to keep the cross-surface `@agiworkforce/unified-chat` package free of
 * surface-specific shapes. Consumers in the web surface cast to this interface
 * when they need typed access:
 *
 *   const meta = msg.metadata as WebChatMessageMetadata | undefined;
 */

// Re-exported from integrations so consumers don't reach across feature roots.
export type { SearchResponse } from '@core/integrations/web-search-handler';

// Inline types for shapes that live only in feature/chat.
export interface PaywallSlot {
  feature: string;
  requiredTier: string;
  reason?: string;
}

export interface ComparisonOptions {
  a: { label?: string; content: string };
  b: { label?: string; content: string };
}

export interface ToolEntry {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
  args?: string;
}

export interface ThinkingSegment {
  id: string;
  content: string;
  isStreaming: boolean;
  startedAt: string;
  completedAt: string | null;
  durationSeconds?: number;
}

/**
 * Typed shape for `ChatMessage.metadata` used by web-surface message
 * components. Cast from `Record<string, unknown>` at the point of access.
 *
 * All fields are optional - the store stores metadata as an open bag; any
 * field may be absent for any given message.
 */
export interface WebChatMessageMetadata {
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  cost?: number;
  selectionReason?: string;

  // Thinking / reasoning
  thinkingContent?: string;
  isThinkingStreaming?: boolean;
  thinkingStartedAt?: string;
  thinkingCompletedAt?: string;
  thinkingDurationSeconds?: number;
  thinkingSegments?: ThinkingSegment[];
  thinkingSteps?: string[];
  isThinking?: boolean;

  // Streaming state
  isStreaming?: boolean;

  // Search
  isSearching?: boolean;
  searchResults?: unknown[];

  // Code execution
  isExecutingCode?: boolean;
  codeExecutionResult?: unknown;

  // Collaboration
  isCollaboration?: boolean;
  collaborationType?: 'contribution' | 'discussion' | 'synthesis';
  collaborationTo?: string;
  isMultiAgent?: boolean;
  employeesInvolved?: string[];
  isSynthesis?: boolean;

  // Tool calls
  tools?: ToolEntry[];
  toolResult?: boolean;
  toolType?: string;

  // Media
  imageUrl?: string;
  imageData?: unknown;
  videoUrl?: string;
  thumbnailUrl?: string;
  videoData?: unknown;
  documentData?: unknown;
  computeSession?: unknown;
  generatedFile?: unknown;
  artifactManifest?: unknown;

  // Paywall
  paywall?: PaywallSlot;

  // A/B comparison
  comparisonOptions?: ComparisonOptions;
  comparisonChoice?: 'a' | 'b';

  // Citations
  citations?: Array<{
    type?: string;
    cited_text?: string;
    title?: string;
    url?: string;
  }>;

  // Reactions
  reaction?: string;

  // Pasted content badge
  isPasted?: boolean;

  // Collaboration messages
  collaborationMessages?: Array<{
    employeeName: string;
    employeeAvatar: string;
    content: string;
    messageType?: string;
  }>;

  // Document
  isDocument?: boolean;
  documentTitle?: string;
  hasWorkStream?: boolean;
  workStreamData?: Record<string, unknown>;
  isPinned?: boolean;

  // Privacy
  privacyMode?: string;
  providerMode?: string;
  handoffDraftId?: string;
  handoffPreviewHashSha256?: string;
  handoffSourceConversationId?: string;
}
