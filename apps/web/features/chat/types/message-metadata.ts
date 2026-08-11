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

import type { SearchResponse, SearchResult } from './search-media';
import type { CloudWorkMode } from '@agiworkforce/types';
export type { SearchResponse, SearchResult, MediaGenerationResult } from './search-media';
export type WebSearchResults = SearchResponse | SearchResult[];
export type WebChatStyleMode = 'concise' | 'formal' | 'explanatory';

// Preserved from the deleted document-generation-service.ts runtime; still
// consumed by document-export-service and document message components.
export type DocumentFormat = 'markdown' | 'pdf' | 'docx';

export interface GeneratedDocument {
  title: string;
  content: string;
  metadata: {
    type: string;
    generatedAt: Date;
    wordCount: number;
    tokensUsed?: number;
    model?: string;
  };
}

export interface SendReplayMetadata {
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  officeCreationEnabled?: boolean;
  workMode?: CloudWorkMode;
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
  officeCreationEnabled?: boolean;
  workMode?: CloudWorkMode;
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
  if (typeof params.officeCreationEnabled === 'boolean') {
    replay.officeCreationEnabled = params.officeCreationEnabled;
  }
  if (params.workMode === 'chat' || params.workMode === 'agiwork') {
    replay.workMode = params.workMode;
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
  /** Recovery implied by the server code; legacy slots default to upgrade. */
  recoveryAction?: 'upgrade' | 'subscribe' | 'manage_billing' | 'view_usage';
  /**
   * GOV-20 — presentation flags from `classifyManagedQuotaErrorCode`. Optional
   * so an already-persisted paywall slot written before this existed still
   * renders (missing `showUpgradeCta` is treated as true, the old behaviour).
   */
  showUpgradeCta?: boolean;
  showResetTime?: boolean;
  suggestStandardModel?: boolean;
  /** ISO instant the exhausted window refills, when the server sent one. */
  resetAt?: string;
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
  // Per-turn usage. `inputTokens`/`outputTokens`/`tokensUsed` are lifted from
  // the PERSISTED `web_messages.input_tokens`/`output_tokens` columns by
  // `toChatMessage` (features/chat/pages/WebChatPage.tsx) on conversation load.
  // There is no terminal `x_usage` stream frame: one was built and reverted for
  // breaking the response-builder byte-parity contract (docs/adr/wire-or-cut.md
  // "Per-message token/cost"), so these values appear once the turn is
  // persisted, not while it streams, and are absent for temporary chats.
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** No producer today: no wire field carries either count to the client. */
  reasoningTokens?: number;
  cachedInputTokens?: number;
  model?: string;
  provider?: string;
  /**
   * Estimated cost of this turn, in cents. No producer: money never leaves the
   * server for managed turns — `/api/usage*` is projected to percentages by
   * `parseManagedUsageSummaryResponse` and the completion response omits
   * `cost_cents` (response-builder.golden.test.ts). Reading it is a no-op until
   * a founder decision changes that policy.
   */
  cost?: number;
  /** Wall-clock time from request start to stream completion. No producer yet. */
  totalDurationMs?: number;
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

  /**
   * How the assistant turn ended: OpenAI-wire finish reason ('stop' |
   * 'length' | 'tool_calls' | ...), legacy Anthropic 'max_tokens', or the
   * client-only 'stopped' (user aborted mid-stream). Drives the Continue
   * Generation affordance — see features/chat/lib/continue-generation.ts.
   */
  finishReason?: string;

  /**
   * Classified payload from an additive `x_stream_error` delta: the provider
   * failed mid-stream (after the response had already committed), so the
   * turn otherwise looks like a clean completion. `code`/`retryable` are
   * present when the provider adapter supplied them. Drives the "response
   * may be incomplete" notice + regenerate affordance — see
   * `hasStreamError`/`StreamErrorMessageLike` in
   * features/chat/lib/continue-generation.ts.
   */
  streamError?: { message: string; code?: string; retryable?: boolean };

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
  /** Bounded provider/gateway retry instant for the explicit image retry control. */
  imageRetryAt?: string;
  imageData?: unknown;
  videoUrl?: string;
  thumbnailUrl?: string;
  videoTaskId?: string;
  videoStatus?: 'queued' | 'processing' | 'completed' | 'failed';
  videoProvider?: 'google' | 'runway' | 'openrouter';
  videoModel?: string;
  videoProgress?: number;
  videoError?: string;
  /** True only when the prior attempt is known terminal and a new paid attempt is safe. */
  videoRetryable?: boolean;
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
