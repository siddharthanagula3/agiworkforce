import type { SearchResponse, SearchResult } from './search-media';
import type { CloudWorkMode } from '@agiworkforce/types';
export type { SearchResponse, SearchResult, MediaGenerationResult } from './search-media';
export type WebSearchResults = SearchResponse | SearchResult[];
export type WebChatStyleMode = 'concise' | 'formal' | 'explanatory';

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
  skillName?: string;
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
  skillName?: string;
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
  // The name is what makes the turn replayable; without it Regenerate can only
  // refuse, because it cannot reproduce the instructions the answer was given.
  if (params.skillName) replay.skillName = params.skillName;
  return Object.keys(replay).length > 0 ? replay : undefined;
}

export interface PaywallSlot {
  feature: string;
  requiredTier: string;
  reason?: string;
  recoveryAction?: 'upgrade' | 'subscribe' | 'manage_billing' | 'view_usage' | 'top_up';
  showUpgradeCta?: boolean;
  showResetTime?: boolean;
  suggestStandardModel?: boolean;
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

export interface WebChatMessageMetadata {
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  model?: string;
  provider?: string;
  cost?: number;
  totalDurationMs?: number;
  selectionReason?: string;

  thinkingContent?: string;
  isThinkingStreaming?: boolean;
  thinkingStartedAt?: string;
  thinkingCompletedAt?: string;
  thinkingDurationSeconds?: number;
  thinkingSegments?: ThinkingSegment[];
  thinkingSteps?: string[];
  isThinking?: boolean;

  isStreaming?: boolean;

  finishReason?: string;

  streamError?: { message: string; code?: string; retryable?: boolean };

  sendReplay?: SendReplayMetadata;

  isSearching?: boolean;
  searchResults?: WebSearchResults;

  isExecutingCode?: boolean;
  codeExecutionResult?: unknown;

  isCollaboration?: boolean;
  collaborationType?: 'contribution' | 'discussion' | 'synthesis';
  collaborationTo?: string;
  isMultiAgent?: boolean;
  employeesInvolved?: string[];
  isSynthesis?: boolean;

  tools?: ToolEntry[];
  toolResult?: boolean;
  toolType?: string;

  imageUrl?: string;
  imageGenPrompt?: string;
  imageGenAspect?: string;
  imageGenModel?: string;
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
  videoRetryable?: boolean;
  videoData?: unknown;
  documentData?: unknown;
  computeSession?: unknown;
  generatedFile?: unknown;
  artifactManifest?: unknown;

  paywall?: PaywallSlot;

  comparisonOptions?: ComparisonOptions;
  comparisonChoice?: 'a' | 'b';

  citations?: Array<{
    type?: string;
    cited_text?: string;
    title?: string;
    url?: string;
  }>;

  reaction?: string;

  isPasted?: boolean;

  collaborationMessages?: Array<{
    employeeName: string;
    employeeAvatar: string;
    content: string;
    messageType?: string;
  }>;

  isDocument?: boolean;
  documentTitle?: string;
  hasWorkStream?: boolean;
  workStreamData?: Record<string, unknown>;
  isPinned?: boolean;

  privacyMode?: string;
  providerMode?: string;
  handoffDraftId?: string;
  handoffPreviewHashSha256?: string;
  handoffSourceConversationId?: string;
}
