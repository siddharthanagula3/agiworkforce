/**
 * Chat Package Types
 *
 * Local type definitions for the `packages/chat` shared component library.
 * `Provider` is imported from `@agiworkforce/types` — the single source of truth
 * for all LLM provider identifiers across the monorepo.
 *
 * `Conversation`, `ChatMessage`, and `ModelInfo` here are **UI-tier shapes**
 * tailored to chat-component rendering needs (inline citations, thinking
 * blocks, streaming state, routing trace, attachments rendered inline, etc.).
 *
 * They are intentionally **siblings**, not subtypes, of the wire/storage
 * shapes in `@agiworkforce/types` (`ChatMessage`, `Conversation` in
 * `packages/contracts/types/src/chat.ts`). Mapping between the two is the responsibility
 * of the chat hook layer (`useChat`, `useSendMessage`) when persisting messages
 * or fetching them back from storage.
 *
 * @module types
 */

import type {
  Provider,
  ArtifactBase,
  ArtifactType as SharedArtifactType,
  ChatExecutionMode,
  PrivacyMode,
  ProviderMode,
  ProjectImportSource,
  SourceSurface,
} from '@agiworkforce/types';

export type { Provider };

export interface ChatMessage {
  id: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  /** @deprecated Use `createdAt`. Kept for backwards compatibility. */
  timestamp?: string;
  model?: string;
  provider?: Provider | string;
  thinking?: string;
  citations?: Citation[];
  toolCalls?: ToolCall[];
  webSearchResults?: WebSearchResult[];
  generatedFiles?: GeneratedFileEntry[];
  thinkingBlock?: ThinkingBlock;
  attachments?: Attachment[];
  artifacts?: Artifact[];
  isStreaming?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
  routing?: MessageRouting;
}

export interface MessageRouting {
  source: 'manual' | 'auto';
  reason?: string;
  task?: string;
  pinModel?: string;
  traceId?: string;
  alternatives?: { model: string; reason: string }[];
}

export interface Citation {
  id?: string;
  url: string;
  title?: string;
  snippet?: string;
  domain?: string;
  faviconUrl?: string;
  additionalCount?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';
  requiresApproval?: boolean;
  approvalDecision?: 'approved' | 'rejected';
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  url?: string;
  size?: number;
}

export interface GeneratedFileEntry {
  id: string;
  fileName: string;
  mimeType: string;
  uri: string;
  byteCount: number;
  kind: string;
  checksumSha256?: string;
  surface?: 'artifact' | 'file';
  previewable?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  provider?: Provider | string;
  pinned?: boolean;
  archived?: boolean;
  messageCount?: number;
  projectId?: string;
  lastMessage?: string;
  tags?: string[];
  executionMode?: ChatExecutionMode;
}

export interface Project {
  id: string;
  ownerUserId?: string;
  organizationId?: string | null;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
  conversationIds?: string[];
  conversationCount?: number | null;
  instructions?: string;
  iconEmoji?: string;
  accentColor?: string;
  color?: string;
  isArchived?: boolean;
  defaultPrivacyMode?: PrivacyMode;
  defaultProviderMode?: ProviderMode;
  allowedSurfaces?: SourceSurface[];
  defaultModelId?: string | null;
  knowledgeFileCount?: number | null;
  memberCount?: number | null;
  lastUsedAt?: string | null;
  importedFrom?: ProjectImportSource | null;
  metadata?: Record<string, unknown> | null;
}

export type ArtifactType = SharedArtifactType;

export interface Artifact extends Omit<ArtifactBase, 'type'> {
  type: ArtifactType;
}

/**
 * One assistant message's artifacts plus the body text those artifacts were
 * lifted out of.
 *
 * This package deliberately does NOT own derivation: the canonical, id-stable
 * implementation lives in `@agiworkforce/artifacts`
 * (`deriveArtifacts` + `removeArtifactBlocks`, deterministic
 * `uuidv5(conversationId:messageId:ordinal)` ids), and pulling it in here would
 * fork it for a third time. Hosts that already depend on that package hand the
 * result in through {@link DeriveMessageArtifacts}; hosts that don't keep
 * today's behaviour (only pre-attached `message.artifacts` render).
 */
export interface MessageArtifactProjection {
  artifacts: Artifact[];
  displayContent: string;
}

export interface MessageArtifactDerivationContext {
  conversationId: string;
}

/**
 * Host capability that turns one assistant message into a
 * {@link MessageArtifactProjection}. Return `null` when the message yields no
 * artifacts — callers then render `message.content` untouched.
 *
 * MUST be referentially stable (module-level function or `useCallback`): it is
 * a `useMemo` dependency for the whole transcript.
 */
export type DeriveMessageArtifacts = (
  message: ChatMessage,
  context: MessageArtifactDerivationContext,
) => MessageArtifactProjection | null;

export type ThinkingStepType =
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'terminal'
  | 'search'
  | 'link'
  | 'complete'
  | 'script'
  | 'creating'
  | 'tool'
  | 'done';

export interface ThinkingStep {
  id: string;
  type: ThinkingStepType;
  content: string;
  badgeType?: 'result' | 'script' | 'file';
  badge?: string;
  result?: string;
}

export interface ThinkingBlock {
  id: string;
  steps: ThinkingStep[];
  summary?: string;
  collapsed?: boolean;
  durationMs?: number;
}

export interface WebSearchResultItem {
  url: string;
  title: string;
  snippet?: string;
  faviconUrl?: string;
  domain?: string;
}

export interface WebSearchResult {
  id: string;
  query: string;
  results: WebSearchResultItem[];
  resultCount: number;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: Provider | string;
  tier: 'flagship' | 'standard' | 'fast';
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  contextWindow: number;
  isLocal: boolean;
  isByok: boolean;
  metadataSource?: 'registry' | 'runtime' | 'unknown';
  availability?: 'live' | 'coming_soon' | 'unavailable';
  unavailableReason?: string;
}
