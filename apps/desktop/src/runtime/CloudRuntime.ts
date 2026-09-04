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
 *     managed-cloud session, see that module's trust-boundary doc comment.
 *   - Streaming: `sendCloudMessage` (`apps/desktop/src/api/cloudApi.ts`),
 *     which already targets the real live streaming endpoint
 *     (`POST /api/llm/v1/chat/completions`, `stream: true`), this is the
 *     SAME endpoint `apps/web/lib/hooks/useChatStream.ts` calls. Conversation
 *     CRUD also uses the canonical shared managed-cloud chat client.
 *   - Message durability mirrors `useChatStream.ts`'s `saveMessageToDb()`
 *     call pattern: the user message is persisted before streaming starts,
 *     and the assistant message is persisted once the stream completes.
 *   - Delta parsing (tool_calls/tool_status/tool_result/x_search_results/
 *     x_generated_files/x_tool_approval_request/<thinking>) is shared with
 *     `WebRuntime` via `./cloudStreamDeltas.ts` so both runtimes render an
 *     identical execution timeline from the same wire. A suspended
 *     (tool-approval) turn is NOT persisted at `onDone`, see
 *     `./cloudToolApproval.ts` and `resolveToolApproval` below, the
 *     completed turn is persisted only once the resume finishes.
 *
 * LIVE PUBLIC ALPHA: `App.tsx` delegates to the single composition root in
 * `desktopChatRuntime.ts`, which selects this runtime only for a signed-in
 * Tauri host whose app mode is exactly `cloud`. Local and BYOK continue to
 * select `TauriRuntime`; unreadable mode state fails closed there as well.
 * Managed cloud is open in public alpha, there is no coming-soon gate, but
 * this trust-boundary selection stays explicit.
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
  resolveVisibleThread,
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
  generateCloudVideo,
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
  unacknowledgedPublicText: string;
  canonicalPublicTextAwaitingChunk: string;
  persistedContentPrefix: string;
}

function durableAssistantContent(turn: ActiveCloudTurn): string {
  return `${turn.persistedContentPrefix}${turn.sink.getAccumulatedContent()}`;
}

const REATTACHABLE_RUN_STATES = new Set<CloudAgentRun['state']>([
  'queued',
  'running',
  'paused',
  'awaiting_input',
]);

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

function mapMessage(conversationId: string, raw: ManagedCloudMessage): ChatMessage {
  const mapped = mapPersistedCloudMessage(
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
  return raw.parentId === undefined ? mapped : { ...mapped, parentId: raw.parentId };
}

async function readTemporaryChatPreference(): Promise<boolean> {
  try {
    const { useSettingsStore } = await import('../stores/settingsStore');
    return useSettingsStore.getState().chatPreferences.temporaryChat === true;
  } catch {
    return false;
  }
}

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

  readonly supportsCodeExecution = true;

  readonly supportsImageGeneration = true;

  readonly supportsVideoGeneration = true;

  readonly supportsComputerUse = false;

  readonly supportsConcurrentTurns = true;

  readonly supportsManagedWebSearch = true;

  readonly supportsAgentControl = false;
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
    if (this._abortControllers.get(conversationId) === controller) {
      this._abortControllers.delete(conversationId);
    }
  }

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
      return;
    }
    this.emitForConversation(conversationId, { type: 'done', finishReason: 'stop' });
  }

  private async sendManagedVideoTurn(
    conversationId: string,
    prompt: string,
    userMessageId: string,
    controller: AbortController,
  ): Promise<void> {
    const assistantMessageId = uuidv7();
    const toolCallId = uuidv7();
    const toolName = 'media_generate_video';
    const args = { prompt };
    const startedAt = Date.now();

    this.emitForConversation(conversationId, {
      type: 'tool_call',
      toolCall: { id: toolCallId, name: toolName, args },
    });

    let generated: Awaited<ReturnType<typeof generateCloudVideo>>;
    try {
      generated = await generateCloudVideo({
        prompt,
        idempotencyKey: createManagedMediaIdempotencyKey({
          surface: 'desktop',
          operation: 'video',
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
          getRoutingSlotModel('video_generation'),
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
      fileName: `generated-video-${generated.id.slice(0, 8)}.mp4`,
      mimeType: 'video/mp4',
      uri: generated.uri,
      byteCount: 0,
      kind: 'video',
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
        generated.model,
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
      return;
    }
    this.emitForConversation(conversationId, { type: 'done', finishReason: 'stop' });
  }

  private async replayDurableRun(conversationId: string, turn: ActiveCloudTurn): Promise<void> {
    const runReference = turn.runReference;
    if (!runReference) throw new Error('Managed Cloud run handle is unavailable');

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

  async reattachConversation(
    conversationId: string,
    persisted: CloudRunReattachment,
  ): Promise<void> {
    if (this._disposed) return;
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
      await ensureCloudConversation(
        conversationId,
        'New chat',
        model,
        options?.projectId,
        controller.signal,
        await readTemporaryChatPreference(),
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

    const canGenerateMedia = !isContinuation && uploadedAttachments.length === 0;

    if (canGenerateMedia && options?.mediaMode === 'video') {
      try {
        await this.sendManagedVideoTurn(conversationId, content, userMessageId, controller);
      } finally {
        clearController();
      }
      return;
    }

    const shouldGenerateImage =
      canGenerateMedia &&
      (options?.mediaMode === 'image' ||
        classifyTaskLocally(content, []).type === 'image_generation');
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
          const streamedUsage = sink.getMessageProjection().usage;
          this.emitForConversation(conversationId, {
            type: 'done',
            ...(finishReason ? { finishReason } : {}),
            ...(streamError ? { streamError } : {}),
            ...(streamedUsage ? { usage: streamedUsage } : {}),
          });
        },
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
          ...(outcome.messageProjection?.usage ? { usage: outcome.messageProjection.usage } : {}),
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

  onStream(callback: StreamCallback): () => void {
    if (this._disposed) return () => undefined;
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  async createConversation(title?: string): Promise<Conversation> {
    const boundary = this.requireBoundary();
    const cloud = await ensureCloudConversation(uuidv7(), title ?? 'New Conversation');
    this.assertBoundary(boundary);
    if (import.meta.env.DEV) {
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

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const boundary = this.requireBoundary();
    await waitForCloudConversationReady(conversationId, boundary);
    const client = getDesktopCloudChatPersistenceClient();
    const messages: ManagedCloudMessage[] = [];
    const pagination = createManagedCloudPaginationGuard('messages');
    let conversation: ManagedCloudConversation | undefined;
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
      conversation ??= page.conversation;
      messages.push(...page.messages);
      hasMore = page.hasMore;
      if (!hasMore) break;
      offset = nextOffset;
    }

    return resolveVisibleThread(messages, conversation?.activeLeafMessageId ?? null).map((m) =>
      mapMessage(conversationId, m),
    );
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.getMessages(conversationId);
  }

  async deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const boundary = this.requireBoundary();
    const client = getDesktopCloudChatPersistenceClient();
    for (const messageId of messageIds) {
      await client.deleteMessage(conversationId, messageId);
      this.assertBoundary(boundary);
    }
  }

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'desktop';
  }
}
