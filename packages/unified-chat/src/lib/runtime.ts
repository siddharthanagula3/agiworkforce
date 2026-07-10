import type {
  Artifact,
  ChatMessage,
  Conversation,
  GeneratedFileEntry,
  WebSearchResult,
} from './types';

/**
 * ChatRuntime abstracts the transport layer between the chat UI and the backend.
 * Each surface (Desktop/Tauri, Web/Cloud, Mobile) provides its own implementation.
 */
export interface ChatRuntime {
  /**
   * Send a user message. The runtime drives streaming internally,
   * writing content to the chat store via `StreamCallback` listeners
   * (registered with `onStream`) or by yielding `StreamChunk` objects.
   * Returns a Promise that resolves when streaming has finished.
   */
  sendMessage(conversationId: string, content: string, options?: SendMessageOptions): Promise<void>;

  /** Abort an in-progress generation. */
  stopGeneration(conversationId: string): void;

  /** Load conversation history. */
  getMessages?(conversationId: string): Promise<ChatMessage[]>;

  /** Load messages (alias for surfaces that use this name). */
  loadMessages?(conversationId: string): Promise<ChatMessage[]>;

  /** Create a new conversation, returning its id or a Conversation object. */
  createConversation(title?: string): Promise<string | Conversation>;

  /** Delete a conversation. */
  deleteConversation(conversationId: string): Promise<void>;

  /** List all conversations. */
  listConversations?(): Promise<{ id: string; title: string; updatedAt: string }[]>;

  /** Load all conversations (alias for surfaces that use this name). */
  loadConversations?(): Promise<Conversation[]>;

  /** Rename a conversation. */
  renameConversation(conversationId: string, title: string): Promise<void>;

  /** Archive or unarchive a conversation. */
  archiveConversation?(conversationId: string, userId?: string, archived?: boolean): Promise<void>;

  /** Update only the title of a conversation (alias used by some surfaces). */
  updateConversationTitle?(conversationId: string, title: string): Promise<void>;

  /** Subscribe to streaming events. Returns an unsubscribe function. */
  onStream?(callback: StreamCallback): () => void;

  /** Upload a file attachment, returning a FileRef. */
  uploadFile?(file: File): Promise<FileRef>;

  /** Returns the current platform identifier. */
  getPlatform?(): 'desktop' | 'web' | 'mobile';

  /**
   * Persist an edit to an artifact's content (backs `ArtifactPanel`'s
   * edit-in-place `onSaveEdit`). Backends that version artifacts (e.g.
   * desktop's `ArtifactState`) create a new version. Returns only `id` +
   * `content` (not a full `Artifact`) — the backend's persisted type is a
   * coarser enum than the frontend `ArtifactType`, so it cannot honestly
   * reconstruct `type`/`language`/`metadata`; the caller merges this into
   * its already-known `Artifact` instead. Optional — hosts without artifact
   * persistence fall back to an in-memory-only edit.
   */
  updateArtifact?(artifactId: string, content: string): Promise<{ id: string; content: string }>;

  /**
   * Fetch version history for an artifact, for `ArtifactPanel`'s version
   * stepper. `current` is the caller's currently-known `Artifact` and is
   * used as the template for `type`/`title`/`language`/`metadata` — backend
   * version rows only carry raw content, and reconstructing `type` from a
   * coarser backend type enum would be lossy for types like `react`/`svg`.
   * Returns entries ordered oldest-first; every entry except the latest
   * uses a `<id>::v<n>` pseudo-id so the stepper can tell versions apart,
   * while the latest entry keeps `current`'s real id.
   */
  getArtifactVersions?(current: Artifact): Promise<Artifact[]>;
}

