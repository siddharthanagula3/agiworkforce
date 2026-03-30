/**
 * TauriRuntime
 *
 * Implements the ChatRuntime interface from @agiworkforce/chat, bridging
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
} from '@agiworkforce/chat';
import type { Conversation, ChatMessage } from '@agiworkforce/chat';
import { invoke } from '../lib/tauri-mock';
import { listen } from '../lib/tauri-mock';
import { useUnifiedAuthStore } from '../stores/auth';
import { useAppModeStore } from '../stores/appModeStore';
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
    (event: import('@agiworkforce/chat').StreamEvent) => void
  >();

  // ---------------------------------------------------------------------------
  // ChatRuntime.sendMessage — drives the internal generator and dispatches
  // chunks to all registered onStream callbacks.
  // ---------------------------------------------------------------------------

  private getCurrentUserId(): string {
    return useUnifiedAuthStore.getState().user?.id ?? '';
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
      attachments: undefined,
      signal: options?.signal,
    };
    for await (const chunk of this._streamMessage(params)) {
      if (this._streamCallbacks.size > 0) {
        let event: import('@agiworkforce/chat').StreamEvent | null = null;
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
  }

  onStream(callback: (event: import('@agiworkforce/chat').StreamEvent) => void): () => void {
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
    const { conversationId, content, model, attachments, signal } = params;
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
      await invoke('chat_send_message', {
        request: {
          content,
          userId,
          modelOverride: model,
          conversationId: backendConversationId,
          attachments: attachments ?? [],
          stream: true,
          frontendMessageId,
          preferCloudCredits: useAppModeStore.getState().mode === 'cloud',
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
    const raw = await invoke<RawConversation[]>('chat_get_conversations', {
      userId: this.getCurrentUserId(),
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
}
