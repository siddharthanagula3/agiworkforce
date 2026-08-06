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
  CloudRunReattachment,
  GeneratedFileEntry,
  SendMessageOptions,
  StreamCallback,
  StreamEvent,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import {
  parseAgentEventDelta,
  reconcileManagedCloudPublicText,
  type CloudAgentRun,
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
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { classifyTaskLocally } from '@agiworkforce/routing';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import {
  createManagedChatIdempotencyKey,
  createManagedMediaIdempotencyKey,
} from '@agiworkforce/utils';
import {
  CloudApiError,
  createDesktopCloudAgentRunClient,
  createDesktopCloudAgentRunCleanupClient,
  generateCloudImage,
  sendCloudMessage,
  CLOUD_API_BASE_URL,
  type DesktopCloudRunCleanupCredential,
} from '../api/cloudApi';
import { getDesktopCloudChatPersistenceClient } from '../lib/cloudChatPersistence';
import { normalizeModelId } from '../constants/llm';
import {
  createCloudStreamDeltaSink,
  hasRenderableCloudMessageOutput,
  type CloudStreamMessageProjection,
} from './cloudStreamDeltas';
import { buildBoundedCloudMessageMetadata } from './cloudMessageMetadata';
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
import {
  MANAGED_CLOUD_PAGE_SIZE,
  createManagedCloudPaginationGuard,
} from '../services/managedCloudPagination';
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

/**
 * Run states worth rejoining. A terminal run has nothing left to stream, and
 * its stored message is already the whole answer.
 */
const REATTACHABLE_RUN_STATES = new Set<CloudAgentRun['state']>([
  'queued',
  'running',
  'paused',
  'awaiting_input',
]);

/**
 * Rebuild displayable tool arguments from the server's truncated preview.
 *
 * The preview is a JSON prefix cut at a fixed length, so it usually will not
 * parse. That is fine for a card whose job is to tell the user WHAT is being
 * asked: an unparseable preview is shown as-is rather than dropped, because
 * "fs_write {…" tells the user more than an empty argument list does. The real
 * arguments live in the server's checkpoint and execute from there.
 */
function parsePendingApprovalArgs(preview: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(preview);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Truncated JSON is the expected case, not an error.
  }
  return preview ? { preview } : {};
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

/**
 * Project a transport failure into the shared error event, preserving the
 * server's classification when there is one.
 *
 * A managed quota / rate-limit refusal must reach the UI as a CODE, not just a
 * sentence: the shared layer classifies it (`classifyManagedQuotaErrorCode`)
 * into an in-transcript card with the reason, the reset time the server
 * actually reported, and any upgrade path. Network throws carry neither field
 * and degrade to the plain failure they are.
 */
function cloudErrorEvent(err: Error): {
  type: 'error';
  error: string;
  code?: string;
  resetAt?: string;
} {
  const classified = err instanceof CloudApiError ? err : undefined;
  return {
    type: 'error',
    error: err.message,
    ...(classified?.code ? { code: classified.code } : {}),
    ...(classified?.resetAt ? { resetAt: classified.resetAt } : {}),
  };
}

function stopReasonToFinishReason(reason: AgentEventEnvelope['event']): string | undefined {
  if (reason.type !== 'stop') return undefined;
  if (reason.reason === 'max-tokens') return 'length';
  if (reason.reason === 'cancelled') return 'stopped';
  if (reason.reason === 'error') return 'error';
  return 'stop';
}

function managedImageSelection(): {
  model: string;
  provider: 'google' | 'openai' | 'stability';
} {
  const model = getRoutingSlotModel('image_generation');
  const metadata = getModelMetadataById(model);
  const provider =
    metadata?.provider === 'managed_cloud'
      ? 'stability'
      : metadata?.provider === 'google' || metadata?.provider === 'openai'
        ? metadata.provider
        : null;
  if (!metadata || metadata.modelType !== 'image' || !provider) {
    throw new Error('Managed Cloud image generation is not configured for Desktop.');
  }
  return { model: metadata.id, provider };
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
  private readonly _resolvingApprovals = new Map<
    string,
    { runId: string; cleanupCredential?: DesktopCloudRunCleanupCredential }
  >();
  private readonly _approvals = new CloudToolApprovalRegistry();
  private readonly _attachmentAssetIds = new Map<string, string>();

  readonly supportsResearch: boolean;

  constructor(
    private readonly expectedAccountId: string | null = null,
    supportsResearch = false,
  ) {
    this.supportsResearch = supportsResearch;
  }

  /** The cloud SSE wire forwards `code_execution` — see `SendMessageOptions.codeExecution`. */
  readonly supportsCodeExecution = true;

  /** Managed Cloud has a dedicated durable image-generation dispatch. */
  readonly supportsImageGeneration = true;

  /** Desktop Cloud does not yet implement the managed async video endpoint. */
  readonly supportsVideoGeneration = false;

  /** Desktop Cloud does not expose the native Local computer-use boundary. */
  readonly supportsComputerUse = false;

  /** Independent Cloud requests are keyed and cancellable per conversation. */
  readonly supportsConcurrentTurns = true;

  /** Managed search uses the Cloud route's native-or-generic capability gate. */
  readonly supportsManagedWebSearch = true;

  /** Managed Cloud enforces approvals server-side; local Ask/Auto controls do not apply. */
  readonly supportsAgentControl = false;
  // Effort is a model parameter, not a permission control, so it is safe here
  // even though agent-mode enforcement (Ask/Auto/Plan/Bypass) is not. Desktop
  // previously had NO reasoning-effort control purely because both lived
  // behind the single flag above.
  readonly supportsReasoningEffort = true;

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

  private emitForConversation(conversationId: string, event: StreamEvent): void {
    this.emit({ ...event, conversationId });
  }

  private requireBoundary(): CloudConversationBoundary {
    if (this._disposed) {
      throw new Error('This Cloud session is no longer active.');
    }
    if (!this._boundary) {
      this._boundary = captureCloudConversationBoundary();
      if (this.expectedAccountId && this._boundary.accountId !== this.expectedAccountId) {
        this._boundary = null;
        throw new Error('The Managed Cloud account changed before this runtime became active.');
      }
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

  private clearAbortController(conversationId: string, controller: AbortController): void {
    // A stopped turn can finish after a newer turn has installed its own
    // controller for the same conversation. The old cleanup must never make
    // that newer turn impossible to stop.
    if (this._abortControllers.get(conversationId) === controller) {
      this._abortControllers.delete(conversationId);
    }
  }

  /**
   * Detaches this client from its runs. It does NOT stop them.
   *
   * DURABLE SESSIONS: dispose used to fan out `cancelRun` to every in-flight
   * run, which made the runtime's own teardown — a window closing, a React
   * remount, a sign-out — indistinguishable from the user pressing Stop. A run
   * the user paid for and walked away from was killed by walking away, which is
   * the exact failure durable sessions exist to remove. The server does not need
   * this client to keep executing; the run continues, journals its events, and
   * is picked back up by `reattachConversation` or from Tasks on any surface.
   *
   * Stopping is now only ever explicit: `stopGeneration` and the Tasks page Stop
   * button both still call `cancelRun`. NOTE that this includes sign-out —
   * signing out of Desktop detaches, it does not cancel, and the run stays
   * billable to that account until it finishes or is stopped from another
   * surface.
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;

    for (const turn of this._activeTurns.values()) {
      turn.settled = true;
    }
    this._activeTurns.clear();
    this._resolvingApprovals.clear();

    for (const controller of this._abortControllers.values()) {
      controller.abort();
    }
    this._abortControllers.clear();
    this._streamCallbacks.clear();
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
    const rawMetadata: Record<string, unknown> = {
      ...(agentActivity ? { agentActivity } : {}),
      ...(cloudAgentRun ? { cloudAgentRun } : {}),
      ...(cloudApproval !== undefined ? { cloudApproval } : {}),
      ...(messageProjection ?? {}),
    };
    // DES-C06: the server hard-caps serialized metadata at 32 000 chars and
    // 400s the WHOLE message on overflow — which used to lose the entire
    // assistant turn because one artifact's content did not fit. Drop the
    // re-derivable artifact bytes (DES-C05 rebuilds them from `content` with
    // the same deterministic id) and, if still over, sacrifice optional
    // projections with a persisted note rather than the answer itself.
    const bounded = buildBoundedCloudMessageMetadata(rawMetadata, content);
    const metadata = bounded.metadata;
    try {
      await getDesktopCloudChatPersistenceClient().saveMessage(conversationId, {
        id: assistantMessageId,
        role: 'assistant',
        content: content || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
        model,
        ...(metadata ? { metadata } : {}),
      });
      this.assertBoundary(boundary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitForConversation(conversationId, {
        type: 'error',
        error: `Could not save the Cloud reply: ${message}`,
      });
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

  /**
   * Media models use `/api/media/image/generate`, not a text-chat adapter.
   * Web intercepts the same natural-language intent before chat completion;
   * Desktop does it here at the runtime boundary so quick actions and typed
   * prompts cannot fall into the chat route's intentional media-dispatch 422.
   */
  private async sendManagedImageTurn(
    conversationId: string,
    prompt: string,
    userMessageId: string,
    controller: AbortController,
  ): Promise<void> {
    const selection = managedImageSelection();
    const assistantMessageId = uuidv7();
    const toolCallId = uuidv7();
    const toolName = 'media_generate_image';
    const args = { prompt };
    const startedAt = Date.now();

    this.emitForConversation(conversationId, {
      type: 'tool_call',
      toolCall: { id: toolCallId, name: toolName, args },
    });

    let generated: Awaited<ReturnType<typeof generateCloudImage>>;
    try {
      generated = await generateCloudImage({
        prompt,
        provider: selection.provider,
        model: selection.model,
        idempotencyKey: createManagedMediaIdempotencyKey({
          surface: 'desktop',
          operation: 'image',
          operationId: userMessageId,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      const failedToolCall = {
        id: toolCallId,
        name: toolName,
        args,
        status: 'failed' as const,
        error: message,
      };
      this.emitForConversation(conversationId, {
        type: 'tool_result',
        toolCallId,
        error: message,
        durationMs: Date.now() - startedAt,
      });
      try {
        await this.persistAssistantTurn(
          conversationId,
          assistantMessageId,
          '',
          selection.model,
          undefined,
          undefined,
          undefined,
          failedMessageProjection({ toolCalls: [failedToolCall] }, message),
        );
      } catch {
        // persistAssistantTurn already emitted the scoped persistence failure.
      }
      this.emitForConversation(conversationId, { type: 'error', error: message });
      return;
    }

    if (controller.signal.aborted) return;

    const file: GeneratedFileEntry = {
      id: generated.id,
      fileName: `generated-image-${generated.id.slice(0, 8)}.png`,
      mimeType: 'image/png',
      uri: generated.uri,
      // The media endpoint does not expose byte size. Zero means unknown here;
      // the authenticated file response remains authoritative at preview time.
      byteCount: 0,
      kind: 'image',
      surface: 'file',
      previewable: true,
    };
    const resultLabel = `Generated with ${generated.provider} (${generated.model})`;
    const completedToolCall = {
      id: toolCallId,
      name: toolName,
      args,
      status: 'completed' as const,
      result: resultLabel,
    };
    this.emitForConversation(conversationId, {
      type: 'tool_result',
      toolCallId,
      result: resultLabel,
      durationMs: Date.now() - startedAt,
    });
    this.emitForConversation(conversationId, { type: 'generated_files', files: [file] });

    try {
      await this.persistAssistantTurn(
        conversationId,
        assistantMessageId,
        '',
        selection.model,
        undefined,
        undefined,
        undefined,
        {
          finishReason: 'stop',
          toolCalls: [completedToolCall],
          generatedFiles: [file],
        },
      );
    } catch {
      // The persistence helper emitted an actionable error and the UI must not
      // receive `done`, which could imply this result is durable.
      return;
    }
    this.emitForConversation(conversationId, { type: 'done', finishReason: 'stop' });
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
    const client = createDesktopCloudAgentRunClient(this.requireBoundary().accountId);
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
      this.emitForConversation(conversationId, {
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
      this.emitForConversation(conversationId, {
        type: 'error',
        error: `${failureMessage} Please retry.`,
      });
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
      this.emitForConversation(conversationId, {
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
    this.emitForConversation(conversationId, {
      type: 'done',
      ...(replayFinishReason ? { finishReason: replayFinishReason } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // reattachConversation — rejoin a run this client did not stream
  // -------------------------------------------------------------------------

  /**
   * Pick a durable run back up when its conversation is reopened.
   *
   * The turn may have been started on this machine before it slept, or on a
   * different device entirely; either way the server kept executing and kept
   * journaling. What makes reattachment safe is `persisted.lastSequence`: it is
   * the exact cursor already reflected in the stored message, so the replay asks
   * only for what came after it and no sentence is rendered twice. Nothing is
   * re-seeded into the sink — the prose already on screen enters as the turn's
   * `persistedContentPrefix`, which is what the eventual save concatenates.
   */
  async reattachConversation(
    conversationId: string,
    persisted: CloudRunReattachment,
  ): Promise<void> {
    if (this._disposed) return;
    // A live turn in this session is authoritative; reattaching over it would
    // fork one conversation into two writers of the same message.
    if (this._activeTurns.has(conversationId)) return;

    const boundary = this.requireBoundary();
    const client = createDesktopCloudAgentRunClient(boundary.accountId);
    const snapshot = await client.getRun(persisted.runReference.runId, {
      afterSequence: persisted.runReference.lastSequence,
      limit: 1,
    });
    const run = snapshot.run;
    if (REATTACHABLE_RUN_STATES.has(run.state) === false) return;

    const runReference: ManagedCloudAgentRunReference = {
      ...persisted.runReference,
      state: run.state,
      cancellationRequestedAt: run.cancellationRequestedAt,
    };

    if (run.state === 'awaiting_input') {
      this.reattachPendingApproval(conversationId, persisted, run, runReference);
      return;
    }

    const sink = createCloudStreamDeltaSink(
      (event) => this.emitForConversation(conversationId, event),
      CLOUD_API_BASE_URL,
    );
    const turn: ActiveCloudTurn = {
      assistantMessageId: persisted.assistantMessageId,
      model: persisted.model || run.model,
      sink,
      settled: false,
      runReference,
      unacknowledgedPublicText: '',
      canonicalPublicTextAwaitingChunk: '',
      persistedContentPrefix: persisted.content,
    };
    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);
    this._activeTurns.set(conversationId, turn);

    turn.replayPromise = this.replayDurableRun(conversationId, turn)
      .catch((error: unknown) => {
        if (turn.settled) return;
        turn.settled = true;
        this._activeTurns.delete(conversationId);
        this.emitForConversation(
          conversationId,
          cloudErrorEvent(error instanceof Error ? error : new Error(String(error))),
        );
      })
      .finally(() => this.clearAbortController(conversationId, controller));
    await turn.replayPromise;
  }

  /**
   * Rebuild a live approval card for a run that is blocked on a decision.
   *
   * This is the case the old client could not represent at all. When the server
   * persisted the turn (because nobody was connected to persist it), the stored
   * message carries the run reference but no `cloudApproval` projection, so the
   * ordinary reload hydration finds nothing to render and the user sees a turn
   * that simply stopped mid-sentence. The pending-approval summary on the run is
   * the server's own account of what it is waiting for, so the card is rebuilt
   * from that. Arguments shown here are a truncated preview; the authoritative
   * arguments never leave the server's checkpoint and are not resubmitted by the
   * client on resume.
   */
  private reattachPendingApproval(
    conversationId: string,
    persisted: CloudRunReattachment,
    run: CloudAgentRun,
    runReference: ManagedCloudAgentRunReference,
  ): void {
    if (persisted.hasPersistedApproval) return;
    const pending = run.pendingApproval;
    if (!pending) return;

    const calls = pending.toolCalls.map((call) => ({
      toolCallId: call.toolCallId,
      name: call.name,
      args: parsePendingApprovalArgs(call.argsPreview),
    }));
    this._approvals.hasLiveTurn(conversationId, {
      assistantMessageId: persisted.assistantMessageId,
      runId: run.id,
      runReference,
      model: persisted.model || run.model,
      assistantContent: persisted.content,
      calls,
      messageProjection: {},
    });
    for (const call of calls) {
      this.emitForConversation(conversationId, {
        type: 'tool_approval_request',
        toolCallId: call.toolCallId,
        name: call.name,
        args: call.args,
      });
    }
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
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (options?.signal?.aborted) {
      controller.abort();
    } else {
      options?.signal?.addEventListener('abort', abortFromCaller, { once: true });
    }
    this._abortControllers.set(conversationId, controller);
    const clearController = () => {
      options?.signal?.removeEventListener('abort', abortFromCaller);
      this.clearAbortController(conversationId, controller);
    };
    const shouldStopBeforeDispatch = () => {
      const superseded = this._abortControllers.get(conversationId) !== controller;
      if (!controller.signal.aborted && !superseded) return false;
      if (superseded) controller.abort();
      clearController();
      return true;
    };

    if (shouldStopBeforeDispatch()) return;

    const model = normalizeModelId(options?.model ?? '') ?? 'auto';
    const client = getDesktopCloudChatPersistenceClient();
    const isContinuation = options?.isContinuation === true;
    const messageHistory = options?.messageHistory ?? [];
    const userMessageId = options?.userMessageId ?? uuidv7();
    let uploadedAttachments: Awaited<ReturnType<typeof uploadDesktopCloudAttachments>> = [];

    try {
      // The host creates optimistically with this exact UUID. Joining the
      // coordinator here guarantees the server row exists before the first
      // message is written, even when the user sends immediately.
      await ensureCloudConversation(
        conversationId,
        'New chat',
        model,
        options?.projectId,
        controller.signal,
      );
      if (shouldStopBeforeDispatch()) return;
      this.assertBoundary(boundary);
      await updateCloudConversation(
        conversationId,
        {
          model,
          ...(options?.projectId !== undefined ? { projectId: options.projectId } : {}),
        },
        controller.signal,
      );
      if (shouldStopBeforeDispatch()) return;
      this.assertBoundary(boundary);

      uploadedAttachments =
        !isContinuation && options?.attachments?.length
          ? await uploadDesktopCloudAttachments(options.attachments, controller.signal)
          : [];
      if (shouldStopBeforeDispatch()) return;
      this.assertBoundary(boundary);
      const currentHistoryAttachments =
        messageHistory[messageHistory.length - 1]?.attachments ?? [];
      for (const [index, attachment] of currentHistoryAttachments.entries()) {
        const uploaded = uploadedAttachments[index];
        if (uploaded) this._attachmentAssetIds.set(attachment.id, uploaded.id);
      }

      // Persist ordinary user turns before streaming. Continue Generation's
      // instruction is request-only and must never appear in conversation
      // history as a user message.
      // Same identity rule as the assistant row below: persist under the id the
      // transcript already renders so Regenerate can delete the exact server rows
      // it just removed from the view.
      if (!isContinuation) {
        await client.saveMessage(
          conversationId,
          {
            id: userMessageId,
            role: 'user',
            content: content.trim() || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
            model,
            ...(uploadedAttachments.length
              ? { metadata: { attachments: persistedAttachmentMetadata(uploadedAttachments) } }
              : {}),
          },
          { signal: controller.signal },
        );
        if (shouldStopBeforeDispatch()) return;
        this.assertBoundary(boundary);
      }
    } catch (err) {
      clearController();
      if (!controller.signal.aborted) {
        this.emitForConversation(conversationId, {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const shouldGenerateImage =
      !isContinuation &&
      uploadedAttachments.length === 0 &&
      classifyTaskLocally(content, []).type === 'image_generation';
    if (shouldGenerateImage) {
      try {
        await this.sendManagedImageTurn(conversationId, content, userMessageId, controller);
      } finally {
        clearController();
      }
      return;
    }

    const sink = createCloudStreamDeltaSink(
      (event) => this.emitForConversation(conversationId, event),
      CLOUD_API_BASE_URL,
    );
    // Prefer the caller's minted id so the RENDERED assistant row, our durable
    // row, and the server's own `assistant_message_id` persistence are all one
    // identity — otherwise nothing in the UI (regenerate, delete) can address
    // the server row it is looking at. Falls back to a runtime-minted uuid for
    // callers that do not supply one.
    const assistantMessageId =
      options?.continuationMessageId ?? options?.assistantMessageId ?? uuidv7();
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
              this.emitForConversation(conversationId, {
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
          this.emitForConversation(conversationId, {
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
                  this.emitForConversation(conversationId, {
                    type: 'error',
                    error: `The Cloud task failed and its failure state could not be saved: ${
                      persistenceError instanceof Error
                        ? persistenceError.message
                        : String(persistenceError)
                    }`,
                  });
                });
                this.emitForConversation(conversationId, { type: 'error', error: message });
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
            this.emitForConversation(conversationId, {
              type: 'error',
              error: `The Cloud task failed and its failure state could not be saved: ${
                persistenceError instanceof Error
                  ? persistenceError.message
                  : String(persistenceError)
              }`,
            });
          });
          this.emitForConversation(conversationId, cloudErrorEvent(err));
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
        {
          ...(options?.research ? { research: true } : {}),
          ...(options?.workMode ? { workMode: options.workMode } : {}),
          ...(options?.skillName ? { skillName: options.skillName } : {}),
          ...(options?.effort ? { effort: options.effort } : {}),
          // Always sent: the server persists the assistant turn under THIS id,
          // collapsing its write and our own `saveMessage` into one row and
          // covering a crash/quit after generation (which is already billed).
          assistantMessageId,
        },
        (handle: ManagedCloudAgentRunHandle | null) => {
          activeTurn.runReference = handle
            ? {
                ...handle,
                lastSequence: sink.getAgentActivity()?.lastSequence ?? -1,
              }
            : undefined;
          if (handle) {
            this.emitForConversation(conversationId, {
              type: 'agent_run',
              runId: handle.runId,
              runPath: handle.runPath,
            });
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
          this.emitForConversation(conversationId, { type: 'error', error: message });
        }
      }
    } finally {
      clearController();
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
    const projection = this._approvals.getTurnProjection(conversationId);
    const willDispatch =
      projection?.calls.some((call) => call.toolCallId === toolCallId) === true &&
      projection.calls.every(
        (call) => call.toolCallId === toolCallId || call.decision !== undefined,
      );
    const resolvingApproval: {
      runId: string;
      cleanupCredential?: DesktopCloudRunCleanupCredential;
    } | null =
      willDispatch && projection
        ? {
            runId: projection.runId,
          }
        : null;
    if (resolvingApproval) this._resolvingApprovals.set(conversationId, resolvingApproval);
    try {
      const outcome = await this._approvals.resolve(
        conversationId,
        toolCallId,
        decision,
        (event) => this.emitForConversation(conversationId, event),
        CLOUD_API_BASE_URL,
        (err) => this.emitForConversation(conversationId, cloudErrorEvent(err)),
        controller.signal,
        (credential) => {
          if (this._resolvingApprovals.get(conversationId) === resolvingApproval) {
            resolvingApproval!.cleanupCredential = credential;
          }
        },
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
          this.emitForConversation(conversationId, {
            type: 'error',
            error: `${failureMessage} Please retry.`,
          });
          return;
        }
        this.emitForConversation(conversationId, {
          type: 'done',
          ...(outcome.finishReason ? { finishReason: outcome.finishReason } : {}),
          ...(outcome.streamError ? { streamError: outcome.streamError } : {}),
        });
      }
    } finally {
      if (this._resolvingApprovals.get(conversationId) === resolvingApproval) {
        this._resolvingApprovals.delete(conversationId);
      }
      this.clearAbortController(conversationId, controller);
    }
  }

  hasLiveApprovalTurn(conversationId: string, projection?: CloudApprovalTurnProjection): boolean {
    return this._approvals.hasLiveTurn(conversationId, projection);
  }

  // -------------------------------------------------------------------------
  // stopGeneration
  // -------------------------------------------------------------------------

  stopGeneration(conversationId: string): void {
    const resolvingApproval = this._resolvingApprovals.get(conversationId);
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
        const boundary = this._boundary;
        if (boundary) {
          void createDesktopCloudAgentRunClient(boundary.accountId)
            .cancelRun(activeTurn.runReference.runId)
            .catch((err: unknown) => {
              this.emitForConversation(conversationId, {
                type: 'error',
                error: `Could not stop the Cloud task: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            });
        }
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
        this.emitForConversation(conversationId, {
          type: 'error',
          error: `The Cloud task stopped, but its stopped state could not be saved: ${
            persistenceError instanceof Error ? persistenceError.message : String(persistenceError)
          }`,
        });
      });
    }
    if (resolvingApproval) {
      this._resolvingApprovals.delete(conversationId);
      const credential = resolvingApproval.cleanupCredential ?? this._boundary;
      if (credential) {
        void createDesktopCloudAgentRunCleanupClient(credential)
          .cancelRun(resolvingApproval.runId)
          .catch((err: unknown) => {
            this.emitForConversation(conversationId, {
              type: 'error',
              error: `Could not stop the approved Cloud task: ${
                err instanceof Error ? err.message : String(err)
              }`,
            });
          });
      }
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
    const pagination = createManagedCloudPaginationGuard('conversations');
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await client.listConversations({ limit: MANAGED_CLOUD_PAGE_SIZE, offset });
      assertCloudConversationBoundary(boundary);
      const nextOffset = pagination.acceptPage({
        items: page.conversations,
        hasMore: page.hasMore,
        currentOffset: offset,
        nextOffset: page.nextOffset,
      });
      conversations.push(...page.conversations);
      for (const conversation of page.conversations) {
        markCloudConversationReady(conversation.id, boundary);
      }
      hasMore = page.hasMore;
      if (!hasMore) break;
      offset = nextOffset;
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
    const pagination = createManagedCloudPaginationGuard('messages');
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await client.getConversation(conversationId, {
        limit: MANAGED_CLOUD_PAGE_SIZE,
        offset,
      });
      assertCloudConversationBoundary(boundary);
      const nextOffset = pagination.acceptPage({
        items: page.messages,
        hasMore: page.hasMore,
        currentOffset: offset,
        reportedTotal: page.total,
      });
      markCloudConversationReady(page.conversation.id, boundary);
      messages.push(...page.messages);
      hasMore = page.hasMore;
      if (!hasMore) break;
      offset = nextOffset;
    }

    return messages.map((m) => mapMessage(conversationId, m));
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.getMessages(conversationId);
  }

  /**
   * Drop durable rows a replacement turn superseded (Regenerate).
   *
   * Ids are the transcript's own ids — `sendMessage` persists the user and
   * assistant rows under the caller-minted ids for exactly this reason. Rows
   * are deleted oldest-first and one at a time so a partial failure still
   * leaves a consistent prefix; the boundary is asserted between calls so a
   * sign-out mid-delete cannot keep issuing authenticated writes.
   */
  async deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const boundary = this.requireBoundary();
    const client = getDesktopCloudChatPersistenceClient();
    for (const messageId of messageIds) {
      await client.deleteMessage(conversationId, messageId);
      this.assertBoundary(boundary);
    }
  }

  // -------------------------------------------------------------------------
  // Platform identifier
  // -------------------------------------------------------------------------

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'desktop';
  }
}
