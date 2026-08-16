import type {
  ChatRuntime,
  CloudApprovalTurnProjection,
  GeneratedFileEntry,
  SendMessageOptions,
  StreamCallback,
  StreamEvent,
} from '@agiworkforce/unified-chat';
import type { Conversation, ChatMessage } from '@agiworkforce/unified-chat';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  chatAttachmentAcceptAttribute,
  type ManagedCloudAgentRunReference,
  isSupportedChatAttachment,
  parseGeneratedFilesDelta,
  resolveGeneratedFileUri,
} from '@agiworkforce/cloud-contracts';
import {
  listCloudConversations,
  createCloudConversation,
  getCloudConversation,
  deleteCloudConversation,
  updateCloudConversationTitle,
  sendCloudMessage,
  CLOUD_API_BASE_URL,
  createCloudChatPersistenceClient,
  type CloudChatMessageContent,
  type CloudConversation,
  type CloudMessage,
} from '../api/cloudApi';
import { normalizeModelId } from '../constants/llm';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils';
import {
  createCloudStreamDeltaSink,
  hasRenderableCloudMessageOutput,
  type CloudStreamMessageProjection,
} from './cloudStreamDeltas';
import { CloudToolApprovalRegistry, toPersistedCloudApprovalProjection } from './cloudToolApproval';
import { uploadDesktopCloudAttachments } from '../services/desktopCloudAttachments';
import { ensureCloudConversation } from '../services/cloudChat';
import { finishAgentActivityLocally } from '@agiworkforce/client-runtime';
import {
  EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
  mapPersistedCloudMessage,
  persistedAttachmentMetadata,
  resolveOwnedCloudFileUri,
} from './persistedCloudMessage';

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

function mapConversation(cloud: CloudConversation): Conversation {
  return {
    id: cloud.id,
    title: cloud.title ?? 'New Conversation',
    createdAt: cloud.created_at,
    updatedAt: cloud.updated_at,
    model: cloud.model,
    messageCount: cloud.messages?.length,
    archived: cloud.archived ?? false,
    pinned: cloud.pinned ?? false,
    ...(cloud.project_id ? { projectId: cloud.project_id } : {}),
  };
}

function mapMessage(cloud: CloudMessage): ChatMessage {
  return mapPersistedCloudMessage(
    {
      id: cloud.id,
      conversationId: cloud.conversation_id,
      role: cloud.role,
      content: cloud.content,
      createdAt: cloud.created_at,
      ...(cloud.model ? { model: cloud.model } : {}),
      ...(cloud.provider ? { provider: cloud.provider } : {}),
      ...(cloud.metadata ? { metadata: cloud.metadata } : {}),
    },
    CLOUD_API_BASE_URL,
  );
}

/**
 * Map an `x_generated_files` delta payload onto UI entries. Wire uris are
 * relative same-origin paths (`/api/files/{id}`); resolve them against the
 * desktop cloud base URL (empty on the embedded web build, where the browser
 * resolves against the current origin). Exported for unit tests.
 */
export function mapGeneratedFilesPayload(payload: unknown): GeneratedFileEntry[] {
  return parseGeneratedFilesDelta(payload).flatMap((f): GeneratedFileEntry[] => {
    const uri = resolveOwnedCloudFileUri(
      resolveGeneratedFileUri(f.uri, CLOUD_API_BASE_URL),
      CLOUD_API_BASE_URL,
    );
    if (!uri) return [];
    return [
      {
        id: f.id,
        fileName: f.file_name,
        mimeType: f.mime_type,
        uri,
        byteCount: f.byte_count,
        kind: f.kind,
        ...(f.checksum_sha256 ? { checksumSha256: f.checksum_sha256 } : {}),
        surface: f.surface,
        previewable: f.previewable,
      },
    ];
  });
}

export class WebRuntime implements ChatRuntime {
  readonly supportsAgentControl = false;
  readonly supportsReasoningEffort = true;
  private readonly _streamCallbacks = new Set<StreamCallback>();
  private readonly _abortControllers = new Map<string, AbortController>();
  private readonly _approvals = new CloudToolApprovalRegistry();
  private readonly _attachmentAssetIds = new Map<string, string>();

  readonly supportsContinueGeneration = true;

  readonly supportsCodeExecution = true;

  readonly supportsResearch = true;

  readonly supportsManagedWebSearch = true;

