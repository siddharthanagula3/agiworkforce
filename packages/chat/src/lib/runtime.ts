import type { Artifact, ChatMessage, Conversation } from './types';

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
  attachments?: FileRef[];
  signal?: AbortSignal;
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
  | { type: 'done' }
  | { type: 'error'; error: string };

export type StreamCallback = (event: StreamEvent) => void;
