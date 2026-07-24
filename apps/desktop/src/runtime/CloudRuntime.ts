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
 *     on the absolute cloud origin. Throws unless Desktop is in an authenticated
 *     managed-cloud session — see that module's trust-boundary doc comment.
 *   - Streaming: `sendCloudMessage` (`apps/desktop/src/api/cloudApi.ts`),
 *     which already targets the real live streaming endpoint
 *     (`POST /api/llm/v1/chat/completions`, `stream: true`) — this is the
 *     SAME endpoint `apps/web/lib/hooks/useChatStream.ts` calls. Conversation
 *     CRUD also uses the canonical shared managed-cloud chat client.
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
 * LIVE PUBLIC ALPHA: `App.tsx` delegates to the single composition root in
 * `desktopChatRuntime.ts`, which selects this runtime only for a signed-in
 * Tauri host whose app mode is exactly `cloud`. Local and BYOK continue to
 * select `TauriRuntime`; unreadable mode state fails closed there as well.
 * DCL-4 removed the former coming-soon gate while preserving this explicit
 * trust-boundary selection. See `docs/strategy/PUBLIC-ALPHA-CUTOVER.md` and
 * `DESKTOP-CLOUD-MODE-SPEC-VS-REALITY-01`.
 *
 * @module CloudRuntime
 */

import type {
  ChatRuntime,
  CloudApprovalTurnProjection,
  SendMessageOptions,
  StreamCallback,
  StreamEvent,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import {
  parseAgentEventDelta,
  reconcileManagedCloudPublicText,
  type CloudAgentRunSnapshotPage,
  type ManagedCloudAgentRunHandle,
  type ManagedCloudAgentRunReference,
  type CloudToolApprovalProjection,
  type ManagedCloudConversation,
  type ManagedCloudMessage,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  chatAttachmentAcceptAttribute,
  isSupportedChatAttachment,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils';
import {
  createDesktopCloudAgentRunClient,
  sendCloudMessage,
  CLOUD_API_BASE_URL,
} from '../api/cloudApi';
import { getDesktopCloudChatPersistenceClient } from '../lib/cloudChatPersistence';
import { normalizeModelId } from '../constants/llm';
import {
  createCloudStreamDeltaSink,
  hasRenderableCloudMessageOutput,
  type CloudStreamMessageProjection,
} from './cloudStreamDeltas';
import { CloudToolApprovalRegistry, toPersistedCloudApprovalProjection } from './cloudToolApproval';
import { finishAgentActivityLocally, type AgentActivityState } from '@agiworkforce/client-runtime';
import {
  assertCloudConversationBoundary,
  captureCloudConversationBoundary,
  deleteCloudConversation,
  ensureCloudConversation,
  markCloudConversationReady,
  updateCloudConversation,
  waitForCloudConversationReady,
  type CloudConversationBoundary,
} from '../services/cloudChat';
import { uploadDesktopCloudAttachments } from '../services/desktopCloudAttachments';
import type { CloudChatMessageContent } from '../api/cloudApi';
import {
  EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
  mapPersistedCloudMessage,
  persistedAttachmentMetadata,
} from './persistedCloudMessage';

interface ActiveCloudTurn {
  assistantMessageId: string;
  model: string;
  sink: ReturnType<typeof createCloudStreamDeltaSink>;
  settled: boolean;
  runReference?: ManagedCloudAgentRunReference;
  replayPromise?: Promise<void>;
  /** Public chunks rendered before their matching canonical event arrived. */
  unacknowledgedPublicText: string;
  /** Canonical public text received before its matching SSE content chunk. */
  canonicalPublicTextAwaitingChunk: string;
  /** Existing partial assistant text when Continue Generation appends in place. */
  persistedContentPrefix: string;
}

function durableAssistantContent(turn: ActiveCloudTurn): string {
  return `${turn.persistedContentPrefix}${turn.sink.getAccumulatedContent()}`;
}

function failedMessageProjection(
  projection: CloudStreamMessageProjection,
  message: string,
): CloudStreamMessageProjection {
  return {
    ...projection,
    finishReason: 'error',
    streamError: { message },
  };
}

function stopReasonToFinishReason(reason: AgentEventEnvelope['event']): string | undefined {
  if (reason.type !== 'stop') return undefined;
  if (reason.reason === 'max-tokens') return 'length';
  if (reason.reason === 'cancelled') return 'stopped';
  if (reason.reason === 'error') return 'error';
  return 'stop';
}

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
    archived: cloud.archived,
    pinned: cloud.pinned,
    ...(cloud.projectId ? { projectId: cloud.projectId } : {}),
  };
}

