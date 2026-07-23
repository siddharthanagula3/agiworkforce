import type {
  Artifact,
  ChatMessage,
  Conversation,
  GeneratedFileEntry,
  WebSearchResult,
} from './types';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

export interface CloudApprovalTurnProjection {
  assistantMessageId: string;
  runId: string;
  runReference?: {
    runId: string;
    runPath: string;
    lastSequence: number;
    state?: AgentTaskState;
    cancellationRequestedAt?: string | null;
  };
  model: string;
  assistantContent: string;
  calls: Array<{
    toolCallId: string;
    name: string;
    args: Record<string, unknown>;
    decision?: 'approved' | 'rejected';
  }>;
  agentActivity?: AgentActivityState;
}
import type { CloudWorkMode } from '@agiworkforce/types';

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
   * True when this runtime can resume a truncated/user-stopped assistant turn
   * IN PLACE (Continue Generation): reissue the completion with the history up
   * to+including the partial plus an ephemeral continue instruction, and append
   * to the SAME assistant message. Only the cloud SSE path (`WebRuntime`, and
   * `CloudRuntime` once DCL-4 wires it) can do this — its `sendMessage` sends
   * the full `messageHistory` as the thread. Local/native runtimes
   * (`TauriRuntime`) drop `messageHistory` and persist each send as a new user
   * turn via the Rust backend, so continuing in place is impossible there.
   * When absent/false, surfaces MUST NOT show a Continue affordance (no fake
   * availability) — see `useChat` / `MessageList`.
   */
  supportsContinueGeneration?: boolean;

  /**
   * True when this runtime forwards `SendMessageOptions.codeExecution` onto a
   * backend that can actually honor it (the cloud SSE path — `WebRuntime`,
   * and `CloudRuntime` once DCL-4 wires it). `TauriRuntime`'s wire shape has
   * no code-execution field, so it MUST stay false/omitted there — composer
   * UI gates the "Run code" toggle's very existence on this flag so it is
   * never rendered as a control the active runtime would silently ignore.
   */
  supportsCodeExecution?: boolean;

  /**
   * True only when this runtime forwards `SendMessageOptions.research` to a
   * backend that executes the managed Deep Research workflow. Shared composer
   * UI hides the Research control when this is absent/false so Local/Tauri
   * sessions never advertise a cloud-only transport they would ignore.
   */
  supportsResearch?: boolean;

  /**
   * True when Web search is executed by the managed Cloud route and therefore
   * must be gated on the deployment-backed generic-search capability plus the
   * selected model. Local/Tauri runtimes omit this so their native tool path is
   * preserved without consulting Cloud state.
   */
  supportsManagedWebSearch?: boolean;

  /**
   * Resolve one pending tool-approval request from an `x_tool_approval_request`
   * suspension (see the `tool_approval_request` StreamEvent). Only the cloud
   * SSE runtimes implement this. They submit only the server-owned run id and
   * decisions to `POST /api/llm/v1/chat/completions/approve`; private model
   * messages and tool arguments stay inside the tenant-owned checkpoint.
   * Records the decision; once EVERY pending call in the
   * suspended turn has a decision, the runtime dispatches the resume request
   * and streams the continuation back through the same `onStream` callbacks
   * (appending to the same assistant message). No-op (never called) on
   * runtimes without this method — hosts must gate the approve/reject UI on
   * its presence, not fake it.
   */
  resolveToolApproval?(
    conversationId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ): Promise<void>;

  /**
   * Whether `conversationId` has a suspended turn actually resolvable right
   * now. `projection` is derived from the persisted assistant message and lets
   * a fresh runtime hydrate its small client registry after reload/restart.
   * The server remains authoritative for checkpoint ownership, arguments,
   * policy, and exact pending-call membership.
   */
  hasLiveApprovalTurn?(conversationId: string, projection?: CloudApprovalTurnProjection): boolean;

  /**
   * Persist an edit to an artifact's content (backs `ArtifactPanel`'s
   * edit-in-place `onSaveEdit`). Backends that version artifacts (e.g.
   * desktop's `ArtifactState`) create a new version. Returns only `id` +
   * `content` because an edit does not change the artifact's identity or
   * renderer metadata; the caller merges the new content into its canonical
   * `Artifact`. Optional — hosts without artifact persistence fall back to
   * an in-memory-only edit.
   */
  updateArtifact?(artifactId: string, content: string): Promise<{ id: string; content: string }>;

  /**
   * Fetch version history for an artifact, for `ArtifactPanel`'s version
   * stepper. `current` is the caller's canonical `Artifact` and is used as
   * the template for identity and renderer metadata because version rows
   * carry only version-specific content and timestamps. The durable artifact
   * snapshot owns the exact rich type used to construct `current`.
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
  /** Request the managed Deep Research workflow (capability-gated by the runtime). */
  research?: boolean;
  /** Cloud product execution mode; independent from permission `agentMode`. */
  workMode?: CloudWorkMode;
  /** Exact Managed Cloud catalog name; clients never resolve or send the skill body. */
  skillName?: string;
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
  workMode?: CloudWorkMode;
  systemPrompt?: string;
  agentMode?: string;
  effort?: string;
}

