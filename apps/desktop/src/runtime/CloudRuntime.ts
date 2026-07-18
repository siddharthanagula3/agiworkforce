/**
 * CloudRuntime
 *
 * Implements the ChatRuntime interface from @agiworkforce/unified-chat for
 * DESKTOP MANAGED-CLOUD mode (DCL-2/DCL-4). This is the "one logical cloud"
 * seam: desktop talks to the SAME backend as web, not a separate one.
 *
 *   - Conversation CRUD + message persistence: the shared
 *     `getDesktopCloudChatPersistenceClient()` (DCL-1/DCL-2), which hits the
 *     real `/api/chat/conversations*` Neon-backed routes via `guardedFetch`
 *     on the absolute cloud origin. Throws if desktop is not in managed-cloud
 *     mode (Local/BYOK, or the PA-3 coming-soon gate) — see that module's
 *     trust-boundary doc comment.
 *   - Streaming: `sendCloudMessage` (`apps/desktop/src/api/cloudApi.ts`),
 *     which already targets the real live streaming endpoint
 *     (`POST /api/llm/v1/chat/completions`, `stream: true`) — this is the
 *     SAME endpoint `apps/web/lib/hooks/useChatStream.ts` calls, confirmed by
 *     direct comparison, so streaming was already correctly aligned (only
 *     `cloudApi.ts`'s separate `/api/cloud-chat` conversation-CRUD functions
 *     are the legacy, non-shared-backend path — this runtime does NOT use
 *     those; conversation CRUD always goes through the DCL-1/DCL-2 client).
 *   - Message durability mirrors `useChatStream.ts`'s `saveMessageToDb()`
 *     call pattern: the user message is persisted before streaming starts,
 *     and the assistant message is persisted once the stream completes.
 *   - Delta parsing (tool_calls/tool_status/tool_result/x_search_results/
 *     x_generated_files/x_tool_approval_request/<thinking>) is shared with
 *     `WebRuntime` via `./cloudStreamDeltas.ts` so both runtimes render an
 *     identical execution timeline from the same wire. A suspended
 *     (tool-approval) turn is NOT persisted at `onDone` — see
 *     `./cloudToolApproval.ts` and `resolveToolApproval` below — the
 *     completed turn is persisted only once the resume finishes.
 *
 * CODE-WIRED, USER-GATED: `App.tsx` delegates to the single composition root
 * in `desktopChatRuntime.ts`, which selects this runtime only for a Tauri host
 * whose already-gated app mode is exactly `cloud`. PA-3 still prevents a
 * signed Desktop build from entering that mode, so users cannot reach this
 * runtime until the signed-build + live-Clerk DCL-4 proof succeeds and that
 * separate gate is deliberately lifted. Local and BYOK continue to select
 * `TauriRuntime`; unreadable mode state fails closed there as well. See
 * `docs/strategy/PUBLIC-ALPHA-CUTOVER.md` and
 * `DESKTOP-CLOUD-MODE-SPEC-VS-REALITY-01`.
 *
 * @module CloudRuntime
 */