/** The persistence client passes messages through un-normalized (surface-specific). */
function mapMessage(conversationId: string, raw: ManagedCloudMessage): ChatMessage {
  return mapPersistedCloudMessage(
    {
      id: raw.id,
      conversationId,
      role: raw.role,
      content: raw.content,
      createdAt: raw.createdAt,
      ...(raw.model ? { model: raw.model } : {}),
      ...(raw.provider ? { provider: raw.provider } : {}),
      ...(raw.metadata ? { metadata: raw.metadata } : {}),
    },
    CLOUD_API_BASE_URL,
  );
}

// ---------------------------------------------------------------------------
// CloudRuntime implementation
// ---------------------------------------------------------------------------

export class CloudRuntime implements ChatRuntime {
  private _disposed = false;
  private _boundary: CloudConversationBoundary | null = null;
  private readonly _streamCallbacks = new Set<StreamCallback>();
  private readonly _abortControllers = new Map<string, AbortController>();
  private readonly _activeTurns = new Map<string, ActiveCloudTurn>();
  private readonly _approvals = new CloudToolApprovalRegistry();
  private readonly _attachmentAssetIds = new Map<string, string>();

  /** The cloud SSE wire forwards `code_execution` — see `SendMessageOptions.codeExecution`. */
  readonly supportsCodeExecution = true;

  /** The managed cloud wire forwards the exact `research` request field. */
  readonly supportsResearch = true;

  /** Managed search uses the Cloud route's native-or-generic capability gate. */
  readonly supportsManagedWebSearch = true;

  /** Managed Cloud enforces approvals server-side; local Ask/Auto controls do not apply. */
  readonly supportsAgentControl = false;

  readonly attachmentPolicy = {
    accept: chatAttachmentAcceptAttribute(),
    maxFiles: MAX_CHAT_ATTACHMENT_COUNT,
    maxTotalBytes: MAX_CHAT_ATTACHMENT_BYTES,
    validate: (file: File) =>
      isSupportedChatAttachment(file.name, file.type)
        ? null
        : `${file.name} is not supported. Attach an image, PDF, or text/code file instead.`,
  };

  /**
   * Cloud SSE path supports Continue Generation (same wire as `WebRuntime`).
   */
  readonly supportsContinueGeneration = true;

  private emit(event: StreamEvent): void {
    if (this._disposed) return;
    for (const cb of this._streamCallbacks) {
      cb(event);
    }
  }

  private requireBoundary(): CloudConversationBoundary {
    if (this._disposed) {
      throw new Error('This Cloud session is no longer active.');
    }
    if (!this._boundary) {
      this._boundary = captureCloudConversationBoundary();
    } else {
      assertCloudConversationBoundary(this._boundary);
    }
    return this._boundary;
  }

  private assertBoundary(boundary = this._boundary): void {
    if (this._disposed) {
      throw new Error('This Cloud session is no longer active.');
    }
    if (!boundary) {
      throw new Error('This Cloud runtime has no authenticated account boundary.');
    }
    assertCloudConversationBoundary(boundary);
  }