/**
 * A single chunk emitted by the streaming async generator in TauriRuntime.
 */
export type StreamChunk =
  | { type: 'text'; content: string }
  | {
      type: 'thinking';
      content: string;
      /** Elapsed provider reasoning time when the runtime can measure it. */
      durationMs?: number;
      /** True when this chunk settles the provider reasoning trace. */
      completed?: boolean;
    }
  | { type: 'agent_event'; data: AgentEventEnvelope }
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
  | {
      type: 'thinking';
      content: string;
      durationMs?: number;
      completed?: boolean;
    }
  | { type: 'agent_run'; runId: string; runPath: string }
  | {
      /**
       * Runtime-validated canonical Cloud activity envelope. Consumers project
       * it into the portable `AgentActivityState`; raw provider reasoning is
       * intentionally not represented by that projection.
       */
      type: 'agent_event';
      envelope: AgentEventEnvelope;
    }
  | { type: 'tool_call'; toolCall: { id: string; name: string; args: Record<string, unknown> } }
  | {
      type: 'tool_result';
      toolCallId: string;
      result?: string;
      error?: string;
      durationMs?: number;
    }
  | {
      /**
       * The server suspended the turn pending a user approve/reject decision
       * for this tool call (`x_tool_approval_request`, cloud mode only). The
       * runtime that emits this MUST keep the assistant message open (no
       * `done` teardown of the message ref) until every pending call in the
       * turn is decided and `ChatRuntime.resolveToolApproval` resumes it.
       */
      type: 'tool_approval_request';
      toolCallId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'search_results'; search: WebSearchResult }
  | { type: 'generated_files'; files: GeneratedFileEntry[] }
  | {
      /**
       * Server-managed code execution result (`x_code_result` delta, Anthropic/
       * Google's native code_execution tool). Mirrors
       * `apps/web/lib/hooks/useChatStream.ts`'s `currentCodeExecutionResult`
       * parsing exactly (same `<stdout>`/`<stderr>`/`<return_code>` tag
       * extraction) so cloud-mode desktop renders the identical result web does.
       */
      type: 'code_execution_result';
      result: {
        stdout: string;
        stderr: string;
        returnCode: number;
        images?: Array<{ mediaType: string; data: string }>;
      };
    }
  | {
      /**
       * Deep Research run status (`x_research_status` delta). Mirrors
       * `apps/web/lib/hooks/useChatStream.ts`'s `currentResearch` parsing.
       * Emitted only by managed runtimes whose `supportsResearch` capability
       * lets the shared composer forward an explicit `research: true` turn.
       */
      type: 'research_status';
      status: {
        phase: 'planning' | 'searching' | 'synthesizing' | 'complete' | 'error';
        label?: string;
        iteration?: number;
        maxIterations?: number;
        searches?: number;
        sources?: number;
        elapsedMs?: number;
        error?: string;
      };
    }
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
      /**
       * Classified payload from an additive `x_stream_error` SSE delta: the
       * provider failed mid-stream (after the response had already committed
       * a 200), so this `done` event is still the NORMAL clean-stream-end
       * path — not the separate `{type: 'error'}` event below, which is for
       * transport-level failures (non-200, network throw). `finish_reason`
       * alone cannot reliably carry this signal (see
       * packages/ai/provider-protocol's openai-wire-compat.ts and this package's
       * `hasStreamError` doc comments for why). `code`/`retryable` are
       * present when the provider adapter supplied them. Drives a "response
       * may be incomplete" notice + regenerate affordance. Optional —
       * runtimes without the marker (local/native, or a normally-completed
       * turn) omit it.
       */
      streamError?: { message: string; code?: string; retryable?: boolean };
    }
  | { type: 'error'; error: string };

export type StreamCallback = (event: StreamEvent) => void;
