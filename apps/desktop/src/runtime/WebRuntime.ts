/**
 * WebRuntime
 *
 * Implements the ChatRuntime interface from @agiworkforce/unified-chat for the web
 * (cloud) deployment. Uses the cloud API gateway for conversation CRUD and
 * SSE streaming for message generation.
 *
 * Streaming pattern:
 *   - sendMessage() calls sendCloudMessage() which opens an SSE connection
 *   - SSE chunks are forwarded to registered onStream callbacks
 *   - Cancellation is handled via AbortController
 */

import type {
  ChatRuntime,
  CloudApprovalTurnProjection,
  GeneratedFileEntry,
  SendMessageOptions,
  StreamCallback,
  StreamEvent,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import { parseGeneratedFilesDelta, resolveGeneratedFileUri } from '@agiworkforce/cloud-contracts';
import {
  listCloudConversations,
  createCloudConversation,
  getCloudConversation,
  deleteCloudConversation,
  updateCloudConversationTitle,
  sendCloudMessage,
  CLOUD_API_BASE_URL,
  type CloudConversation,
  type CloudMessage,
} from '../api/cloudApi';
import { getProviderDefaultModel, normalizeModelId } from '../constants/llm';
import { getDefaultModelFor } from '@agiworkforce/types';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils';
import { createCloudStreamDeltaSink } from './cloudStreamDeltas';
import { CloudToolApprovalRegistry, mapPersistedCloudApprovalToolCalls } from './cloudToolApproval';

// ---------------------------------------------------------------------------
// Mapping helpers — cloud API uses snake_case, ChatRuntime uses camelCase
// ---------------------------------------------------------------------------

function mapConversation(cloud: CloudConversation): Conversation {
  return {
    id: cloud.id,
    title: cloud.title ?? 'New Conversation',
    createdAt: cloud.created_at,
    updatedAt: cloud.updated_at,
    model: cloud.model,
    messageCount: cloud.messages?.length,
    archived: false,
    pinned: false,
  };
}

function mapMessage(cloud: CloudMessage): ChatMessage {
  const approvalToolCalls = mapPersistedCloudApprovalToolCalls(cloud.metadata);
  return {
    id: cloud.id,
    conversationId: cloud.conversation_id,
    role: cloud.role,
    content: cloud.content,
    createdAt: cloud.created_at,
    model: cloud.model,
    ...(cloud.provider ? { provider: cloud.provider } : {}),
    ...(cloud.metadata ? { metadata: cloud.metadata } : {}),
    ...(approvalToolCalls ? { toolCalls: approvalToolCalls } : {}),
  };
}

/**
 * Map an `x_generated_files` delta payload onto UI entries. Wire uris are
 * relative same-origin paths (`/api/files/{id}`); resolve them against the
 * desktop cloud base URL (empty on the embedded web build, where the browser
 * resolves against the current origin). Exported for unit tests.
 */
export function mapGeneratedFilesPayload(payload: unknown): GeneratedFileEntry[] {
  return parseGeneratedFilesDelta(payload).map((f) => ({
    id: f.id,
    fileName: f.file_name,
    mimeType: f.mime_type,
    uri: resolveGeneratedFileUri(f.uri, CLOUD_API_BASE_URL),
    byteCount: f.byte_count,
    kind: f.kind,
    ...(f.checksum_sha256 ? { checksumSha256: f.checksum_sha256 } : {}),
    // Server-derived classification (file-creation parity Wave A) — the
    // contract defaults pre-classification payloads. Pass-through only.
    surface: f.surface,
    previewable: f.previewable,
  }));
}

// ---------------------------------------------------------------------------
// WebRuntime implementation
// ---------------------------------------------------------------------------

export class WebRuntime implements ChatRuntime {
  private readonly _streamCallbacks = new Set<StreamCallback>();
  private readonly _abortControllers = new Map<string, AbortController>();
  private readonly _approvals = new CloudToolApprovalRegistry();

  /**
   * Cloud SSE path supports Continue Generation: `sendMessage` sends the full
   * `messageHistory` as the thread, so a truncated/stopped turn can be reissued
   * with the partial + an ephemeral continue instruction and streamed back into
   * the same message. (TauriRuntime omits this — it drops `messageHistory`.)
   */
  readonly supportsContinueGeneration = true;

  /** The cloud SSE wire forwards `code_execution` — see `SendMessageOptions.codeExecution`. */
  readonly supportsCodeExecution = true;

  /** The managed cloud wire forwards the exact `research` request field. */
  readonly supportsResearch = true;

  /** Managed search uses the Cloud route's native-or-generic capability gate. */
  readonly supportsManagedWebSearch = true;

  private emit(event: StreamEvent): void {
    for (const cb of this._streamCallbacks) {
      cb(event);
    }
  }

  // -------------------------------------------------------------------------
  // sendMessage — streams via SSE through the cloud API
  // -------------------------------------------------------------------------

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const model =
      normalizeModelId(options?.model ?? '') ??
      getProviderDefaultModel('anthropic') ??
      getDefaultModelFor(null, 'chat');
    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);

    // If the caller provided an external signal, chain it
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const sink = createCloudStreamDeltaSink((event) => this.emit(event), CLOUD_API_BASE_URL);
    let runId: string | undefined;

    try {
      await sendCloudMessage(
        conversationId,
        content,
        model,
        sink.onChunk,
        // onDone
        () => {
          this._approvals.recordTurnOutcome(conversationId, runId, model, sink);
          const finishReason = sink.getFinishReason();
          const streamError = sink.getStreamError();
          this.emit({
            type: 'done',
            ...(finishReason ? { finishReason } : {}),
            ...(streamError ? { streamError } : {}),
          });
        },
        // onError
        (err: Error) => {
          this.emit({ type: 'error', error: err.message });
        },
        controller.signal,
        sink.onEvent,
        options?.webSearch,
        options?.messageHistory,
        options?.thinkingEnabled,
        options?.codeExecution,
        createManagedChatIdempotencyKey({
          surface: 'desktop',
          purpose: 'send',
          operationId: uuidv7(),
        }),
        options?.research || options?.workMode
          ? {
              ...(options.research ? { research: true } : {}),
              ...(options.workMode ? { workMode: options.workMode } : {}),
            }
          : undefined,
        (handle) => {
          runId = handle?.runId;
          if (handle) {
            this.emit({ type: 'agent_run', runId: handle.runId, runPath: handle.runPath });
          }
        },
      );
    } catch (err) {
      // Only emit error if it wasn't an intentional abort
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'error', error: message });
      }
    } finally {
      this._abortControllers.delete(conversationId);
    }
  }

  // -------------------------------------------------------------------------
  // resolveToolApproval — resume a turn suspended on x_tool_approval_request
  // -------------------------------------------------------------------------

  async resolveToolApproval(
    conversationId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ): Promise<void> {
    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);
    try {
      await this._approvals.resolve(
        conversationId,
        toolCallId,
        decision,
        (event) => this.emit(event),
        CLOUD_API_BASE_URL,
        (err) => this.emit({ type: 'error', error: err.message }),
        controller.signal,
      );
    } finally {
      this._abortControllers.delete(conversationId);
    }
  }

  hasLiveApprovalTurn(conversationId: string, projection?: CloudApprovalTurnProjection): boolean {
    return this._approvals.hasLiveTurn(conversationId, projection);
  }

  // -------------------------------------------------------------------------
  // stopGeneration — aborts the in-flight SSE request
  // -------------------------------------------------------------------------

  stopGeneration(conversationId: string): void {
    const controller = this._abortControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(conversationId);
    }
  }

  // -------------------------------------------------------------------------
  // onStream — register streaming event callbacks
  // -------------------------------------------------------------------------

  onStream(callback: StreamCallback): () => void {
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  // -------------------------------------------------------------------------
  // Conversation CRUD
  // -------------------------------------------------------------------------

  async createConversation(title?: string): Promise<Conversation> {
    const cloud = await createCloudConversation(
      title ?? 'New Conversation',
      getProviderDefaultModel('anthropic') ?? getDefaultModelFor(null, 'chat'),
    );
    return mapConversation(cloud);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await deleteCloudConversation(conversationId);
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await updateCloudConversationTitle(conversationId, title);
  }

  // -------------------------------------------------------------------------
  // Conversation listing
  // -------------------------------------------------------------------------

  async listConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    const conversations = await listCloudConversations();
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at,
    }));
  }

  async loadConversations(): Promise<Conversation[]> {
    const conversations = await listCloudConversations();
    return conversations.map(mapConversation);
  }

  // -------------------------------------------------------------------------
  // Message loading
  // -------------------------------------------------------------------------

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const conversation = await getCloudConversation(conversationId);
    return (conversation.messages ?? []).map(mapMessage);
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.getMessages(conversationId);
  }

  // -------------------------------------------------------------------------
  // Platform identifier
  // -------------------------------------------------------------------------

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'web';
  }
}