export interface SendMessageOptions {
  model?: string;
  provider?: string;
  attachments?: File[];
  thinkingEnabled?: boolean;
  webSearch?: boolean;
  codeExecution?: boolean;
  signal?: AbortSignal;
  systemPrompt?: string;
  /** Full conversation message history for multi-turn context. */
  messageHistory?: Array<{ role: string; content: string }>;
  /**
   * Agent operating mode forwarded to the backend.
   * Maps to apps/desktop/src-tauri/src/tools.rs plan_mode gate.
   * Values: 'ask' | 'auto' | 'plan' | 'bypass'
   */
  agentMode?: string;
  /**
   * Reasoning effort level forwarded to the backend.
   * Translated to provider-specific params (thinking.budget_tokens, reasoning.effort, etc.)
   * by the receiving runtime before hitting the provider API.
   * Values: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
   */
  effort?: string;
}

/**
 * Parameters object form of sendMessage — used by runtimes that prefer
 * a single params argument (e.g. TauriRuntime's async-generator variant).
 */
export interface SendMessageParams {
  conversationId: string;
  content: string;
  model?: string;
  provider?: string;
  attachments?: TauriAttachmentPayload[];
  signal?: AbortSignal;
  /** Forwarded composer controls — the desktop TauriRuntime maps these onto the
   *  chat_send_message request so the toggles stop being inert facade. */
  thinkingEnabled?: boolean;
  webSearch?: boolean;
  systemPrompt?: string;
  agentMode?: string;
  effort?: string;
}

/**
 * A single chunk emitted by the streaming async generator in TauriRuntime.
 */
export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; data: ToolCallData }
  | { type: 'tool_result'; data: ToolResultData }
  | { type: 'artifact'; data: Artifact }
  | { type: 'done' }
  | { type: 'error'; content: string };

export interface ToolCallData {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  input?: Record<string, unknown>;
}

export interface ToolResultData {
  id: string;
  name: string;
  status: 'completed' | 'failed';
  output?: string;
  error?: string;
  durationMs?: number;
}

/** A reference to an uploaded file returned by `ChatRuntime.uploadFile`. */
export interface FileRef {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

/**
 * Wire shape for a single attachment sent to the Tauri backend's
 * `chat_send_message` command. Mirrors `ChatAttachment` in
 * `apps/desktop/src-tauri/src/sys/commands/chat/types.rs`
 * (`#[serde(rename_all = "camelCase")]` with `type` renamed from
 * `attachment_type`). `File` objects cannot cross the Tauri IPC boundary, so
 * `TauriRuntime` reads each `File` into a base64 data URL before invoking —
 * see `TauriRuntime.sendMessage`.
 *
 * - `type` must be one of the backend's `valid_types`: only `'image'` routes
 *   through the vision/multimodal path (`process_multimodal_attachments`);
 *   everything else (`'file'`) routes through document text extraction
 *   (`process_document_attachments` / `extract_text_from_attachments`).
 * - `content` is a full `data:<mime>;base64,<data>` URL — the backend strips
 *   the `data:` prefix itself before decoding.
 * - `name` must not contain `/`, `\`, or `..` (backend path-traversal guard).
 */
export interface TauriAttachmentPayload {
  id: string;
  type: 'image' | 'file' | 'document' | 'code' | 'url';
  name: string;
  mimeType?: string;
  content?: string;
  path?: string;
}

export type StreamEvent =
  | { type: 'content'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | {
      type: 'tool_result';
      toolCallId: string;
      result?: string;
      error?: string;
      durationMs?: number;
    }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'search_results'; search: WebSearchResult }
  | { type: 'generated_files'; files: GeneratedFileEntry[] }
  | {
      type: 'done';
      /**
       * OpenAI-wire `finish_reason` for the turn (last one seen — server tool
       * loops emit intermediate 'tool_calls' before the final reason). Drives
       * the Continue-Generation affordance: 'length'/'max_tokens' mark a
       * truncated turn as continuable. Optional — runtimes without a finish
       * signal (e.g. Tauri local `chat:stream-end`) omit it.
       */
      finishReason?: string;
    }
  | { type: 'error'; error: string };

export type StreamCallback = (event: StreamEvent) => void;
