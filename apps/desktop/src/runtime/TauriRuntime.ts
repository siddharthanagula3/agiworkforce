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
  Artifact,
  FileRef,
  SendMessageOptions,
  SendMessageParams,
  StreamChunk,
  TauriAttachmentPayload,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import {
  getToolDisplayLabel,
  type AgentEventEnvelope,
  type AgentEventToolCategory,
  type ChatExecutionMode,
} from '@agiworkforce/types';
import type { AgentEvent, JsonValue } from '@agiworkforce/types/protocol';
import { invoke } from '../lib/tauri-mock';
import { listen } from '../lib/tauri-mock';
import { useUnifiedAuthStore } from '../stores/auth';
import { useAppModeStore, selectPrivacyMode } from '../stores/appModeStore';
import { useSettingsStore } from '../stores/settingsStore';
import { personalizationToPrompt } from '../features/chat/personalizationToPrompt';
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

interface AgentThinkingPayload {
  thinking: boolean;
  message?: string;
  phase?: string;
}

interface ThinkingEventPayload {
  event_type: 'start' | 'delta' | 'complete';
  content: string;
  message_id?: string | null;
  tokens?: number | null;
  timestamp: number;
}

interface AgentProgressPayload {
  conversation_id: string | number;
  iteration: number;
  max_iterations: number;
  status: string;
  tool_count?: number;
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
    version?: number;
    created_at?: string;
    updated_at?: string;
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
  created_at?: string;
}

// Full Rust Artifact shape returned by artifact_get_conversation_snapshot.
// `render_type` is the exact shared renderer type; `artifact_type` is the
// coarser Rust category retained only for native rendering/filtering.
interface RawConversationArtifact {
  id: string;
  artifact_type?: string;
  render_type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  conversation_id?: string | number | null;
  message_id?: string | number | null;
  current_version: number;
  created_at?: string;
  updated_at?: string;
}

const ARTIFACT_RENDER_TYPES = new Set<Artifact['type']>([
  'code',
  'react',
  'component',
  'chart',
  'diagram',
  'table',
  'mermaid',
  'spreadsheet',
  'presentation',
  'html',
  'image',
  'video',
  'audio',
  'music',
  'search',
  'document',
  'markdown',
  'json',
  'csv',
  'svg',
  'email',
  'research',
]);

function isArtifactRenderType(value: unknown): value is Artifact['type'] {
  return typeof value === 'string' && ARTIFACT_RENDER_TYPES.has(value as Artifact['type']);
}

function resolveArtifactRenderType(renderType: unknown, nativeType?: unknown): Artifact['type'] {
  if (isArtifactRenderType(renderType)) return renderType;
  switch (nativeType) {
    case 'code':
    case 'document':
    case 'spreadsheet':
    case 'diagram':
    case 'chart':
    case 'presentation':
    case 'image':
      return nativeType;
    case 'web':
      return 'html';
    default:
      return 'document';
  }
}

function isRawConversationArtifact(value: unknown): value is RawConversationArtifact {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    candidate['id'].trim().length > 0 &&
    typeof candidate['render_type'] === 'string' &&
    typeof candidate['title'] === 'string' &&
    typeof candidate['content'] === 'string' &&
    typeof candidate['current_version'] === 'number' &&
    Number.isInteger(candidate['current_version']) &&
    candidate['current_version'] >= 0
  );
}

function inferAgentToolCategory(name: string): AgentEventToolCategory {
  const normalized = name.toLowerCase();
  if (normalized.includes('browser') || normalized.includes('computer')) return 'computer-use';
  if (normalized.includes('web_search') || normalized.includes('search_web')) return 'web-search';
  if (normalized.includes('web_fetch') || normalized.includes('fetch_url')) return 'web-fetch';
  if (normalized.includes('read') || normalized.includes('write') || normalized.includes('file')) {
    return 'filesystem';
  }
  if (
    normalized.includes('shell') ||
    normalized.includes('bash') ||
    normalized.includes('terminal')
  ) {
    return 'shell';
  }
  if (normalized.includes('code') || normalized.includes('python')) return 'code-execution';
  if (normalized.includes('artifact')) return 'artifact';
  if (normalized.includes('memory')) return 'memory';
  if (normalized.includes('skill')) return 'skill';
  if (normalized.startsWith('mcp__')) return 'mcp';
  if (normalized.includes('connector')) return 'connector';
  return 'other';
}

function toAgentJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toAgentJsonValue);
  if (typeof value !== 'object') return null;

  const result: { [key: string]: JsonValue } = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue !== undefined) result[key] = toAgentJsonValue(nestedValue);
  }
  return result;
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
  execution_mode?: ChatExecutionMode;
  executionMode?: ChatExecutionMode;
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
    executionMode: raw.execution_mode ?? raw.executionMode,
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

function mapPersistedArtifact(raw: RawConversationArtifact): Artifact {
  const metadata = raw.metadata ?? {};
  const metadataLanguage = metadata['language'];
  return {
    id: raw.id,
    type: resolveArtifactRenderType(raw.render_type, raw.artifact_type),
    title: raw.title,
    content: raw.content,
    language: typeof metadataLanguage === 'string' ? metadataLanguage : undefined,
    version: raw.current_version,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    conversationId:
      raw.conversation_id === null || raw.conversation_id === undefined
        ? undefined
        : String(raw.conversation_id),
    messageId:
      raw.message_id === null || raw.message_id === undefined ? undefined : String(raw.message_id),
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Attachment encoding (DESKTOP-ATTACHMENT-SEND-WIRE-SEVERED-01)
//
// `File` objects cannot cross the Tauri IPC boundary, so every attachment
// the composer collected must be read into a base64 data URL and shaped to
// match the Rust `ChatAttachment` struct (`apps/desktop/src-tauri/src/sys/
// commands/chat/types.rs`) before `invoke('chat_send_message', ...)`.
// ---------------------------------------------------------------------------

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read attachment "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

/**
 * `File.name` is always a bare filename per the File API spec, but we strip
 * any stray path separators defensively — the backend's `ChatAttachment`
 * validator rejects `/`, `\`, and `..` in `name` (path-traversal guard).
 */
function sanitizeAttachmentName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(/\.\./g, '_');
}

async function encodeAttachmentsForIpc(files: File[]): Promise<TauriAttachmentPayload[]> {
  return Promise.all(
    files.map(async (file) => {
      const dataUrl = await readFileAsDataUrl(file);
      return {
        id: crypto.randomUUID(),
        // Only 'image' routes through the vision/multimodal path on the
        // backend; every other accepted type (PDF/text/CSV/code) is a
        // document that goes through text extraction instead.
        type: file.type.startsWith('image/') ? 'image' : 'file',
        name: sanitizeAttachmentName(file.name),
        mimeType: file.type || undefined,
        content: dataUrl,
      } satisfies TauriAttachmentPayload;
    }),
  );
}

// ---------------------------------------------------------------------------
// TauriRuntime implementation
// ---------------------------------------------------------------------------

export class TauriRuntime implements ChatRuntime {
  // Track active stop requests keyed by conversationId so stopGeneration()
  // can signal Tauri and wait for its authoritative stream-end acknowledgement.
  private readonly _stopFlags = new Map<string, boolean>();
  private readonly _stopSettlers = new Map<string, () => void>();

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

  private getConversationExecutionMode(conversationId: string): ChatExecutionMode {
    const conversation = useDesktopChatStore
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    if (conversation?.executionMode) return conversation.executionMode;
    return useAppModeStore.getState().mode === 'cloud' ? 'cloud_managed' : 'local_only';
  }

  private async ensureBackendConversation(
    frontendConversationId: string,
    content: string,
    executionMode: ChatExecutionMode,
  ): Promise<number> {
    const existingId = uuidToDbId(frontendConversationId);
    if (typeof existingId === 'number' && existingId > 0) {
      return existingId;
    }

    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new Error('Please sign in to send messages.');
    }

    // Carry the conversation's project scope ("AGI Work") into the backend
    // row — the frontend-only projectId set via setConversationProject would
    // otherwise be lost on the lazy first-send create.
    const projectId =
      useDesktopChatStore.getState().conversations.find((c) => c.id === frontendConversationId)
        ?.projectId ?? null;

    const raw = await invoke<RawConversation>('chat_create_conversation', {
      request: {
        title: content.trim().slice(0, 50) || 'New Conversation',
        userId,
        projectId,
        executionMode,
      },
    });

    const dbId = Number(raw.id);
    if (!Number.isFinite(dbId) || dbId <= 0) {
      throw new Error('Failed to create a backend conversation.');
    }

    useDesktopChatStore.getState().linkConversationId(frontendConversationId, dbId);
    if (import.meta.env.DEV) {
      // W5 stage-2 session labeling — additive, dev/test-only (see
      // ./sessionLabeling.ts module doc). Does not change what gets persisted
      // or returned; only asserts the new conversation's AppSession/
      // ExecutionProfile are internally consistent.
      const { desktopExecutionProfileFor, labelDesktopSession } = await import('./sessionLabeling');
      labelDesktopSession({
        id: String(dbId),
        ownerUserId: userId,
        chatExecutionMode: executionMode,
      });
      desktopExecutionProfileFor(executionMode);
    }
    return dbId;
  }

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    // DESKTOP-ATTACHMENT-SEND-WIRE-SEVERED-01: `options.attachments` carries
    // the real `File` objects ChatInput held locally. Previously this was
    // hardcoded to `undefined` here, so no attachment content ever reached
    // the backend regardless of what the user attached.
    const attachments =
      options?.attachments && options.attachments.length > 0
        ? await encodeAttachmentsForIpc(options.attachments)
        : undefined;
    const params: SendMessageParams = {
      conversationId,
      content,
      model: options?.model,
      provider: options?.provider,
      attachments,
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
        else if (chunk.type === 'thinking') {
          event = {
            type: 'thinking',
            content: chunk.content,
            durationMs: chunk.durationMs,
            completed: chunk.completed,
          };
        } else if (chunk.type === 'agent_event') {
          event = { type: 'agent_event', envelope: chunk.data };
        } else if (chunk.type === 'tool_call') {
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
    const executionMode = this.getConversationExecutionMode(conversationId);

    if (!userId) {
      yield { type: 'error', content: 'Please sign in to send messages.' };
      return;
    }

    let backendConversationId: number;
    try {
      backendConversationId = await this.ensureBackendConversation(
        conversationId,
        content,
        executionMode,
      );
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
    const streamedArtifactIds = new Set<string>();
    let done = false;
    let streamEndHandled = false;
    let agentEventSequence = 0;
    let thinkingStartedAtMs = Date.now();
    let streamedThinkingContent = '';
    let stopWatchdog: ReturnType<typeof setTimeout> | undefined;

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

    const beginStopWait = () => {
      if (stopWatchdog) return;
      stopWatchdog = setTimeout(() => {
        push({
          type: 'error',
          content:
            'Stopping generation timed out before the native runtime could finalize the response and its artifacts.',
        });
        push(null);
      }, 10_000);
    };
    this._stopSettlers.set(conversationId, beginStopWait);

    // Register all event listeners
    const unlisteners: Array<() => void> = [];

    const registerListener = async <T>(
      event: string,
      handler: (payload: T) => void,
    ): Promise<void> => {
      const unlisten = await listen<T>(event, ({ payload }) => handler(payload));
      unlisteners.push(unlisten);
    };

    const pushAgentEvent = (event: AgentEvent) => {
      const envelope: AgentEventEnvelope = {
        // The Rust-owned canonical agent-event schema is currently v3.
        schemaVersion: 3,
        sessionId: String(backendConversationId),
        turnId: frontendMessageId,
        sequence: agentEventSequence++,
        emittedAtMs: Date.now(),
        event,
      };
      push({ type: 'agent_event', data: envelope });
    };

    // Native Local lifecycle updates are adapted into the same canonical,
    // renderer-neutral activity envelope used by managed Cloud. This keeps the
    // shared ChatInterface responsible for presentation while Tauri owns only
    // transport translation.
    await registerListener<AgentThinkingPayload>('agent:thinking', (payload) => {
      if (!payload.thinking) return;
      thinkingStartedAtMs = Date.now();
      pushAgentEvent({
        type: 'progress-update',
        progressId: 'local-thinking',
        summary: payload.message?.trim() || payload.phase?.trim() || 'Thinking…',
        status: 'running',
      });
    });

    // Provider reasoning is a separate, typed native event. Keep the native
    // transport details here and expose only the surface-neutral shared
    // `thinking` chunk to ChatInterface. Completion payloads contain the full
    // trace, so emit only the unseen suffix after any deltas.
    await registerListener<ThinkingEventPayload>('thinking:event', (payload) => {
      if (payload.message_id && payload.message_id !== frontendMessageId) return;

      if (payload.event_type === 'start') {
        thinkingStartedAtMs = payload.timestamp;
        streamedThinkingContent = '';
        return;
      }

      const durationMs = Math.max(0, payload.timestamp - thinkingStartedAtMs);
      if (payload.event_type === 'delta') {
        streamedThinkingContent += payload.content;
        push({
          type: 'thinking',
          content: payload.content,
          durationMs,
          completed: false,
        });
        return;
      }

      const unseenContent = payload.content.startsWith(streamedThinkingContent)
        ? payload.content.slice(streamedThinkingContent.length)
        : streamedThinkingContent.endsWith(payload.content)
          ? ''
          : payload.content;
      streamedThinkingContent =
        payload.content.length >= streamedThinkingContent.length
          ? payload.content
          : streamedThinkingContent;
      push({
        type: 'thinking',
        content: unseenContent,
        durationMs,
        completed: true,
      });
    });

    await registerListener<AgentProgressPayload>('chat:agent-progress', (payload) => {
      if (String(payload.conversation_id) !== String(backendConversationId)) return;
      const toolCount = payload.tool_count ?? 0;
      const limitReached = payload.status === 'limit_reached';
      pushAgentEvent({
        type: 'progress-update',
        progressId: 'local-agent-iteration',
        summary: limitReached
          ? `Agent reached iteration limit (${payload.max_iterations})`
          : `Agent iteration ${payload.iteration}/${payload.max_iterations}${
              toolCount > 0 ? ` — ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}` : ''
            }`,
        ...(limitReached ? {} : { detail: 'Running local tools' }),
        status: limitReached ? 'failed' : 'running',
      });
    });

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
      if (streamEndHandled) return;
      streamEndHandled = true;

      void (async () => {
        const backendMessageId = payload.backend_message_id;
        if (
          streamedArtifactIds.size > 0 &&
          typeof backendMessageId === 'number' &&
          backendMessageId > 0
        ) {
          const response = await invoke<RawArtifactResponse<number>>('artifact_link_to_message', {
            conversationId: backendConversationId,
            messageId: backendMessageId,
            artifactIds: [...streamedArtifactIds],
            userId,
          });
          if (!response.success) {
            push({
              type: 'error',
              content:
                response.error ??
                'The response completed, but its artifacts could not be saved to conversation history.',
            });
            push(null);
            return;
          }
        }

        push({ type: 'done' });
        push(null);
      })().catch((error: unknown) => {
        push({
          type: 'error',
          content:
            error instanceof Error
              ? error.message
              : 'The response completed, but its artifacts could not be saved to conversation history.',
        });
        push(null);
      });
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
        const name = payload.name ?? '';
        const display = getToolDisplayLabel(name);
        pushAgentEvent({
          type: 'tool-execution-start',
          toolCallId: payload.id,
          name,
          category: inferAgentToolCategory(name),
          summary: display.activeForm,
          input: toAgentJsonValue(payload.args ?? {}),
        });
        push({
          type: 'tool_call',
          data: {
            id: payload.id,
            name,
            status: 'running',
            input: payload.args ?? {},
          },
        });
      } else if (payload.type === 'completed') {
        const name = payload.name ?? '';
        pushAgentEvent({
          type: 'tool-execution-end',
          toolCallId: payload.id,
          name,
          output: toAgentJsonValue(payload.error ?? payload.output ?? null),
          isError: Boolean(payload.error),
          ...(payload.duration_ms !== undefined ? { elapsedMs: payload.duration_ms } : {}),
        });
        push({
          type: 'tool_result',
          data: {
            id: payload.id,
            name,
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
      if (
        !payload.artifact ||
        typeof payload.artifact.id !== 'string' ||
        typeof payload.artifact.type !== 'string' ||
        typeof payload.artifact.content !== 'string'
      ) {
        push({
          type: 'error',
          content: 'Received an invalid artifact payload from native runtime.',
        });
        return;
      }
      streamedArtifactIds.add(payload.artifact.id);
      push({
        type: 'artifact',
        data: {
          id: payload.artifact.id,
          type: resolveArtifactRenderType(payload.artifact.type),
          title: payload.artifact.title,
          content: payload.artifact.content,
          language: payload.artifact.language ?? undefined,
          version: payload.artifact.version ?? 1,
          createdAt: payload.artifact.created_at,
          updatedAt: payload.artifact.updated_at,
          conversationId: String(backendConversationId),
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

    // Cancellation must wait for native stream-end: that event carries the
    // durable assistant-message ID required to link artifacts before teardown.
    if (signal) {
      signal.addEventListener('abort', () => this.stopGeneration(conversationId), { once: true });
    }

    // Personalization ("Response Style" settings) must apply to EVERY send in
    // every mode (Local/BYOK/Managed), so merge the guidance block into the
    // conversation's custom instructions here — the single point every send
    // funnels through. personalizationToPrompt returns '' for neutral settings,
    // so a default profile adds nothing. (This is the sole wiring of the settings
    // panel into the model; the converter existed but had no caller.)
    const personalizationBlock = personalizationToPrompt(
      useSettingsStore.getState().personalization,
    );
    const mergedCustomInstructions =
      [personalizationBlock, systemPrompt].filter((s) => s && s.trim()).join('\n\n') || undefined;

    // Kick off the Rust-side stream after listeners are ready.
    try {
      const activeMode = executionMode === 'cloud_managed' ? 'cloud' : 'local';
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
          executionMode,
          // Cloud credits (AGI Managed Cloud) are ONLY for managed mode. BYOK is a
          // private path that goes DIRECT to the user's provider — it must never be
          // billed/routed through AGI managed cloud. activeMode is binary
          // ('local'|'cloud') and lumps byok+managed together, so derive the 3-way
          // PrivacyMode here (mirrors the canonical logic in features/chat/index.tsx).
          preferCloudCredits: executionMode === 'cloud_managed',
          // Composer controls — the Rust ChatSendMessageRequest already accepts
          // these camelCase aliases; they were previously dropped client-side.
          thinkingMode: thinkingEnabled,
          reasoningEffort: effort,
          customInstructions: mergedCustomInstructions,
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
        const chunk = await nextChunk();
        if (chunk === null) break;
        yield chunk;
      }
    } finally {
      if (stopWatchdog) clearTimeout(stopWatchdog);
      cleanup();
      this._stopFlags.delete(conversationId);
      this._stopSettlers.delete(conversationId);
    }
  }

  stopGeneration(conversationId: string): void {
    if (this._stopFlags.get(conversationId)) return;
    this._stopFlags.set(conversationId, true);
    this._stopSettlers.get(conversationId)?.();
    const backendConversationId = uuidToDbId(conversationId);
    // Fire-and-forget: signal the Rust backend to halt the stream
    void invoke('chat_stop_generation', { conversationId: backendConversationId }).catch(() => {
      // Ignore errors — the stop flag already prevents further yields
    });
  }

  async createConversation(title?: string, projectId?: string): Promise<Conversation> {
    const userId = this.getCurrentUserId();
    const executionMode: ChatExecutionMode =
      useAppModeStore.getState().mode === 'cloud' ? 'cloud_managed' : 'local_only';
    const raw = await invoke<RawConversation>('chat_create_conversation', {
      request: {
        title: title ?? 'New Conversation',
        userId,
        projectId: projectId ?? null,
        executionMode,
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
    const backendConversationId = uuidToDbId(conversationId);
    const raw = await invoke<RawMessage[]>('chat_get_messages', {
      conversationId: backendConversationId,
      userId: this.getCurrentUserId(),
    });
    const messages = Array.isArray(raw) ? raw.map(mapMessage) : [];
    if (
      typeof backendConversationId !== 'number' ||
      backendConversationId <= 0 ||
      messages.length === 0
    ) {
      return messages;
    }

    let response: unknown;
    try {
      response = await invoke<unknown>('artifact_get_conversation_snapshot', {
        conversationId: backendConversationId,
        userId: this.getCurrentUserId(),
      });
    } catch {
      // Message history remains usable if an older native binary does not yet
      // expose the additive artifact snapshot command.
      return messages;
    }
    if (!response || typeof response !== 'object') return messages;
    const snapshotResponse = response as Record<string, unknown>;
    if (snapshotResponse['success'] !== true || !Array.isArray(snapshotResponse['data'])) {
      return messages;
    }

    const messagesById = new Map(messages.map((message) => [message.id, message]));
    for (const rawArtifact of snapshotResponse['data']) {
      if (!isRawConversationArtifact(rawArtifact)) continue;
      const artifact = mapPersistedArtifact(rawArtifact);
      if (!artifact.messageId || artifact.conversationId !== String(backendConversationId)) {
        continue;
      }
      const owner = messagesById.get(artifact.messageId);
      if (!owner) continue;
      owner.artifacts = [...(owner.artifacts ?? []), artifact];
    }

    return messages;
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
  // stepper (packages/ui/unified-chat/src/components/{ChatInterface,ArtifactPanel}.tsx).
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
      version: version.version,
      updatedAt: version.created_at ?? current.updatedAt,
    }));
  }
}
