/**
 * TauriRuntime
 *
 * Implements the ChatRuntime interface from @agiworkforce/unified-chat, bridging
 * the shared chat package to the Tauri/Rust backend via invoke() IPC.
 *
 * In Tauri desktop mode: uses invoke() + Tauri event listeners for streaming.
 * In cloud-web mode: delegates to cloudApi for CRUD and cloudChatStream for
 * streaming (via the tauri-mock shim's built-in cloud fallback).
 *
 * Streaming pattern:
 *   - invoke('chat_send_message') triggers the Rust backend to start streaming
 *   - Rust emits 'chat:stream-start', 'chat:stream-chunk', 'chat:stream-end'
 *     and 'tool:event' events via Tauri's event channel
 *   - This adapter listens to those events and yields StreamChunk objects
 *     through an async generator, which the ChatRuntime consumer iterates
 */

import type {
  ChatRuntime,
  FileRef,
  SendMessageOptions,
  SendMessageParams,
  StreamChunk,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import { invoke } from '../lib/tauri-mock';
import { listen } from '../lib/tauri-mock';
import { useUnifiedAuthStore } from '../stores/auth';
import { useAppModeStore, selectPrivacyMode } from '../stores/appModeStore';
import { triggerCloudSyncAfterTurn } from '../lib/cloudSyncTrigger';
import { useChatStore as useDesktopChatStore, uuidToDbId } from '../stores/chat/chatStore';

// ---------------------------------------------------------------------------
// Raw Tauri event payload shapes (snake_case from Rust serde serialisation)
// ---------------------------------------------------------------------------

interface StreamChunkPayload {
  conversation_id: string | number;
  message_id: string | number;
  delta: string;
  content: string;
}

interface StreamEndPayload {
  conversation_id: string | number;
  message_id: string | number;
  backend_message_id?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface StreamErrorPayload {
  conversation_id: string | number;
  message_id: string | number;
  error: string;
}

interface ToolEventPayload {
  type: 'started' | 'progress' | 'completed';
  id: string;
  name?: string;
  message_id?: string | number;
  args?: Record<string, unknown>;
  output?: string;
  error?: string;
  duration_ms?: number;
}

// Raw payload for the `chat:artifact` event, emitted by
// `core/llm/tool_executor/artifact_tools.rs::execute_create_artifact_tool`
// when the model calls the `create_artifact` tool during a live turn.
interface ArtifactEventPayload {
  conversation_id: string | number | null;
  message_id?: string | number | null;
  artifact: {
    id: string;
    type: string;
    title?: string;
    content: string;
    language?: string | null;
    metadata?: Record<string, unknown>;
  };
}

// Raw shape of the Rust `ArtifactResponse<T>` wrapper
// (apps/desktop/src-tauri/src/sys/commands/artifacts.rs).
interface RawArtifactResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// Raw shape of the Rust `Artifact` struct (core/artifacts/types.rs) as
// returned by `artifact_update`. Only the fields this runtime reads.
interface RawArtifact {
  id: string;
  content: string;
}

// Raw shape of the Rust `ArtifactVersion` struct (core/artifacts/types.rs)
// as returned by `artifact_get_versions`.
interface RawArtifactVersion {
  version: number;
  content: string;
}

// ---------------------------------------------------------------------------
// Raw Rust response shapes (snake_case before mapping to ChatRuntime types)
// ---------------------------------------------------------------------------

interface RawConversation {
  id: string | number;
  title: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  pinned?: boolean;
  project_id?: string;
  projectId?: string;
  model?: string;
  message_count?: number;
  messageCount?: number;
  last_message?: string;
  lastMessage?: string;
  tags?: string[];
  archived?: boolean;
}

interface RawMessage {
  id: string | number;
  conversation_id?: string | number;
  conversationId?: string | number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  createdAt?: string;
  model?: string;
  provider?: string;
}

interface RawFileUploadResult {
  id: string;
  name: string;
  url: string;
  mime_type?: string;
  mimeType?: string;
  size?: number;
}

const LOCAL_DESKTOP_USER_ID = 'local-desktop-user';

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapConversation(raw: RawConversation): Conversation {
  return {
    id: String(raw.id),
    title: raw.title ?? 'New Conversation',
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
    pinned: raw.pinned ?? false,
    projectId: raw.project_id ?? raw.projectId,
    model: raw.model,
    messageCount: raw.message_count ?? raw.messageCount ?? 0,
    lastMessage: raw.last_message ?? raw.lastMessage,
    tags: raw.tags,
    archived: raw.archived ?? false,
  };
}

function mapMessage(raw: RawMessage): ChatMessage {
  return {
    id: String(raw.id),
    conversationId: String(raw.conversation_id ?? raw.conversationId ?? ''),
    role: raw.role,
    content: raw.content,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    model: raw.model ?? undefined,
    provider: raw.provider as ChatMessage['provider'] | undefined,
  };
}

// ---------------------------------------------------------------------------
// TauriRuntime implementation
// ---------------------------------------------------------------------------

export class TauriRuntime implements ChatRuntime {
  // Track active stop requests keyed by conversationId so stopGeneration()
  // can resolve the generator without waiting for Tauri to respond.
  private readonly _stopFlags = new Map<string, boolean>();

  // Registered onStream callbacks
  private readonly _streamCallbacks = new Set<
    (event: import('@agiworkforce/unified-chat').StreamEvent) => void
  >();

  // ---------------------------------------------------------------------------
  // ChatRuntime.sendMessage — drives the internal generator and dispatches
  // chunks to all registered onStream callbacks.
  // ---------------------------------------------------------------------------

  private getCurrentUserId(): string {
    const authenticatedUserId = useUnifiedAuthStore.getState().user?.id;
    if (authenticatedUserId) return authenticatedUserId;
    return selectPrivacyMode(useAppModeStore.getState()) === 'local' ? LOCAL_DESKTOP_USER_ID : '';
  }

  private async ensureBackendConversation(
    frontendConversationId: string,
    content: string,
  ): Promise<number> {
    const existingId = uuidToDbId(frontendConversationId);
    if (typeof existingId === 'number' && existingId > 0) {
      return existingId;
    }

    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new Error('Please sign in to send messages.');
    }

    const raw = await invoke<RawConversation>('chat_create_conversation', {
      request: {
        title: content.trim().slice(0, 50) || 'New Conversation',
        userId,
        projectId: null,
      },
    });

    const dbId = Number(raw.id);
    if (!Number.isFinite(dbId) || dbId <= 0) {
      throw new Error('Failed to create a backend conversation.');
    }

    useDesktopChatStore.getState().linkConversationId(frontendConversationId, dbId);
    return dbId;
  }

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const params: SendMessageParams = {
      conversationId,
      content,
      model: options?.model,
      provider: options?.provider,
      attachments: undefined,
      signal: options?.signal,
      // Forward the composer controls that were previously dropped here.
      thinkingEnabled: options?.thinkingEnabled,
      webSearch: options?.webSearch,
      systemPrompt: options?.systemPrompt,
      agentMode: options?.agentMode,
      effort: options?.effort,
    };
    for await (const chunk of this._streamMessage(params)) {
      if (this._streamCallbacks.size > 0) {
        let event: import('@agiworkforce/unified-chat').StreamEvent | null = null;
        if (chunk.type === 'text') event = { type: 'content', content: chunk.content };
        else if (chunk.type === 'thinking') event = { type: 'thinking', content: chunk.content };
        else if (chunk.type === 'tool_call') {
          event = {
            type: 'tool_call',
            toolCall: {
              id: chunk.data.id,
              name: chunk.data.name,
              args: chunk.data.input ?? {},
            },
          };
        } else if (chunk.type === 'tool_result') {
          event = {
            type: 'tool_result',
            toolCallId: chunk.data.id,
            result: chunk.data.output,
            error: chunk.data.error,
            durationMs: chunk.data.durationMs,
          };
        } else if (chunk.type === 'artifact') {
          event = {
            type: 'artifact',
            artifact: chunk.data,
          };
        } else if (chunk.type === 'done') event = { type: 'done' };
        else if (chunk.type === 'error') event = { type: 'error', error: chunk.content };
        if (event) {
          for (const cb of this._streamCallbacks) {
            cb(event);
          }
        }
      }
    }
    // Post-turn cloud sync: debounced, managed-only gate re-checked inside.
    // Fire-and-forget — never blocks the caller.
    triggerCloudSyncAfterTurn();
  }

  onStream(
    callback: (event: import('@agiworkforce/unified-chat').StreamEvent) => void,
  ): () => void {
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  // Aliases so the optional interface methods work
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.loadMessages(conversationId);
  }

  async listConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    const convs = await this.loadConversations();
    return convs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }));
  }

  // ---------------------------------------------------------------------------
  // Internal async generator — yields raw StreamChunk objects
  // ---------------------------------------------------------------------------

  private async *_streamMessage(params: SendMessageParams): AsyncIterable<StreamChunk> {
    const {
      conversationId,
      content,
      model,
      provider,
      attachments,
      signal,
      thinkingEnabled,
      webSearch,
      systemPrompt,
      // agentMode intentionally not forwarded — see the comment on
      // `focusMode`/`enableAgentMode` below for why mapping it onto
      // `enableAgentMode` was the LOCAL-CHAT-NOINVOKE-01 root cause.
      effort,
    } = params;
    const frontendMessageId = crypto.randomUUID();
    const userId = this.getCurrentUserId();

    if (!userId) {
      yield { type: 'error', content: 'Please sign in to send messages.' };
      return;
    }

    let backendConversationId: number;
    try {
      backendConversationId = await this.ensureBackendConversation(conversationId, content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: 'error', content: message };
      return;
    }

    // Mark this conversation as not stopped before we start
    this._stopFlags.set(conversationId, false);

    // Yield chunks by listening to Tauri events. We use a promise queue so
    // the async generator can pause waiting for the next event without
    // blocking the event thread.
    type Resolve = (value: StreamChunk | null) => void;
    const queue: StreamChunk[] = [];
    const waiting: Resolve[] = [];
    let done = false;

    const push = (chunk: StreamChunk | null) => {
      if (chunk === null) {
        done = true;
      } else {
        queue.push(chunk);
      }
      const resolve = waiting.shift();
      if (resolve) {
        resolve(queue.shift() ?? null);
      }
    };

    const nextChunk = (): Promise<StreamChunk | null> => {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      if (done) {
        return Promise.resolve(null);
      }
      return new Promise<StreamChunk | null>((resolve) => {
        waiting.push(resolve);
      });
    };

    // Register all event listeners
    const unlisteners: Array<() => void> = [];

    const registerListener = async <T>(
      event: string,
      handler: (payload: T) => void,
    ): Promise<void> => {
      const unlisten = await listen<T>(event, ({ payload }) => handler(payload));
      unlisteners.push(unlisten);
    };

    // chat:stream-chunk — incremental text delta
    await registerListener<StreamChunkPayload>('chat:stream-chunk', (payload) => {
      const convId = String(payload.conversation_id);
      if (
        convId !== String(backendConversationId) &&
        payload.conversation_id !== backendConversationId
      )
        return;
      push({ type: 'text', content: payload.delta });
    });

    // chat:stream-end — stream finished normally
    await registerListener<StreamEndPayload>('chat:stream-end', (payload) => {
      const convId = String(payload.conversation_id);
      if (
        convId !== String(backendConversationId) &&
        payload.conversation_id !== backendConversationId
      )
        return;
      push({ type: 'done' });
      push(null);
    });

    // chat:stream-error — stream finished with error
    await registerListener<StreamErrorPayload>('chat:stream-error', (payload) => {
      const convId = String(payload.conversation_id);
      if (
        convId !== String(backendConversationId) &&
        payload.conversation_id !== backendConversationId
      )
        return;
      push({ type: 'error', content: payload.error });
      push(null);
    });

    // tool:event — tool call lifecycle events
    await registerListener<ToolEventPayload>('tool:event', (payload) => {
      if (payload.type === 'started') {
        push({
          type: 'tool_call',
          data: {
            id: payload.id,
            name: payload.name ?? '',
            status: 'running',
            input: payload.args ?? {},
          },
        });
      } else if (payload.type === 'completed') {
        push({
          type: 'tool_result',
          data: {
            id: payload.id,
            name: payload.name ?? '',
            status: payload.error ? 'failed' : 'completed',
            output: payload.output,
            error: payload.error,
            durationMs: payload.duration_ms,
          },
        });
      }
    });

    // chat:artifact — emitted when a `create_artifact` tool call completes
    // during this turn (core/llm/tool_executor/artifact_tools.rs). Mirrors
    // the chat:stream-chunk conversation-id filter above.
    await registerListener<ArtifactEventPayload>('chat:artifact', (payload) => {
      const convId = payload.conversation_id === null ? null : String(payload.conversation_id);
      if (convId !== null && convId !== String(backendConversationId)) return;
      push({
        type: 'artifact',
        data: {
          id: payload.artifact.id,
          type: payload.artifact.type as import('@agiworkforce/unified-chat').Artifact['type'],
          title: payload.artifact.title,
          content: payload.artifact.content,
          language: payload.artifact.language ?? undefined,
          metadata: payload.artifact.metadata,
        },
      });
    });

    // Cleanup helper
    const cleanup = () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
      unlisteners.length = 0;
    };

    // If the caller provides an AbortSignal, treat abort as stopGeneration
    if (signal) {
      signal.addEventListener('abort', () => {
        push({ type: 'done' });
        push(null);
        cleanup();
      });
    }

    // Kick off the Rust-side stream after listeners are ready.
    try {
      const activeMode = useAppModeStore.getState().mode;
      await invoke('chat_send_message', {
        request: {
          content,
          userId,
          provider,
          modelOverride: model,
          conversationId: backendConversationId,
          attachments: attachments ?? [],
          stream: true,
          frontendMessageId,
          // activeMode is the authoritative trust-boundary signal.  The backend
          // MUST honor this: "local" => no ManagedCloud, "cloud" => cloud only.
          activeMode,
          // Cloud credits (AGI Managed Cloud) are ONLY for managed mode. BYOK is a
          // private path that goes DIRECT to the user's provider — it must never be
          // billed/routed through AGI managed cloud. activeMode is binary
          // ('local'|'cloud') and lumps byok+managed together, so derive the 3-way
          // PrivacyMode here (mirrors the canonical logic in features/chat/index.tsx).
          preferCloudCredits: selectPrivacyMode(useAppModeStore.getState()) === 'managed',
          // Composer controls — the Rust ChatSendMessageRequest already accepts
          // these camelCase aliases; they were previously dropped client-side.
          thinkingMode: thinkingEnabled,
          reasoningEffort: effort,
          customInstructions: systemPrompt,
          // BUG (LOCAL-CHAT-NOINVOKE-01 root cause, found 2026-07-03): `agentMode`
          // here is the AgentControl composer chip's permission-style value —
          // 'ask' | 'auto' | 'plan' | 'bypass' (see SendMessageOptions.agentMode
          // doc). It is ALWAYS a non-empty string once a conversation exists
          // (default 'ask'), so the previous `agentMode ? true : undefined` was
          // unconditionally true. That forced `enable_agent_mode: true` on every
          // send. For an explicit (non-"auto") model — the normal case in Local
          // mode, since there is no ManagedCloud auto-routing fallback there —
          // the backend trusts this flag directly
          // (send_message_setup::resolve_request_flags) and skips
          // detect_agent_mode's intent/accessibility checks entirely, so EVERY
          // plain chat message was being routed through the full computer-use
          // AgentOrchestrator (send_message_execution::spawn_streaming_agent)
          // instead of a normal LLM completion — explaining sends that never
          // produce a visible assistant reply. `agentMode` is a tool-confirmation
          // permission style, not an "activate agent mode" switch, and there is
          // currently no chat_send_message field for it — do not forward it here.
          focusMode: webSearch ? 'web' : undefined,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cleanup();
      yield { type: 'error', content: message };
      return;
    }

    try {
      while (true) {
        // Check stop flag on each iteration
        if (this._stopFlags.get(conversationId)) {
          yield { type: 'done' };
          break;
        }

        const chunk = await nextChunk();
        if (chunk === null) break;
        yield chunk;
      }
    } finally {
      cleanup();
      this._stopFlags.delete(conversationId);
    }
  }

  stopGeneration(conversationId: string): void {
    this._stopFlags.set(conversationId, true);
    const backendConversationId = uuidToDbId(conversationId);
    // Fire-and-forget: signal the Rust backend to halt the stream
    void invoke('chat_stop_generation', { conversationId: backendConversationId }).catch(() => {
      // Ignore errors — the stop flag already prevents further yields
    });
  }

  async createConversation(title?: string, projectId?: string): Promise<Conversation> {
    const userId = this.getCurrentUserId();
    const raw = await invoke<RawConversation>('chat_create_conversation', {
      request: {
        title: title ?? 'New Conversation',
        userId,
        projectId: projectId ?? null,
      },
    });
    return mapConversation(raw);
  }

  async loadConversations(): Promise<Conversation[]> {
    // Pass the active mode so the backend applies strict mode-scoped filtering:
    // Local conversations never appear in Cloud mode and vice-versa.
    const appMode = useAppModeStore.getState().mode;
    const raw = await invoke<RawConversation[]>('chat_get_conversations', {
      userId: this.getCurrentUserId(),
      appMode,
    });
    return Array.isArray(raw) ? raw.map(mapConversation) : [];
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    const raw = await invoke<RawMessage[]>('chat_get_messages', {
      conversationId: uuidToDbId(conversationId),
      userId: this.getCurrentUserId(),
    });
    return Array.isArray(raw) ? raw.map(mapMessage) : [];
  }

  async deleteConversation(id: string): Promise<void> {
    await invoke('chat_delete_conversation', {
      id: uuidToDbId(id),
      userId: this.getCurrentUserId(),
    });
  }

  async archiveConversation(id: string, userId?: string, archived?: boolean): Promise<void> {
    await invoke('chat_archive_conversation', {
      conversationId: uuidToDbId(id),
      userId: userId ?? this.getCurrentUserId(),
      archived: archived ?? true,
    });
  }

  async renameConversation(id: string, title: string, userId?: string): Promise<void> {
    await invoke('chat_update_conversation_title', {
      conversationId: uuidToDbId(id),
      title,
      userId: userId ?? this.getCurrentUserId(),
    });
  }

  async uploadFile(file: File): Promise<FileRef> {
    // Read the file as a base64 data URL for IPC transport
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    const raw = await invoke<RawFileUploadResult>('upload_file', {
      name: file.name,
      mimeType: file.type,
      dataUrl,
      size: file.size,
    });

    return {
      id: raw.id,
      name: raw.name,
      url: raw.url,
      mimeType: raw.mime_type ?? raw.mimeType ?? file.type,
      size: raw.size ?? file.size,
    };
  }

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'desktop';
  }

  // ---------------------------------------------------------------------------
  // Artifact persistence — backs ArtifactPanel's edit-in-place + version
  // stepper (packages/unified-chat/src/components/{ChatInterface,ArtifactPanel}.tsx).
  // ---------------------------------------------------------------------------

  async updateArtifact(
    artifactId: string,
    content: string,
  ): Promise<{ id: string; content: string }> {
    // Editing a historical version (pseudo-id `<realId>::v<n>`, see
    // getArtifactVersions below) always writes back to the real artifact —
    // matching the backend's own rollback() semantics ("rollback creates a
    // new version with the old content").
    const realId = artifactId.split('::v')[0] ?? artifactId;
    const response = await invoke<RawArtifactResponse<RawArtifact>>('artifact_update', {
      id: realId,
      content,
      changeDescription: 'Edited from chat',
      title: null,
      metadata: null,
      tags: null,
    });
    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to save artifact edit');
    }
    return { id: response.data.id, content: response.data.content };
  }

  async getArtifactVersions(
    current: import('@agiworkforce/unified-chat').Artifact,
  ): Promise<import('@agiworkforce/unified-chat').Artifact[]> {
    const realId = current.id.split('::v')[0] ?? current.id;
    const response = await invoke<RawArtifactResponse<RawArtifactVersion[]>>(
      'artifact_get_versions',
      { id: realId },
    );
    if (!response.success || !response.data) {
      return [];
    }
    const versions = [...response.data].sort((a, b) => a.version - b.version);
    const latest = versions.length > 0 ? versions[versions.length - 1] : undefined;
    return versions.map((version) => ({
      ...current,
      id: latest && version.version === latest.version ? realId : `${realId}::v${version.version}`,
      content: version.content,
    }));
  }
}
