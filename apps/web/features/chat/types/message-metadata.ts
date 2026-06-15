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
import type { SearchResponse, SearchResult } from '@core/integrations/web-search-handler';
export type { SearchResponse, SearchResult } from '@core/integrations/web-search-handler';
export type WebSearchResults = SearchResponse | SearchResult[];
export type WebChatStyleMode = 'concise' | 'formal' | 'explanatory';

export interface SendReplayMetadata {
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  styleMode?: WebChatStyleMode;
  hasSkillInstruction?: boolean;
}

export function isWebSearchResponse(value: unknown): value is SearchResponse {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { results?: unknown }).results)
  );
}

export function countWebSearchSources(searchResults: WebSearchResults | undefined): number {
  if (!searchResults) return 0;
  if (Array.isArray(searchResults)) {
    return searchResults.filter((result) => Boolean(result.url)).length;
  }

  const resultUrls = searchResults.results.filter((result) => Boolean(result.url)).length;
  const sourceUrls = (searchResults.sources ?? []).filter(Boolean).length;
  return resultUrls + sourceUrls;
}

export function hasWebSearchSources(searchResults: WebSearchResults | undefined): boolean {
  return countWebSearchSources(searchResults) > 0;
}

function isWebChatStyleMode(value: unknown): value is WebChatStyleMode {
  return value === 'concise' || value === 'formal' || value === 'explanatory';
}

export function createSendReplayMetadata(params: {
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  styleMode?: string;
  hasSkillInstruction?: boolean;
}): SendReplayMetadata | undefined {
  const replay: SendReplayMetadata = {};
  if (typeof params.webSearchEnabled === 'boolean')
    replay.webSearchEnabled = params.webSearchEnabled;
  if (typeof params.thinkingEnabled === 'boolean') replay.thinkingEnabled = params.thinkingEnabled;
  if (typeof params.codeExecutionEnabled === 'boolean') {
    replay.codeExecutionEnabled = params.codeExecutionEnabled;
  }
  if (isWebChatStyleMode(params.styleMode)) replay.styleMode = params.styleMode;
  if (params.hasSkillInstruction) replay.hasSkillInstruction = true;
  return Object.keys(replay).length > 0 ? replay : undefined;
}

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

  // Safe replay metadata for regenerate. Raw skill bodies are intentionally not persisted.
  sendReplay?: SendReplayMetadata;

  // Search
  isSearching?: boolean;
  searchResults?: WebSearchResults;

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
  /** Original prompt used for image generation (used by edit/re-generate flow). */
  imageGenPrompt?: string;
  /** Aspect ratio that was used when generating the image. */
  imageGenAspect?: string;
  /** Model id used for image generation. */
  imageGenModel?: string;
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