import type {
  ChatRuntime,
  SendMessageOptions,
  StreamCallback,
  StreamEvent,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import type { ManagedCloudConversation, ManagedCloudMessage } from '@agiworkforce/cloud-contracts';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils';
import { sendCloudMessage, CLOUD_API_BASE_URL } from '../api/cloudApi';
import { getDesktopCloudChatPersistenceClient } from '../lib/cloudChatPersistence';
import { getProviderDefaultModel, normalizeModelId } from '../constants/llm';
import { getDefaultModelFor } from '@agiworkforce/types';
import { createCloudStreamDeltaSink } from './cloudStreamDeltas';
import { CloudToolApprovalRegistry } from './cloudToolApproval';
import { finishAgentActivityLocally, type AgentActivityState } from '@agiworkforce/client-runtime';

const EMPTY_ASSISTANT_CONTENT_PLACEHOLDER = String.fromCharCode(0x200b);

// ---------------------------------------------------------------------------
// Mapping helpers — the DCL-1/DCL-2 client's normalized DTOs -> ChatRuntime DTOs
// ---------------------------------------------------------------------------

function mapConversation(cloud: ManagedCloudConversation): Conversation {
  return {
    id: cloud.id,
    title: cloud.title,
    createdAt: cloud.createdAt,
    updatedAt: cloud.updatedAt,
    model: cloud.model,
    archived: false,
    pinned: false,
  };
}

/** The persistence client passes messages through un-normalized (surface-specific). */
function mapMessage(conversationId: string, raw: ManagedCloudMessage): ChatMessage {
  return {
    id: raw.id,
    conversationId,
    role: raw.role,
    content: raw.content,
    createdAt: raw.createdAt,
    model: raw.model,
    ...(raw.provider ? { provider: raw.provider } : {}),
    ...(raw.metadata ? { metadata: raw.metadata } : {}),
  };
}

// ---------------------------------------------------------------------------
// CloudRuntime implementation
// ---------------------------------------------------------------------------

export class CloudRuntime implements ChatRuntime {
  private readonly _streamCallbacks = new Set<StreamCallback>();
  private readonly _abortControllers = new Map<string, AbortController>();
  private readonly _activeTurns = new Map<
    string,
    {
      assistantMessageId: string;
      model: string;
      sink: ReturnType<typeof createCloudStreamDeltaSink>;
      settled: boolean;
    }
  >();
  private readonly _approvals = new CloudToolApprovalRegistry();

  /** The cloud SSE wire forwards `code_execution` — see `SendMessageOptions.codeExecution`. */
  readonly supportsCodeExecution = true;

  /** The managed cloud wire forwards the exact `research` request field. */
  readonly supportsResearch = true;

  /**
   * Cloud SSE path supports Continue Generation (same wire as `WebRuntime`).
   */
  readonly supportsContinueGeneration = true;

  private emit(event: StreamEvent): void {
    for (const cb of this._streamCallbacks) {
      cb(event);
    }
  }

  /** Persists a completed assistant turn, surfacing a save failure as a follow-up 'error' event without hiding 'done'. */
  private persistAssistantTurn(
    conversationId: string,
    assistantMessageId: string,
    content: string,
    model: string,
    agentActivity?: AgentActivityState,
  ): void {
    if (!content && !agentActivity) return;
    void getDesktopCloudChatPersistenceClient()
      .saveMessage(conversationId, {
        id: assistantMessageId,
        role: 'assistant',
        content: content || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
        model,
        ...(agentActivity ? { metadata: { agentActivity } } : {}),
      })
      .catch((err: unknown) => {
        this.emit({
          type: 'error',
          error: `Reply persisted locally but failed to save to cloud: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      });
  }

  // -------------------------------------------------------------------------
  // sendMessage — persists the user turn, streams the reply, persists the
  // assistant turn. Mirrors useChatStream.ts's save-before/save-after pattern.
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
    const client = getDesktopCloudChatPersistenceClient();

    // Persist the user turn before streaming starts (mirrors
    // useChatStream.ts's saveMessageToDb call for the user message).
    const userMessageId = uuidv7();
    try {
      await client.saveMessage(conversationId, { id: userMessageId, role: 'user', content, model });
    } catch (err) {
      this.emit({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const sink = createCloudStreamDeltaSink((event) => this.emit(event), CLOUD_API_BASE_URL);
    const assistantMessageId = uuidv7();
    const activeTurn = { assistantMessageId, model, sink, settled: false };
    this._activeTurns.set(conversationId, activeTurn);
    // The exact thread sent to the server — reused verbatim as `priorMessages`
    // if this turn suspends on a tool-approval request (see cloudApi.ts's
    // `sendCloudMessage`, which builds the identical fallback).
    const priorMessages: Array<Record<string, unknown>> =
      options?.messageHistory && options.messageHistory.length > 0
        ? options.messageHistory
        : [{ role: 'user', content }];

    try {
      await sendCloudMessage(
        conversationId,
        content,
        model,
        sink.onChunk,
        // onDone
        () => {
          if (activeTurn.settled) return;
          activeTurn.settled = true;
          this._activeTurns.delete(conversationId);
          this._approvals.recordTurnOutcome(conversationId, model, priorMessages, sink);
          if (sink.isSuspended()) {
            // The server suspended this turn on a tool-approval request and
            // closed the stream with no final answer — do NOT persist yet
            // (there is nothing final to save). The eventual resume
            // continuation persists the completed turn once every pending
            // call is decided (see resolveToolApproval). Persisting here
            // would save a partial, tool-less message and then persist a
            // SECOND time after resume.
          } else {
            // Persist the completed assistant turn (mirrors
            // useChatStream.ts's saveMessageToDb call for the completed
            // assistant message). Fire without blocking `onDone`'s emit — a
            // persistence failure here must not hide a successful stream
            // from the UI, but is surfaced via a follow-up 'error' event so
            // the caller can retry the save.
            this.persistAssistantTurn(
              conversationId,
              assistantMessageId,
              sink.getAccumulatedContent(),
              model,
              sink.getAgentActivity(),
            );
          }
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
          if (activeTurn.settled) return;
          activeTurn.settled = true;
          this._activeTurns.delete(conversationId);
          const activity = sink.getAgentActivity();
          this.persistAssistantTurn(
            conversationId,
            assistantMessageId,
            sink.getAccumulatedContent(),
            model,
            activity
              ? finishAgentActivityLocally(activity, {
                  status: 'failed',
                  completedAtMs: Date.now(),
                  error: err.message,
                })
              : undefined,
          );
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
          operationId: userMessageId,
        }),
        options?.research || options?.workMode
          ? {
              ...(options.research ? { research: true } : {}),
              ...(options.workMode ? { workMode: options.workMode } : {}),
            }
          : undefined,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        if (!activeTurn.settled) {
          activeTurn.settled = true;
          this._activeTurns.delete(conversationId);
          const activity = sink.getAgentActivity();
          this.persistAssistantTurn(
            conversationId,
            assistantMessageId,
            sink.getAccumulatedContent(),
            model,
            activity
              ? finishAgentActivityLocally(activity, {
                  status: 'failed',
                  completedAtMs: Date.now(),
                  error: message,
                })
              : undefined,
          );
          this.emit({ type: 'error', error: message });
        }
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
      const outcome = await this._approvals.resolve(
        conversationId,
        toolCallId,
        decision,
        (event) => this.emit(event),
        CLOUD_API_BASE_URL,
        (err) => this.emit({ type: 'error', error: err.message }),
        controller.signal,
      );
      // Persist only once the turn is actually finished (not suspended again
      // on a further approval request) — same persistence-trap rule as
      // sendMessage's onDone above.
      if (outcome && !outcome.suspended) {
        this.persistAssistantTurn(
          conversationId,
          uuidv7(),
          outcome.content,
          outcome.model,
          outcome.agentActivity,
        );
      }
    } finally {
      this._abortControllers.delete(conversationId);
    }
  }

  hasLiveApprovalTurn(conversationId: string): boolean {
    return this._approvals.hasLiveTurn(conversationId);
  }

  // -------------------------------------------------------------------------
  // stopGeneration
  // -------------------------------------------------------------------------

  stopGeneration(conversationId: string): void {
    const controller = this._abortControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(conversationId);
    }
    const activeTurn = this._activeTurns.get(conversationId);
    if (activeTurn && !activeTurn.settled) {
      activeTurn.settled = true;
      this._activeTurns.delete(conversationId);
      const activity = activeTurn.sink.getAgentActivity();
      this.persistAssistantTurn(
        conversationId,
        activeTurn.assistantMessageId,
        activeTurn.sink.getAccumulatedContent(),
        activeTurn.model,
        activity
          ? finishAgentActivityLocally(activity, {
              status: 'cancelled',
              completedAtMs: Date.now(),
            })
          : undefined,
      );
    }
  }

  // -------------------------------------------------------------------------
  // onStream
  // -------------------------------------------------------------------------

  onStream(callback: StreamCallback): () => void {
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  // -------------------------------------------------------------------------
  // Conversation CRUD — via the DCL-1/DCL-2 shared persistence client
  // -------------------------------------------------------------------------

  async createConversation(title?: string): Promise<Conversation> {
    const client = getDesktopCloudChatPersistenceClient();
    // Client-supplied UUIDv7 so desktop knows the cloud id before the
    // round-trip completes (needed for the DCL-4 continuity proof).
    const cloud = await client.createConversation({
      id: uuidv7(),
      title: title ?? 'New Conversation',
    });
    if (import.meta.env.DEV) {
      // W5 stage-2 session labeling — additive, dev/test-only (see
      // ./sessionLabeling.ts module doc). Does not change what gets persisted
      // or returned; only asserts the new conversation's AppSession/
      // ExecutionProfile are internally consistent. CloudRuntime has no
      // local auth-store dependency today, so ownerUserId is resolved lazily
      // here rather than added as a new top-level import.
      const { desktopExecutionProfileFor, labelDesktopSession } = await import('./sessionLabeling');
      const { useUnifiedAuthStore } = await import('../stores/auth');
      labelDesktopSession({
        id: cloud.id,
        ownerUserId: useUnifiedAuthStore.getState().user?.id ?? 'unknown-desktop-user',
        chatExecutionMode: 'cloud_managed',
      });
      desktopExecutionProfileFor('cloud_managed');
    }
    return mapConversation(cloud);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await getDesktopCloudChatPersistenceClient().deleteConversation(conversationId);
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await getDesktopCloudChatPersistenceClient().updateConversation(conversationId, { title });
  }

  // -------------------------------------------------------------------------
  // Conversation listing
  // -------------------------------------------------------------------------

  async listConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    const { conversations } = await getDesktopCloudChatPersistenceClient().listConversations();
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
    }));
  }

  async loadConversations(): Promise<Conversation[]> {
    const { conversations } = await getDesktopCloudChatPersistenceClient().listConversations();
    return conversations.map(mapConversation);
  }

  // -------------------------------------------------------------------------
  // Message loading
  // -------------------------------------------------------------------------

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const { messages } =
      await getDesktopCloudChatPersistenceClient().getConversation(conversationId);
    return messages.map((m) => mapMessage(conversationId, m));
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.getMessages(conversationId);
  }

  // -------------------------------------------------------------------------
  // Platform identifier
  // -------------------------------------------------------------------------

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'desktop';
  }
}
