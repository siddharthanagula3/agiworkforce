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
  /**
   * Files the model generated in the managed-cloud sandbox this turn
   * (`x_generated_files` SSE delta). URIs are already resolved by the
   * runtime to fetchable URLs (absolute cloud URL on desktop Tauri;
   * same-origin path on the embedded web build). Cloud mode only — local
   * runtimes never emit these.
   */
  generatedFiles?: GeneratedFileEntry[];
  thinkingBlock?: ThinkingBlock;
  attachments?: Attachment[];
  artifacts?: Artifact[];
  isStreaming?: boolean;
  error?: string;
  /**
   * Surface-specific metadata. Kept as a generic bag so the shared package
   * stays free of surface-specific types (e.g. web-only paywall, search
   * results, code execution). Consumers should cast to their own typed
   * interface when reading (e.g. `msg.metadata as WebChatMessageMetadata`).
   */
  metadata?: Record<string, unknown>;
  /**
   * Routing provenance for this assistant message. When the model was chosen
   * by the auto-router rather than the user, `source` is `'auto'` and the
   * footer renders a trace ("Auto routed: <task> -> <model>") plus a button
   * to pin the conversation to the resolved `pinModel` for future turns.
   * Never carries a hardcoded model id — values flow from the router.
   */
  routing?: MessageRouting;
}

export interface MessageRouting {
  source: 'manual' | 'auto';
  /** Short human-readable reason the router picked this model. */
  reason?: string;
  /** Detected task label (e.g. 'code', 'image', 'research'). */
  task?: string;
  /** Model id to pin the conversation to when the user accepts the suggestion. */
  pinModel?: string;
  /**
   * UUID for OpenTelemetry correlation across the routing decision, the model
   * call, and any tool invocations spawned by this message. Optional in v1 —
   * baked into the schema so future telemetry doesn't break the contract.
   */
  traceId?: string;
  /**
   * Other models the router considered and why it didn't pick them. Lets the
   * UI render "switch to <model>" affordances next to the Pin button.
   */
  alternatives?: { model: string; reason: string }[];
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
  error?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';
  /**
   * True while this call is suspended pending a user approve/reject decision
   * (`tool_approval_request` StreamEvent). Independent of `status` so a UI
   * can show the approval prompt even before `status` itself flips —
   * mirrors `ToolCallCardProps.requiresApproval` in the shared `ToolCallCard`.
   */
  requiresApproval?: boolean;
  /**
   * A locally recorded decision while a multi-call approval checkpoint is
   * still waiting for the remaining calls. Persisted with the message so a
   * restarted client can submit the complete decision set by run id without
   * reconstructing or replaying the private model transcript.
   */
  approvalDecision?: 'approved' | 'rejected';
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  url?: string;
  size?: number;
}

/**
 * UI-tier shape of one generated file on a message. Camel-case sibling of the
 * `x_generated_files` wire descriptor (`GeneratedFileWire` in
 * `@agiworkforce/cloud-contracts`); runtimes map wire → entry and
 * resolve `uri` to a fetchable URL before emitting.
 */
export interface GeneratedFileEntry {
  id: string;
  fileName: string;
  mimeType: string;
  /** Fetchable download URL (auth handled by the host; see ChatHostBridge). */
  uri: string;
  byteCount: number;
  /** Coarse kind for icons: pdf | docx | xlsx | pptx | csv | json | markdown | html | image | archive | other */
  kind: string;
  checksumSha256?: string;
  /**
   * Server-derived UI-ownership classification (wire `surface`; see
   * `GeneratedFileSurface` in `@agiworkforce/cloud-contracts`).
   * Pass-through only — clients never re-derive it from mime/extension.
   * Optional: absent on entries persisted before classification shipped.
   */
  surface?: 'artifact' | 'file';
  /** Server-derived inline-render affordance (wire `previewable`). */
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
  /** ID of the project this conversation belongs to. */
  projectId?: string;
  /** Preview text of the last message in the conversation. */
  lastMessage?: string;
  /** Optional tags for filtering/categorisation. */
  tags?: string[];
  /** Immutable trust boundary used to execute turns in this conversation. */
  executionMode?: ChatExecutionMode;
}

export interface Project {
  id: string;
  /** Cloud owner. Local hosts may omit it. */
  ownerUserId?: string;
  organizationId?: string | null;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
  conversationIds?: string[];
  /** Canonical server count when the host does not hydrate every conversation id. */
  conversationCount?: number | null;
  instructions?: string;
  /**
   * Single emoji for visual identity. Capped at one grapheme by host.
   * Mirrors `ProjectRecord.iconEmoji` in `@agiworkforce/types/suite-contracts`.
   */
  iconEmoji?: string;
  /**
   * Bounded accent color palette ('emerald' | 'sky' | 'amber' | 'rose' |
   * 'violet' | 'zinc'). Mirrors `ProjectRecord.accentColor`.
   */
  accentColor?: string;
  /**
   * Hex color string used by web surface for the folder icon in the sidebar.
   * Optional — defaults to the accent color when absent.
   */
  color?: string;
  /** When true the project is hidden from active views. */
  isArchived?: boolean;
  /** Trust and routing metadata supplied by managed-cloud project records. */
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

// ---------------------------------------------------------------------------
// Artifact — inline renderable content (code, HTML, React component, etc.)
// ---------------------------------------------------------------------------

export type ArtifactType = SharedArtifactType;

export interface Artifact extends Omit<ArtifactBase, 'type'> {
  type: ArtifactType;
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
  /** Where capability/context/lifecycle metadata came from. */
  metadataSource?: 'registry' | 'runtime' | 'unknown';
  /** Registry lifecycle availability; omitted by older host adapters means live. */
  availability?: 'live' | 'coming_soon' | 'unavailable';
  unavailableReason?: string;
}
