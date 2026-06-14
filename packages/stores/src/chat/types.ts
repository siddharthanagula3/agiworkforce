/**
 * Shared chat-store contracts.
 *
 * These types are the platform-agnostic superset of the desktop chat store
 * (`apps/desktop/src/stores/chat/*` — `messagesByConversation` map model) and
 * the web chat store (`apps/web/stores/chatStore.ts` — flat `messages[]` mirror
 * + streaming/tool helpers). They MUST stay free of any surface-specific
 * imports (no `next/`, no `@tauri-apps`, no DOM/node globals) so web, desktop,
 * AND mobile can consume the same store.
 *
 * The canonical message contract is `ChatMessage` from `@agiworkforce/unified-chat`
 * (the UI-tier shape). We re-export it here so consumers can import the message
 * type from the same place as the store.
 *
 * @module chat/types
 */

import type { ChatMessage as UnifiedChatMessage } from '@agiworkforce/unified-chat';

/** Canonical message shape — re-exported from `@agiworkforce/unified-chat`. */
export type ChatMessage = UnifiedChatMessage;

/**
 * Status of a single tool invocation rendered in the assistant tool timeline.
 * Superset of the desktop `ToolCall.status` and the web `MessageToolEntry.status`.
 */
export type ChatToolStatus = 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval';

/**
 * One entry in the assistant message tool timeline. Mirrors the web store's
 * `MessageToolEntry` so the web surface can map 1:1 without losing fields.
 */
export interface ChatToolEntry {
  id?: string;
  name: string;
  status: ChatToolStatus;
  durationMs?: number;
  args?: string;
  parameters?: Record<string, unknown>;
  parallelGroup?: string;
  error?: string;
  /** When true, this tool call is blocked on user approval before execution. */
  requiresApproval?: boolean;
  /** Approval decision recorded by the user (true = approved, false = rejected). */
  approved?: boolean;
  /** Raw tool_call_id from the model, used for the approval round-trip. */
  toolCallId?: string;
  /** JSON args from the model, for display in the approval card. */
  rawArgs?: Record<string, unknown>;
  /** Tool result content after execution. */
  result?: string;
}

/** Server-managed code-execution result attached to an assistant message. */
export interface ChatCodeExecutionResult {
  stdout: string;
  stderr: string;
  returnCode: number;
  images?: Array<{ mediaType: string; data: string }>;
}

/** A single web-search result row attached to an assistant message. */
export interface ChatSearchResult {
  url: string;
  title: string;
  snippet: string;
}

/**
 * Conversation summary — the platform-agnostic superset of the desktop
 * `ConversationSummary` and the web `Conversation`.
 *
 * Field names are normalized to the desktop spelling (`pinned`/`archived`)
 * because that is the spelling the shared `<Sidebar>` component consumes.
 * The web surface maps its `isPinned`/`isStarred`/`isArchived` into these.
 */
export interface ChatConversation {
  id: string;
  title: string;
  /** ISO 8601 string OR Date — surfaces differ; the sidebar normalizes both. */
  updatedAt: string | Date;
  pinned?: boolean;
  archived?: boolean;
  starred?: boolean;
  projectId?: string | null;
  /** Preview text of the last message. */
  lastMessage?: string;
  messageCount?: number;
  /** Per-conversation model override — takes precedence over `selectedModelId`. */
  modelOverride?: string;
  /** When true, messages in this conversation are not persisted (desktop). */
  incognito?: boolean;
}

/** Options for `createConversation`. */
export interface CreateConversationOptions {
  id?: string;
  projectId?: string | null;
  modelOverride?: string;
  incognito?: boolean;
  /** When true, the new conversation becomes the active one. Default: true. */
  activate?: boolean;
}

// ---------------------------------------------------------------------------
// Transport port — the injected IO boundary
// ---------------------------------------------------------------------------