  /**
   * Ends every request owned by this authenticated runtime without persisting
   * a synthetic failure into the account that is being signed out. Server-run
   * cancellation is best-effort and bounded so logout cannot hang on network
   * loss.
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;

    const runIds = new Set<string>();
    for (const turn of this._activeTurns.values()) {
      turn.settled = true;
      if (turn.runReference) runIds.add(turn.runReference.runId);
    }
    this._activeTurns.clear();

    for (const controller of this._abortControllers.values()) {
      controller.abort();
    }
    this._abortControllers.clear();
    this._streamCallbacks.clear();

    if (runIds.size === 0) return;

    const cancelController = new AbortController();
    const timeoutId = setTimeout(() => cancelController.abort(), 3_000);
    try {
      const client = createDesktopCloudAgentRunClient();
      await Promise.allSettled(
        [...runIds].map((runId) => client.cancelRun(runId, { signal: cancelController.signal })),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Persists a completed assistant turn, surfacing a save failure as a follow-up 'error' event without hiding 'done'. */
  private async persistAssistantTurn(
    conversationId: string,
    assistantMessageId: string,
    content: string,
    model: string,
    agentActivity?: AgentActivityState,
    cloudAgentRun?: ManagedCloudAgentRunReference,
    cloudApproval?: CloudToolApprovalProjection | null,
    messageProjection?: CloudStreamMessageProjection,
  ): Promise<void> {
    const boundary = this.requireBoundary();
    if (
      !content &&
      !agentActivity &&
      !cloudAgentRun &&
      cloudApproval === undefined &&
      (!messageProjection || Object.keys(messageProjection).length === 0)
    ) {
      return;
    }
    const metadata = {
      ...(agentActivity ? { agentActivity } : {}),
      ...(cloudAgentRun ? { cloudAgentRun } : {}),
      ...(cloudApproval !== undefined ? { cloudApproval } : {}),
      ...(messageProjection ?? {}),
    };
    try {
      await getDesktopCloudChatPersistenceClient().saveMessage(conversationId, {
        id: assistantMessageId,
        role: 'assistant',
        content: content || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
        model,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      });
      this.assertBoundary(boundary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ type: 'error', error: `Could not save the Cloud reply: ${message}` });
      throw err;
    }
  }

  private updateRunReference(
    turn: ActiveCloudTurn,
    patch: Partial<ManagedCloudAgentRunReference> = {},
  ): void {
    if (!turn.runReference) return;
    turn.runReference = {
      ...turn.runReference,
      ...patch,
      lastSequence: Math.max(
        turn.runReference.lastSequence,
        turn.sink.getAgentActivity()?.lastSequence ?? -1,
        patch.lastSequence ?? -1,
      ),
    };
  }

  private onLiveChunk(turn: ActiveCloudTurn, text: string): void {
    const before = turn.sink.getAccumulatedContent();
    turn.sink.onChunk(text);
    const after = turn.sink.getAccumulatedContent();
    const publicDelta = after.slice(before.length);
    if (!publicDelta) return;

    const reconciled = reconcileManagedCloudPublicText(
      turn.canonicalPublicTextAwaitingChunk,
      publicDelta,
    );
    turn.canonicalPublicTextAwaitingChunk = reconciled.pending;
    turn.unacknowledgedPublicText += reconciled.unmatchedIncoming;
  }

  private onLiveEvent(turn: ActiveCloudTurn, payload: Record<string, unknown>): void {
    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    const delta =
      choices[0] && typeof choices[0] === 'object'
        ? ((choices[0] as Record<string, unknown>)['delta'] as Record<string, unknown> | undefined)
        : undefined;
    const envelope = parseAgentEventDelta(delta?.['x_agent_event']);
    if (envelope?.event.type === 'text-delta' && envelope.event.delta) {
      const reconciled = reconcileManagedCloudPublicText(
        turn.unacknowledgedPublicText,
        envelope.event.delta,
      );
      turn.unacknowledgedPublicText = reconciled.pending;
      turn.canonicalPublicTextAwaitingChunk += reconciled.unmatchedIncoming;
    }

    turn.sink.onEvent(payload);
    if (envelope) this.updateRunReference(turn, { lastSequence: envelope.sequence });
  }

  private async replayDurableRun(conversationId: string, turn: ActiveCloudTurn): Promise<void> {
    const runReference = turn.runReference;
    if (!runReference) throw new Error('Managed Cloud run handle is unavailable');

    // If the canonical text event arrived immediately before the transport
    // failed but its ordinary SSE content projection did not, render it now.
    if (turn.canonicalPublicTextAwaitingChunk) {
      turn.sink.onChunk(turn.canonicalPublicTextAwaitingChunk);
      turn.canonicalPublicTextAwaitingChunk = '';
    }

    let replayFinishReason: string | undefined;
    const client = createDesktopCloudAgentRunClient();
    const followed = await client.followRun(runReference.runId, {
      afterSequence: Math.max(
        runReference.lastSequence,
        turn.sink.getAgentActivity()?.lastSequence ?? -1,
      ),
      signal: this._abortControllers.get(conversationId)?.signal,
      onEvent: (envelope) => {
        if (envelope.event.type === 'text-delta' && envelope.event.delta) {
          const reconciled = reconcileManagedCloudPublicText(
            turn.unacknowledgedPublicText,
            envelope.event.delta,
          );
          turn.unacknowledgedPublicText = reconciled.pending;
          if (reconciled.unmatchedIncoming) {
            turn.sink.onChunk(reconciled.unmatchedIncoming);
          }
        }
        replayFinishReason = stopReasonToFinishReason(envelope.event) ?? replayFinishReason;
        turn.sink.onEvent({ choices: [{ delta: { x_agent_event: envelope } }] });
        this.updateRunReference(turn, { lastSequence: envelope.sequence });
      },
      onSnapshot: (snapshot: CloudAgentRunSnapshotPage) => {
        this.updateRunReference(turn, {
          lastSequence: snapshot.nextAfterSequence,
          state: snapshot.run.state,
          cancellationRequestedAt: snapshot.run.cancellationRequestedAt,
        });
      },
    });

    this.updateRunReference(turn, {
      lastSequence: followed.lastSequence,
      state: followed.run.state,
      cancellationRequestedAt: followed.run.cancellationRequestedAt,
    });
    if (!replayFinishReason && followed.run.state === 'failed') replayFinishReason = 'error';
    if (!replayFinishReason && followed.run.state === 'cancelled') replayFinishReason = 'stopped';

    if (turn.settled) return;
    turn.settled = true;
    this._activeTurns.delete(conversationId);
    const content = durableAssistantContent(turn);
    const projection = turn.sink.getMessageProjection();
    this._approvals.recordTurnOutcome(
      conversationId,
      turn.runReference,
      turn.model,
      turn.sink,
      turn.assistantMessageId,
    );
    if (turn.sink.isSuspended()) {
      await this.persistAssistantTurn(
        conversationId,
        turn.assistantMessageId,
        content,
        turn.model,
        turn.sink.getAgentActivity(),
        turn.runReference,
        toPersistedCloudApprovalProjection(this._approvals.getTurnProjection(conversationId)),
        projection,
      );
      this.emit({
        type: 'done',
        ...(replayFinishReason ? { finishReason: replayFinishReason } : {}),
      });
      return;
    }
    if (followed.run.state === 'failed') {
      const activity = turn.sink.getAgentActivity();
      const failureMessage = 'The managed Cloud task failed.';
      await this.persistAssistantTurn(
        conversationId,
        turn.assistantMessageId,
        content,
        turn.model,
        activity
          ? finishAgentActivityLocally(activity, {
              status: 'failed',
              completedAtMs: Date.now(),
              error: failureMessage,
              overrideTerminal: true,
            })
          : undefined,
        turn.runReference,
        undefined,
        failedMessageProjection(projection, failureMessage),
      );
      this.emit({ type: 'error', error: `${failureMessage} Please retry.` });
      return;
    }
    if (
      followed.run.state !== 'cancelled' &&
      followed.run.state !== 'paused' &&
      followed.run.state !== 'archived' &&
      !hasRenderableCloudMessageOutput(content, projection) &&
      !turn.sink.getStreamError()
    ) {
      const failureMessage = 'AGI Cloud completed without returning a response.';
      const activity = turn.sink.getAgentActivity();
      await this.persistAssistantTurn(
        conversationId,
        turn.assistantMessageId,
        content,
        turn.model,
        activity
          ? finishAgentActivityLocally(activity, {
              status: 'failed',
              completedAtMs: Date.now(),
              error: failureMessage,
            })
          : undefined,
        turn.runReference,
        undefined,
        failedMessageProjection(projection, failureMessage),
      );
      this.emit({
        type: 'error',
        error: `${failureMessage} Please retry.`,
      });
      return;
    }
    await this.persistAssistantTurn(
      conversationId,
      turn.assistantMessageId,
      content,
      turn.model,
      turn.sink.getAgentActivity(),
      turn.runReference,
      undefined,
      projection,
    );
    this.emit({
      type: 'done',
      ...(replayFinishReason ? { finishReason: replayFinishReason } : {}),
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
    const boundary = this.requireBoundary();
    const model = normalizeModelId(options?.model ?? '') ?? 'auto';
    const client = getDesktopCloudChatPersistenceClient();
    const isContinuation = options?.isContinuation === true;
    const messageHistory = options?.messageHistory ?? [];

    // The host creates optimistically with this exact UUID. Joining the
    // coordinator here guarantees the server row exists before the first
    // message is written, even when the user sends immediately.
    await ensureCloudConversation(conversationId, 'New chat', model, options?.projectId);
    this.assertBoundary(boundary);
    await updateCloudConversation(conversationId, {
      model,
      ...(options?.projectId !== undefined ? { projectId: options.projectId } : {}),
    });
    this.assertBoundary(boundary);

    const uploadedAttachments =
      !isContinuation && options?.attachments?.length
        ? await uploadDesktopCloudAttachments(options.attachments)
        : [];
    this.assertBoundary(boundary);
    const currentHistoryAttachments = messageHistory[messageHistory.length - 1]?.attachments ?? [];
    for (const [index, attachment] of currentHistoryAttachments.entries()) {
      const uploaded = uploadedAttachments[index];
      if (uploaded) this._attachmentAssetIds.set(attachment.id, uploaded.id);
    }

    // Persist ordinary user turns before streaming. Continue Generation's
    // instruction is request-only and must never appear in conversation
    // history as a user message.
    const userMessageId = uuidv7();
    if (!isContinuation) {
      try {
        await client.saveMessage(conversationId, {
          id: userMessageId,
          role: 'user',
          content: content.trim() || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
          model,
          ...(uploadedAttachments.length
            ? { metadata: { attachments: persistedAttachmentMetadata(uploadedAttachments) } }
            : {}),
        });
        this.assertBoundary(boundary);
      } catch (err) {
        this.emit({
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }

    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const sink = createCloudStreamDeltaSink((event) => this.emit(event), CLOUD_API_BASE_URL);
    const assistantMessageId = options?.continuationMessageId ?? uuidv7();
    const continuationPrefix =
      isContinuation &&
      messageHistory.length >= 2 &&
      messageHistory[messageHistory.length - 2]?.role === 'assistant'
        ? (messageHistory[messageHistory.length - 2]?.content ?? '')
        : '';
    const activeTurn: ActiveCloudTurn = {
      assistantMessageId,
      model,
      sink,
      settled: false,
      unacknowledgedPublicText: '',
      canonicalPublicTextAwaitingChunk: '',
      persistedContentPrefix: continuationPrefix,
    };
    const historySource =
      messageHistory.length > 0
        ? messageHistory
        : [{ role: 'user' as const, content, attachments: [] }];
    const requestHistory = historySource.map((message, index, history) => {
      const isCurrentUserTurn =
        !isContinuation && index === history.length - 1 && message.role === 'user';
      const attachments = isCurrentUserTurn
        ? uploadedAttachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            type: attachment.type,
          }))
        : (message.attachments ?? []);
      if (attachments.length === 0) {
        return { role: message.role, content: message.content };
      }
      const parts: Exclude<CloudChatMessageContent, string> = [];
      if (message.content.trim()) parts.push({ type: 'text', text: message.content });
      for (const attachment of attachments) {
        const assetId = this._attachmentAssetIds.get(attachment.id) ?? attachment.id;
        parts.push({ type: 'file', file: { asset_id: assetId } });
      }
      return { role: message.role, content: parts };
    });
    if (options?.systemPrompt) {
      requestHistory.unshift({ role: 'system', content: options.systemPrompt });
    }
    this._activeTurns.set(conversationId, activeTurn);
    try {
      await sendCloudMessage(
        conversationId,
        content,
        model,
        (text) => this.onLiveChunk(activeTurn, text),
        // onDone
        async () => {
          if (activeTurn.settled || activeTurn.replayPromise) return;
          activeTurn.settled = true;
          this._activeTurns.delete(conversationId);
          this.updateRunReference(activeTurn);
          this._approvals.recordTurnOutcome(
            conversationId,
            activeTurn.runReference,
            model,
            sink,
            assistantMessageId,
          );
          const approvalProjection = toPersistedCloudApprovalProjection(
            this._approvals.getTurnProjection(conversationId),
          );
          if (sink.isSuspended()) {
            // Persist the durable run reference at the approval boundary so a
            // fresh app instance can restore the small client projection. The
            // server checkpoint remains authoritative for transcript/policy.
            await this.persistAssistantTurn(
              conversationId,
              assistantMessageId,
              durableAssistantContent(activeTurn),
              model,
              sink.getAgentActivity(),
              activeTurn.runReference,
              approvalProjection,
              sink.getMessageProjection(),
            );
          } else {
            const projection = sink.getMessageProjection();
            const hasRenderableOutput = hasRenderableCloudMessageOutput(
              durableAssistantContent(activeTurn),
              projection,
            );
            if (!hasRenderableOutput && !sink.getStreamError()) {
              const failureMessage = 'AGI Cloud completed without returning a response.';
              const activity = sink.getAgentActivity();
              await this.persistAssistantTurn(
                conversationId,
                assistantMessageId,
                durableAssistantContent(activeTurn),
                model,
                activity
                  ? finishAgentActivityLocally(activity, {
                      status: 'failed',
                      completedAtMs: Date.now(),
                      error: failureMessage,
                      overrideTerminal: true,
                    })
                  : undefined,
                activeTurn.runReference,
                undefined,
                failedMessageProjection(projection, failureMessage),
              );
              this.emit({
                type: 'error',
                error: `${failureMessage} Please retry.`,
              });
              return;
            }
            // Make the reply durable before the UI receives `done`, so an
            // immediate navigation or reload cannot lose the completed turn.
            await this.persistAssistantTurn(
              conversationId,
              assistantMessageId,
              durableAssistantContent(activeTurn),
              model,
              sink.getAgentActivity(),
              activeTurn.runReference,
              activeTurn.runReference ? null : undefined,
              projection,
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
          if (!controller.signal.aborted && activeTurn.runReference) {
            activeTurn.replayPromise ??= this.replayDurableRun(conversationId, activeTurn).catch(
              (replayError: unknown) => {
                if (activeTurn.settled) return;
                activeTurn.settled = true;
                this._activeTurns.delete(conversationId);
                const message =
                  replayError instanceof Error ? replayError.message : String(replayError);
                const activity = sink.getAgentActivity();
                void this.persistAssistantTurn(
                  conversationId,
                  assistantMessageId,
                  durableAssistantContent(activeTurn),
                  model,
                  activity
                    ? finishAgentActivityLocally(activity, {
                        status: 'failed',
                        completedAtMs: Date.now(),
                        error: message,
                      })
                    : undefined,
                  activeTurn.runReference,
                  undefined,
                  failedMessageProjection(sink.getMessageProjection(), message),
                ).catch((persistenceError: unknown) => {
                  this.emit({
                    type: 'error',
                    error: `The Cloud task failed and its failure state could not be saved: ${
                      persistenceError instanceof Error
                        ? persistenceError.message
                        : String(persistenceError)
                    }`,
                  });
                });
                this.emit({ type: 'error', error: message });
              },
            );
            return;
          }
          activeTurn.settled = true;
          this._activeTurns.delete(conversationId);
          const activity = sink.getAgentActivity();
          void this.persistAssistantTurn(
            conversationId,
            assistantMessageId,
            durableAssistantContent(activeTurn),
            model,
            activity
              ? finishAgentActivityLocally(activity, {
                  status: 'failed',
                  completedAtMs: Date.now(),
                  error: err.message,
                })
              : undefined,
            activeTurn.runReference,
            undefined,
            failedMessageProjection(sink.getMessageProjection(), err.message),
          ).catch((persistenceError: unknown) => {
            this.emit({
              type: 'error',
              error: `The Cloud task failed and its failure state could not be saved: ${
                persistenceError instanceof Error
                  ? persistenceError.message
                  : String(persistenceError)
              }`,
            });
          });
          this.emit({ type: 'error', error: err.message });
        },
        controller.signal,
        (payload) => this.onLiveEvent(activeTurn, payload),
        options?.webSearch,
        requestHistory,
        options?.thinkingEnabled,
        options?.codeExecution,
        createManagedChatIdempotencyKey({
          surface: 'desktop',
          purpose: 'send',
          operationId: userMessageId,
        }),
        options?.research || options?.workMode || options?.skillName || options?.effort
          ? {
              ...(options.research ? { research: true } : {}),
              ...(options.workMode ? { workMode: options.workMode } : {}),
              ...(options.skillName ? { skillName: options.skillName } : {}),
              ...(options.effort ? { effort: options.effort } : {}),
            }
          : undefined,
        (handle: ManagedCloudAgentRunHandle | null) => {
          activeTurn.runReference = handle
            ? {
                ...handle,
                lastSequence: sink.getAgentActivity()?.lastSequence ?? -1,
              }
            : undefined;
          if (handle) {
            this.emit({ type: 'agent_run', runId: handle.runId, runPath: handle.runPath });
          }
        },
      );
      if (activeTurn.replayPromise) await activeTurn.replayPromise;
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        if (!activeTurn.settled) {
          activeTurn.settled = true;
          this._activeTurns.delete(conversationId);
          const activity = sink.getAgentActivity();
          await this.persistAssistantTurn(
            conversationId,
            assistantMessageId,
            durableAssistantContent(activeTurn),
            model,
            activity
              ? finishAgentActivityLocally(activity, {
                  status: 'failed',
                  completedAtMs: Date.now(),
                  error: message,
                })
              : undefined,
            activeTurn.runReference,
            undefined,
            failedMessageProjection(sink.getMessageProjection(), message),
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
    const boundary = this.requireBoundary();
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
      this.assertBoundary(boundary);
      if (!outcome) {
        const projection = this._approvals.getTurnProjection(conversationId);
        if (projection?.assistantMessageId) {
          await this.persistAssistantTurn(
            conversationId,
            projection.assistantMessageId,
            projection.assistantContent,
            projection.model,
            projection.agentActivity,
            projection.runReference,
            toPersistedCloudApprovalProjection(projection),
            projection.messageProjection,
          );
        }
      } else if (outcome.assistantMessageId) {
        // Update the SAME assistant message after a partial decision, a
        // repeated approval suspension, or the terminal continuation.
        const emptyTerminal =
          !outcome.suspended &&
          !hasRenderableCloudMessageOutput(outcome.content, outcome.messageProjection) &&
          !outcome.streamError;
        const failureMessage = 'AGI Cloud completed without returning a response.';
        await this.persistAssistantTurn(
          conversationId,
          outcome.assistantMessageId,
          outcome.content,
          outcome.model,
          emptyTerminal && outcome.agentActivity
            ? finishAgentActivityLocally(outcome.agentActivity, {
                status: 'failed',
                completedAtMs: Date.now(),
                error: failureMessage,
                overrideTerminal: true,
              })
            : outcome.agentActivity,
          outcome.runReference,
          outcome.pendingProjection
            ? toPersistedCloudApprovalProjection(outcome.pendingProjection)
            : null,
          emptyTerminal
            ? failedMessageProjection(outcome.messageProjection, failureMessage)
            : outcome.messageProjection,
        );
        if (emptyTerminal) {
          this.emit({
            type: 'error',
            error: `${failureMessage} Please retry.`,
          });
          return;
        }
        this.emit({
          type: 'done',
          ...(outcome.finishReason ? { finishReason: outcome.finishReason } : {}),
          ...(outcome.streamError ? { streamError: outcome.streamError } : {}),
        });
      }
    } finally {
      this._abortControllers.delete(conversationId);
    }
  }

  hasLiveApprovalTurn(conversationId: string, projection?: CloudApprovalTurnProjection): boolean {
    return this._approvals.hasLiveTurn(conversationId, projection);
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
      if (activeTurn.runReference) {
        void createDesktopCloudAgentRunClient()
          .cancelRun(activeTurn.runReference.runId)
          .catch((err: unknown) => {
            this.emit({
              type: 'error',
              error: `Could not stop the Cloud task: ${
                err instanceof Error ? err.message : String(err)
              }`,
            });
          });
      }
      const activity = activeTurn.sink.getAgentActivity();
      void this.persistAssistantTurn(
        conversationId,
        activeTurn.assistantMessageId,
        durableAssistantContent(activeTurn),
        activeTurn.model,
        activity
          ? finishAgentActivityLocally(activity, {
              status: 'cancelled',
              completedAtMs: Date.now(),
            })
          : undefined,
        activeTurn.runReference,
        undefined,
        {
          ...activeTurn.sink.getMessageProjection(),
          finishReason: 'stopped',
        },
      ).catch((persistenceError: unknown) => {
        this.emit({
          type: 'error',
          error: `The Cloud task stopped, but its stopped state could not be saved: ${
            persistenceError instanceof Error ? persistenceError.message : String(persistenceError)
          }`,
        });
      });
    }
  }

  // -------------------------------------------------------------------------
  // onStream
  // -------------------------------------------------------------------------

  onStream(callback: StreamCallback): () => void {
    if (this._disposed) return () => undefined;
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  // -------------------------------------------------------------------------
  // Conversation CRUD — via the DCL-1/DCL-2 shared persistence client
  // -------------------------------------------------------------------------

  async createConversation(title?: string): Promise<Conversation> {
    const boundary = this.requireBoundary();
    // Client-supplied UUIDv7 so desktop knows the cloud id before the
    // round-trip completes (needed for the DCL-4 continuity proof).
    const cloud = await ensureCloudConversation(uuidv7(), title ?? 'New Conversation');
    this.assertBoundary(boundary);
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
    return {
      id: cloud.id,
      title: cloud.title ?? 'New Conversation',
      createdAt: cloud.created_at,
      updatedAt: cloud.updated_at,
      ...(cloud.model ? { model: cloud.model } : {}),
      ...(cloud.project_id ? { projectId: cloud.project_id } : {}),
      pinned: cloud.pinned,
      archived: cloud.archived,
    };
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const boundary = this.requireBoundary();
    await deleteCloudConversation(conversationId);
    this.assertBoundary(boundary);
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const boundary = this.requireBoundary();
    await updateCloudConversation(conversationId, { title });
    this.assertBoundary(boundary);
  }

  async archiveConversation(
    conversationId: string,
    _userId?: string,
    archived = true,
  ): Promise<void> {
    const boundary = this.requireBoundary();
    await updateCloudConversation(conversationId, {
      archived,
      ...(archived ? { pinned: false } : {}),
    });
    this.assertBoundary(boundary);
  }

  // -------------------------------------------------------------------------
  // Conversation listing
  // -------------------------------------------------------------------------

  private async loadAllCloudConversations(): Promise<ManagedCloudConversation[]> {
    const boundary = this.requireBoundary();
    const client = getDesktopCloudChatPersistenceClient();
    const conversations: ManagedCloudConversation[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await client.listConversations({ limit: 100, offset });
      assertCloudConversationBoundary(boundary);
      conversations.push(...page.conversations);
      for (const conversation of page.conversations) {
        markCloudConversationReady(conversation.id, boundary);
      }
      hasMore = page.hasMore;
      offset = page.nextOffset;
      if (hasMore && page.conversations.length === 0) {
        throw new Error('AGI Cloud returned an invalid empty conversation page.');
      }
    }

    return conversations;
  }

  async listConversations(): Promise<{ id: string; title: string; updatedAt: string }[]> {
    const conversations = await this.loadAllCloudConversations();
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
    }));
  }

  async loadConversations(): Promise<Conversation[]> {
    const conversations = await this.loadAllCloudConversations();
    return conversations.map(mapConversation);
  }

  // -------------------------------------------------------------------------
  // Message loading
  // -------------------------------------------------------------------------

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const boundary = this.requireBoundary();
    await waitForCloudConversationReady(conversationId, boundary);
    const client = getDesktopCloudChatPersistenceClient();
    const messages: ManagedCloudMessage[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await client.getConversation(conversationId, { limit: 100, offset });
      assertCloudConversationBoundary(boundary);
      markCloudConversationReady(page.conversation.id, boundary);
      messages.push(...page.messages);
      hasMore = page.hasMore;
      offset += page.messages.length;
      if (hasMore && page.messages.length === 0) {
        throw new Error(`AGI Cloud conversation ${conversationId} returned an invalid empty page.`);
      }
    }

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