  readonly attachmentPolicy = {
    accept: chatAttachmentAcceptAttribute(),
    maxFiles: MAX_CHAT_ATTACHMENT_COUNT,
    maxTotalBytes: MAX_CHAT_ATTACHMENT_BYTES,
    validate: (file: File) =>
      isSupportedChatAttachment(file.name, file.type)
        ? null
        : `${file.name} is not supported. Attach an image, PDF, or text/code file instead.`,
  };

  private emit(event: StreamEvent): void {
    for (const cb of this._streamCallbacks) {
      cb(event);
    }
  }

  async sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<void> {
    const model = normalizeModelId(options?.model ?? '') ?? 'auto';
    const controller = new AbortController();
    this._abortControllers.set(conversationId, controller);
    await ensureCloudConversation(conversationId, 'New chat', model, options?.projectId);
    const persistence = createCloudChatPersistenceClient();
    const userMessageId = uuidv7();
    const assistantMessageId = options?.continuationMessageId ?? uuidv7();
    const isContinuation = options?.isContinuation === true;

    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    const uploadedAttachments =
      !isContinuation && options?.attachments?.length
        ? await uploadDesktopCloudAttachments(options.attachments, controller.signal)
        : [];
    const messageHistory = options?.messageHistory ?? [];
    const currentHistoryAttachments = messageHistory[messageHistory.length - 1]?.attachments ?? [];
    for (const [index, attachment] of currentHistoryAttachments.entries()) {
      const uploaded = uploadedAttachments[index];
      if (uploaded) this._attachmentAssetIds.set(attachment.id, uploaded.id);
    }
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
      if (attachments.length === 0) return { role: message.role, content: message.content };
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

    const sink = createCloudStreamDeltaSink((event) => this.emit(event), CLOUD_API_BASE_URL);
    let runReference: ManagedCloudAgentRunReference | undefined;

    try {
      await persistence.updateConversation(conversationId, {
        model,
        ...(options?.projectId !== undefined ? { projectId: options.projectId } : {}),
      });
      if (!isContinuation) {
        await persistence.saveMessage(conversationId, {
          id: userMessageId,
          role: 'user',
          content: content.trim() || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
          model,
          ...(uploadedAttachments.length
            ? { metadata: { attachments: persistedAttachmentMetadata(uploadedAttachments) } }
            : {}),
        });
      }
      await sendCloudMessage(
        conversationId,
        content,
        model,
        sink.onChunk,
        async () => {
          if (runReference) {
            runReference = {
              ...runReference,
              lastSequence: Math.max(
                runReference.lastSequence,
                sink.getAgentActivity()?.lastSequence ?? -1,
              ),
              state: sink.isSuspended()
                ? 'awaiting_input'
                : sink.getStreamError()
                  ? 'failed'
                  : 'completed',
            };
          }
          this._approvals.recordTurnOutcome(
            conversationId,
            runReference,
            model,
            sink,
            assistantMessageId,
          );
          const finishReason = sink.getFinishReason();
          const streamError = sink.getStreamError();
          const projection = sink.getMessageProjection();
          const assistantContent = sink.getAccumulatedContent();
          const hasRenderableOutput = hasRenderableCloudMessageOutput(assistantContent, projection);
          if (!sink.isSuspended() && !hasRenderableOutput && !streamError) {
            const failureMessage = 'AGI Cloud completed without returning a response.';
            const agentActivity = sink.getAgentActivity();
            const failedMetadata = {
              ...(agentActivity
                ? {
                    agentActivity: finishAgentActivityLocally(agentActivity, {
                      status: 'failed',
                      completedAtMs: Date.now(),
                      error: failureMessage,
                    }),
                  }
                : {}),
              ...(runReference ? { cloudAgentRun: runReference } : {}),
              ...failedMessageProjection(projection, failureMessage),
            };
            await persistence.saveMessage(conversationId, {
              id: assistantMessageId,
              role: 'assistant',
              content: assistantContent || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
              model,
              metadata: failedMetadata,
            });
            this.emit({
              type: 'error',
              error: `${failureMessage} Please retry.`,
            });
            return;
          }
          const agentActivity = sink.getAgentActivity();
          const approvalProjection = toPersistedCloudApprovalProjection(
            this._approvals.getTurnProjection(conversationId),
          );
          const metadata = {
            ...(agentActivity ? { agentActivity } : {}),
            ...(runReference ? { cloudAgentRun: runReference } : {}),
            ...(sink.isSuspended() ? { cloudApproval: approvalProjection } : {}),
            ...projection,
          };
          await persistence.saveMessage(conversationId, {
            id: assistantMessageId,
            role: 'assistant',
            content: assistantContent || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
            model,
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
          });
          this.emit({
            type: 'done',
            ...(finishReason ? { finishReason } : {}),
            ...(streamError ? { streamError } : {}),
            ...(projection.usage ? { usage: projection.usage } : {}),
          });
        },
        (err: Error) => {
          const projection = failedMessageProjection(sink.getMessageProjection(), err.message);
          const agentActivity = sink.getAgentActivity();
          void persistence
            .saveMessage(conversationId, {
              id: assistantMessageId,
              role: 'assistant',
              content: sink.getAccumulatedContent() || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
              model,
              metadata: {
                ...(agentActivity
                  ? {
                      agentActivity: finishAgentActivityLocally(agentActivity, {
                        status: 'failed',
                        completedAtMs: Date.now(),
                        error: err.message,
                      }),
                    }
                  : {}),
                ...(runReference ? { cloudAgentRun: runReference } : {}),
                ...projection,
              },
            })
            .catch(() => undefined);
          this.emit({ type: 'error', error: err.message });
        },
        controller.signal,
        sink.onEvent,
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
        (handle) => {
          runReference = handle
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
    } catch (err) {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'error', error: message });
      }
    } finally {
      this._abortControllers.delete(conversationId);
    }
  }

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
      const persistence = createCloudChatPersistenceClient();
      if (!outcome) {
        const projection = this._approvals.getTurnProjection(conversationId);
        if (projection?.assistantMessageId) {
          const metadata = {
            ...(projection.agentActivity ? { agentActivity: projection.agentActivity } : {}),
            ...(projection.runReference ? { cloudAgentRun: projection.runReference } : {}),
            cloudApproval: toPersistedCloudApprovalProjection(projection),
          };
          await persistence.saveMessage(conversationId, {
            id: projection.assistantMessageId,
            role: 'assistant',
            content: projection.assistantContent || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
            model: projection.model,
            metadata: { ...metadata, ...(projection.messageProjection ?? {}) },
          });
        }
      } else if (outcome.assistantMessageId) {
        const emptyTerminal =
          !outcome.suspended &&
          !hasRenderableCloudMessageOutput(outcome.content, outcome.messageProjection) &&
          !outcome.streamError;
        const failureMessage = 'AGI Cloud completed without returning a response.';
        const metadata = {
          ...(outcome.agentActivity
            ? {
                agentActivity: emptyTerminal
                  ? finishAgentActivityLocally(outcome.agentActivity, {
                      status: 'failed',
                      completedAtMs: Date.now(),
                      error: failureMessage,
                    })
                  : outcome.agentActivity,
              }
            : {}),
          ...(outcome.runReference ? { cloudAgentRun: outcome.runReference } : {}),
          cloudApproval: outcome.pendingProjection
            ? toPersistedCloudApprovalProjection(outcome.pendingProjection)
            : null,
          ...(emptyTerminal
            ? failedMessageProjection(outcome.messageProjection, failureMessage)
            : outcome.messageProjection),
        };
        await persistence.saveMessage(conversationId, {
          id: outcome.assistantMessageId,
          role: 'assistant',
          content: outcome.content || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
          model: outcome.model,
          metadata,
        });
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
          ...(outcome.messageProjection?.usage ? { usage: outcome.messageProjection.usage } : {}),
        });
      }
    } finally {
      this._abortControllers.delete(conversationId);
    }
  }

  hasLiveApprovalTurn(conversationId: string, projection?: CloudApprovalTurnProjection): boolean {
    return this._approvals.hasLiveTurn(conversationId, projection);
  }

  stopGeneration(conversationId: string): void {
    const controller = this._abortControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(conversationId);
    }
  }

  onStream(callback: StreamCallback): () => void {
    this._streamCallbacks.add(callback);
    return () => this._streamCallbacks.delete(callback);
  }

  async createConversation(title?: string): Promise<Conversation> {
    const cloud = await createCloudConversation(title ?? 'New Conversation', 'auto');
    return mapConversation(cloud);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await deleteCloudConversation(conversationId);
  }

  async deleteMessages(conversationId: string, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const persistence = createCloudChatPersistenceClient();
    for (const messageId of messageIds) {
      await persistence.deleteMessage(conversationId, messageId);
    }
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await updateCloudConversationTitle(conversationId, title);
  }

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

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const conversation = await getCloudConversation(conversationId);
    return (conversation.messages ?? []).map(mapMessage);
  }

  async loadMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.getMessages(conversationId);
  }

  getPlatform(): 'desktop' | 'web' | 'mobile' {
    return 'web';
  }
}