/**
 * Parameters handed to the transport when sending a chat turn. The shared store
 * does NOT interpret these beyond passing them through — each surface's port
 * reads the fields it needs (web reads `model`/`webSearch`/`thinkingEnabled`
 * to build the `/api/llm/v1/chat/completions` body; desktop reads them to build
 * the `chat_send_message` Tauri invoke).
 */
export interface SendChatParams {
  conversationId: string;
  /** The id of the optimistic assistant placeholder message to stream into. */
  assistantMessageId: string;
  /** The user message text being sent. */
  content: string;
  /** Resolved model id (or auto-* alias). Never a hardcoded literal. */
  model: string;
  /** Full message history the surface wants to send to the model. */
  messages: ChatMessage[];
  webSearch?: boolean;
  thinkingEnabled?: boolean;
  codeExecution?: boolean;
  /** Effort / reasoning level when the surface exposes it. */
  effort?: string;
  /** Arbitrary surface-specific extras (skillBody, styleMode, attachments…). */
  extra?: Record<string, unknown>;
  /** Abort signal so callers can cancel an in-flight stream. */
  signal?: AbortSignal;
}

/**
 * Streaming callbacks the transport invokes as chunks arrive. These map 1:1
 * onto the store's streaming actions so a surface port can simply forward each
 * event to the store. The store wires concrete implementations of these (bound
 * to `assistantMessageId`) when it calls `port.sendChat`.
 */
export interface SendChatCallbacks {
  /** Append a content delta to the streaming assistant message. */
  onContent: (chunk: string) => void;
  /** Append an extended-thinking delta. */
  onThinking: (chunk: string) => void;
  /** Replace the full tool timeline for the message. */
  onToolTimeline: (tools: ChatToolEntry[]) => void;
  /** Patch a single tool entry by tool_call_id. */
  onToolEntry: (toolCallId: string, patch: Partial<ChatToolEntry>) => void;
  /** Toggle the "searching the web" indicator. */
  onSearching: (isSearching: boolean) => void;
  /** Attach web-search results. */
  onSearchResults: (results: ChatSearchResult[]) => void;
  /** Toggle the "executing code" indicator. */
  onExecutingCode: (isExecuting: boolean) => void;
  /** Attach a code-execution result. */
  onCodeExecutionResult: (result: ChatCodeExecutionResult) => void;
  /** Patch the assistant message itself (e.g. final model id, metadata). */
  onMessagePatch: (patch: Partial<ChatMessage>) => void;
  /** Terminal success — stream finished cleanly. */
  onDone: () => void;
  /** Terminal error — stream failed. */
  onError: (message: string) => void;
}

/**
 * The injected IO boundary. Each surface implements this against its own
 * backend: web → `fetch('/api/llm/v1/chat/completions')` + `/api/chat/conversations`;
 * desktop → Tauri `invoke('chat_send_message' | 'chat_get_conversations' | …)`.
 *
 * The store NEVER imports a transport directly — it is passed to `createChatStore`.
 * All members are optional so a surface can wire only the slices it needs
 * (e.g. a read-only or in-memory surface can omit remote CRUD and only provide
 * `sendChat`).
 */
export interface ChatStorePort {
  /** Load the conversation list from the system of record. */
  loadConversations?: () => Promise<ChatConversation[]>;
  /** Create a conversation server-side and return its canonical record. */
  createRemoteConversation?: (title?: string) => Promise<ChatConversation>;
  /** Load the messages for one conversation. */
  loadConversationMessages?: (conversationId: string) => Promise<ChatMessage[]>;
  /** Persist a single message (fire-and-forget on most surfaces). */
  persistMessage?: (conversationId: string, message: ChatMessage) => Promise<void>;
  /** Delete a conversation server-side. */
  deleteRemoteConversation?: (conversationId: string) => Promise<void>;
  /**
   * Send a chat turn and stream the response back through `callbacks`.
   * The promise resolves when the stream is fully consumed (or rejects on a
   * transport-level failure the store will route to `setError`).
   */
  sendChat: (params: SendChatParams, callbacks: SendChatCallbacks) => Promise<void>;
}
