/**
 * Chat Package Types
 *
 * Local type definitions for the `packages/chat` shared component library.
 * `Provider` is imported from `@agiworkforce/types` — the single source of truth
 * for all LLM provider identifiers across the monorepo.
 *
 * `Conversation`, `ChatMessage`, and `ModelInfo` extend the shared base shapes
 * with fields specific to the chat package's UI concerns (pinning, archiving,
 * inline citations, streaming state, and the full provider union).
 *
 * @module types
 */

import type { Provider } from '@agiworkforce/types';

// Re-export Provider so components inside this package can import it from
// the local barrel rather than reaching into @agiworkforce/types directly.
export type { Provider };

export interface ChatMessage {
  id: string;
  /** Conversation this message belongs to. */
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** ISO 8601 timestamp when the message was created. */
  createdAt?: string;
  /** @deprecated Use `createdAt`. Kept for backwards compatibility. */
  timestamp?: string;
  model?: string;
  provider?: Provider | string;
  thinking?: string;
  citations?: Citation[];
  toolCalls?: ToolCall[];
  webSearchResults?: WebSearchResult[];
  thinkingBlock?: ThinkingBlock;
  attachments?: Attachment[];
  isStreaming?: boolean;
  error?: string;
}

export interface Citation {
  id?: string;
  url: string;
  title?: string;
  snippet?: string;
  /** Extracted hostname/domain for display (e.g. "wikipedia.org"). */
  domain?: string;
  /** URL of the site's favicon for display next to the citation. */
  faviconUrl?: string;
  /** When a citation pill groups multiple sources, the overflow count. */
  additionalCount?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  url?: string;
  size?: number;
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
  /** ID of the project this conversation belongs to. */
  projectId?: string;
  /** Preview text of the last message in the conversation. */
  lastMessage?: string;
  /** Optional tags for filtering/categorisation. */
  tags?: string[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
  conversationIds?: string[];
  instructions?: string;
}

// ---------------------------------------------------------------------------
// Artifact — inline renderable content (code, HTML, React component, etc.)
// ---------------------------------------------------------------------------

export type ArtifactType =
  | 'code'
  | 'html'
  | 'react'
  | 'markdown'
  | 'svg'
  | 'mermaid'
  | 'json'
  | 'document'
  | 'research'
  | 'image';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
}

// ---------------------------------------------------------------------------
// Thinking / reasoning trace types
// ---------------------------------------------------------------------------

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
  /** Primary text content displayed next to the step icon. */
  content: string;
  /** Optional badge variant to render beneath the step content. */
  badgeType?: 'result' | 'script' | 'file';
  /** Badge label text when badgeType is 'file'. */
  badge?: string;
  /** Collapsible result/output content for the step. */
  result?: string;
}

export interface ThinkingBlock {
  id: string;
  steps: ThinkingStep[];
  summary?: string;
  collapsed?: boolean;
  /** Elapsed time in milliseconds shown in the header. */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Web search result card
// ---------------------------------------------------------------------------

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
  /** Total number of results found (may be more than results.length). */
  resultCount: number;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * Model metadata used by the chat package's model selector.
 *
 * `provider` uses the canonical `Provider` union from `@agiworkforce/types`
 * so the model selector is always in sync with the platform's full provider list.
 */
export interface ModelInfo {
  id: string;
  name: string;
  /** LLM provider identifier — canonical union from `@agiworkforce/types`. */
  provider: Provider | string;
  tier: 'flagship' | 'standard' | 'fast';
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  contextWindow: number;
  isLocal: boolean;
  isByok: boolean;
}
