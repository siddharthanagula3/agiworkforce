import { Alert } from 'react-native';
import { create } from 'zustand';
import { agiNativeColors } from '@agiworkforce/design-tokens';
import { QueueFullError } from '@agiworkforce/runtime';
import { localGenerate } from '@agiworkforce/local-llm';
import { getMobileSendQueue } from '@/lib/sendQueue';
import { api, ApiPaywallError } from '@/services/api';
import { streamChat, type StreamDelta } from '@/services/streaming';
import { getRemoteChatDisabledReason, RemoteChatDisabledError } from '@/services/remoteChatGate';
import {
  markLocalModelRefUsed,
  resolveLocalModelRef,
} from '@/src/features/model-picker/localModelRuntime';
import { useProjectStore } from '@/src/features/projects/store';
import { retrieveMemoryContext } from '@/src/features/memory/store';
import type { ChatMessage, MessageAttachment } from '@/types/chat';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import type { UploadFileInput, UploadFileResult } from '@/services/api';
import type { ChatMessage as LocalLlmMessage } from '@agiworkforce/local-llm';

/** Paywall error state captured when the API returns a tier-cap paywall response. */
export interface PaywallErrorState {
  feature: string;
  requiredTier: string;
  reason: string;
}

interface ExecutionState {
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  error: string | null;
  paywallError: PaywallErrorState | null;
  retryAttempts: Record<string, number>;
  isEditing: boolean;

  sendMessage: (
    conversationId: string,
    content: string,
    model: string,
    attachments?: Attachment[],
  ) => Promise<void>;
  stopStreaming: () => void;
  retryMessage: (conversationId: string, messageId: string) => void;
  editMessage: (conversationId: string, messageId: string, newContent: string) => void;
  clearError: () => void;
  clearPaywallError: () => void;
}

const abortControllers = new Map<string, AbortController>();
const MAX_ABORT_CONTROLLERS = 50;
const streamingConversations = new Set<string>();
/** Tracks conversation IDs that were cancelled before streaming started. */
const cancelledBeforeStream = new Set<string>();
const MAX_RETRY_ATTEMPTS = 3;
const thinkingStartTimes = new Map<string, number>();
const MAX_UPLOAD_RETRIES = 2;

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createLocalAttachmentReferences(
  attachments?: Attachment[],
): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((attachment) => ({
    url: attachment.uri,
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
  }));
}

function normalizeLocalMessageContent(
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (part.type === 'text') return part.text ?? '';
      if (part.type === 'image_url') return '[image attachment]';
      return `[${part.type}]`;
    })
    .filter(Boolean)
    .join('\n');
}

function localSetupMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (
    raw.includes('No model path') ||
    raw.includes('No local runtime') ||
    raw.includes('Download a model') ||
    raw.includes('not downloaded') ||
    raw.includes('not available on this device')
  ) {
    return 'Local Mode + Local LLMs is active, but no on-device model is ready yet. Download a local model from Models or join the Cloud Managed waitlist for hosted compute.';
  }
  return (
    raw ||
    'Local inference failed. Check device storage, thermal state, and installed model status.'
  );
}

async function uploadWithRetry(
  file: UploadFileInput,
  fileName: string,
): Promise<UploadFileResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      return await api.uploadFile(file);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.includes('session expired') || lastError.message.includes('401')) {
        throw lastError;
      }
      if (attempt < MAX_UPLOAD_RETRIES) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  Alert.alert(
    'Upload Failed',
    `Could not upload "${fileName}". Please check your connection and try again.`,
    [{ text: 'OK' }],
  );
  return null;
}

/** Retrieve message store state lazily to avoid circular imports at module load time. */
function getMsgStore() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatMessageStore } =
    require('@/stores/chat/chatMessageStore') as typeof import('@/stores/chat/chatMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatMessageStore;
}

/**
 * Dark-mode accent palette used when persisting artifacts to the store.
 * Sourced from the shared design-token package so no hex values are hardcoded.
 * The gallery re-derives the live color from useThemeColors() at render time,
 * so the persisted value is only a stable fallback.
 */
const _artifactThemeColors = agiNativeColors.dark;

/**
 * Extract fenced code blocks from a completed assistant response and push any
 * qualifying ones to the artifact store.
 *
 * Kept non-blocking: any failure is swallowed so artifact capture never
 * interrupts the chat flow. Called after onDone / local finalContent — not
 * per-token.
 */
function captureArtifactsFromMessage(
  content: string,
  messageId: string,
  conversationId: string,
  conversationTitle: string,
  createdAt: string,
): void {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { useArtifactStore, extractCodeBlocks, codeBlocksToMobileArtifacts } =
      require('@/src/features/artifacts/store') as typeof import('@/src/features/artifacts/store');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const blocks = extractCodeBlocks(content);
    if (blocks.length === 0) return;
    const mobileArtifacts = codeBlocksToMobileArtifacts(
      blocks,
      messageId,
      createdAt,
      conversationTitle,
      _artifactThemeColors,
    );
    if (mobileArtifacts.length > 0) {
      useArtifactStore.getState().addArtifacts(mobileArtifacts);
    }
  } catch {
    // Non-fatal — artifact capture must never block the chat flow.
  }
}

export const useChatExecutionStore = create<ExecutionState>()((set, get) => ({
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: '',
  error: null,
  paywallError: null,
  retryAttempts: {},
  isEditing: false,

  clearError: () => set({ error: null }),
  clearPaywallError: () => set({ paywallError: null }),

  sendMessage: async (conversationId, content, model, attachments) => {
    const queue = getMobileSendQueue();
    try {
      queue.enqueue({ value: content, mode: 'prompt' });
    } catch (err) {
      if (err instanceof QueueFullError) {
        Alert.alert(
          'Queue full',
          `The "${err.lane}" lane is at capacity. Please wait for prior sends to drain.`,
        );
        return;
      }
      throw err;
    }
    queue.dequeue();

    const existingController = abortControllers.get(conversationId);
    if (existingController) {
      existingController.abort();
      abortControllers.delete(conversationId);
    }
    // Clear any stale cancellation flag from a previous stop-before-stream for this conversation.
    cancelledBeforeStream.delete(conversationId);

    let uploadedAttachments: MessageAttachment[] | undefined;
    const remoteDisabledReason = getRemoteChatDisabledReason();
    if (remoteDisabledReason && attachments && attachments.length > 0) {
      uploadedAttachments = createLocalAttachmentReferences(attachments);
    } else if (attachments && attachments.length > 0) {
      try {
        const uploadResults = await Promise.all(
          attachments.map((a) =>
            uploadWithRetry({ uri: a.uri, name: a.fileName, type: a.mimeType }, a.fileName),
          ),
        );
        const successful = uploadResults
          .map((result, i) => ({ result, attachment: attachments[i]! }))
          .filter((x) => x.result !== null);

        if (successful.length > 0) {
          uploadedAttachments = successful.map(({ result, attachment }) => ({
            url: result!.url,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName,
          }));
        }
      } catch {
        // 401 / session-expired errors — continue without attachments
      }
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      model,
      attachments: uploadedAttachments,
    };

    const assistantMessageId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
      model,
    };

    const msgStore = getMsgStore();
    const existingMessages = msgStore.getState().messages[conversationId] ?? [];

    const historyMessages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }> = [
      ...existingMessages
        .filter((m) => !m.isStreaming)
        .map((m) => {
          const imageAttachments = m.attachments?.filter((a) => a.mimeType.startsWith('image/'));
          if (imageAttachments && imageAttachments.length > 0) {
            return {
              role: m.role,
              content: [
                ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
                ...imageAttachments.map((a) => ({
                  type: 'image_url' as const,
                  image_url: { url: a.url },
                })),
              ],
            };
          }
          return { role: m.role, content: m.content };
        }),
    ];

    const imageUploads = uploadedAttachments?.filter((a) => a.mimeType.startsWith('image/'));
    const fileUploads = uploadedAttachments?.filter((a) => !a.mimeType.startsWith('image/'));

    let messageContent = content;
    if (fileUploads && fileUploads.length > 0) {
      const fileRefs = fileUploads
        .map((f) => `[Attached file: ${f.fileName} (${f.mimeType})]`)
        .join('\n');
      messageContent = fileRefs + (content ? '\n\n' + content : '');
    }

    if (imageUploads && imageUploads.length > 0) {
      historyMessages.push({
        role: 'user',
        content: [
          ...(messageContent ? [{ type: 'text', text: messageContent }] : []),
          ...imageUploads.map((a) => ({ type: 'image_url', image_url: { url: a.url } })),
        ],
      });
    } else {
      historyMessages.push({ role: 'user', content: messageContent });
    }

    const projectState = useProjectStore.getState();
    if (projectState.activeProjectId) {
      const activeProject = projectState.projects.find(
        (p) => p.id === projectState.activeProjectId,
      );
      if (activeProject?.instructions?.trim()) {
        historyMessages.unshift({ role: 'system', content: activeProject.instructions.trim() });
      }
    }

    // Inject top-K relevant memory facts as system context (on-device, graceful fallback)
    try {
      const memFacts = await retrieveMemoryContext(content, 5);
      if (memFacts.length > 0) {
        const memBlock = [
          'User memory (retrieved for this turn — treat as background context):',
          ...memFacts.map((f, i) => `${i + 1}. ${f.fact}`),
        ].join('\n');
        historyMessages.unshift({ role: 'system', content: memBlock });
      }
    } catch {
      // Non-fatal: memory retrieval failure must never block a chat turn.
    }

    msgStore.setState((state) => {
      const existing = state.messages[conversationId] ?? [];
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, userMessage, assistantMessage],
        },
      };
    });

    msgStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: content, updatedAt: new Date().toISOString() }
          : c,
      ),
    }));

    // Guard: if stopStreaming was called before we reached this point, bail out.
    if (cancelledBeforeStream.has(conversationId)) {
      cancelledBeforeStream.delete(conversationId);
      return;
    }

    set({ isStreaming: true, streamingContent: '', streamingReasoning: '' });

    const controller = new AbortController();
    if (abortControllers.size >= MAX_ABORT_CONTROLLERS) {
      const oldestKey = abortControllers.keys().next().value;
      if (oldestKey) {
        abortControllers.get(oldestKey)?.abort();
        abortControllers.delete(oldestKey);
      }
    }
    abortControllers.set(conversationId, controller);
    streamingConversations.add(conversationId);

    try {
      if (remoteDisabledReason) {
        const localMessages: LocalLlmMessage[] = historyMessages.slice(0, -1).map((message) => ({
          role:
            message.role === 'assistant' || message.role === 'system' || message.role === 'user'
              ? message.role
              : 'user',
          content: normalizeLocalMessageContent(message.content),
        }));
        const localRef = await resolveLocalModelRef(model);
        let localStreamingContent = '';
        const updateLocalStream = (nextContent: string) => {
          const currentMsgStore = getMsgStore();
          const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
          const updatedMsgs = msgs.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: nextContent,
                  isStreaming: true,
                  metadata: {
                    ...m.metadata,
                    localMode: true,
                    localModelId: localRef.modelId,
                  },
                }
              : m,
          );

          set({ streamingContent: nextContent });
          currentMsgStore.setState((s) => ({
            messages: { ...s.messages, [conversationId]: updatedMsgs },
          }));
        };

        const result = await localGenerate(localRef.modelPath, {
          modelId: localRef.modelId,
          prompt: messageContent,
          messages: localMessages,
          requestId: assistantMessageId,
          onToken: (token) => {
            if (controller.signal.aborted) return;
            localStreamingContent += token;
            updateLocalStream(localStreamingContent);
          },
        });
        if (controller.signal.aborted) {
          abortControllers.delete(conversationId);
          streamingConversations.delete(conversationId);
          return;
        }
        const finalContent =
          result.text.trim() ||
          localStreamingContent.trim() ||
          'The local model returned an empty response. Try again with a shorter prompt.';

        const currentMsgStore = getMsgStore();
        const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: finalContent,
                isStreaming: false,
                metadata: {
                  ...m.metadata,
                  localRuntime: result.runtime,
                  localMode: true,
                  localModelId: localRef.modelId,
                  localModelName: localRef.displayName,
                },
              }
            : m,
        );

        void markLocalModelRefUsed(localRef);

        abortControllers.delete(conversationId);
        streamingConversations.delete(conversationId);

        // Extract code-block artifacts from the completed local response.
        const localConvTitle =
          currentMsgStore.getState().conversations.find((c) => c.id === conversationId)?.title ??
          '';
        captureArtifactsFromMessage(
          finalContent,
          assistantMessageId,
          conversationId,
          localConvTitle,
          new Date().toISOString(),
        );

        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastMessage: finalContent.slice(0, 100),
                  messageCount: (c.messageCount ?? 0) + 2,
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        }));
        set({
          isStreaming: streamingConversations.size > 0,
          streamingContent: '',
          streamingReasoning: '',
          error: null,
          paywallError: null,
        });
        return;
      }

      await streamChat(
        { model, messages: historyMessages, stream: true, thinking: true },
        {
          onDelta: (delta: StreamDelta) => {
            const state = get();
            let newContent = state.streamingContent;
            let newReasoning = state.streamingReasoning;

            if (delta.content) newContent += delta.content;
            if (delta.reasoning) {
              if (!thinkingStartTimes.has(conversationId) && !state.streamingReasoning) {
                thinkingStartTimes.set(conversationId, Date.now());
              }
              newReasoning += delta.reasoning;
            }

            const currentMsgStore = getMsgStore();
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: newContent,
                    reasoning: newReasoning || undefined,
                    isStreaming: true,
                  }
                : m,
            );

            set({ streamingContent: newContent, streamingReasoning: newReasoning });
            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
          },

          onDone: () => {
            const startedAt = thinkingStartTimes.get(conversationId);
            const thinkingDuration = startedAt ? (Date.now() - startedAt) / 1000 : undefined;
            thinkingStartTimes.delete(conversationId);

            const currentMsgStore = getMsgStore();
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    isStreaming: false,
                    metadata: {
                      ...m.metadata,
                      ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
                    },
                  }
                : m,
            );

            const finalContent = get().streamingContent;
            const preview = finalContent.slice(0, 100);

            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);

            // Extract code-block artifacts from the completed remote response.
            const remoteConvTitle =
              currentMsgStore.getState().conversations.find((c) => c.id === conversationId)
                ?.title ?? '';
            captureArtifactsFromMessage(
              finalContent,
              assistantMessageId,
              conversationId,
              remoteConvTitle,
              new Date().toISOString(),
            );

            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      lastMessage: preview,
                      messageCount: (c.messageCount ?? 0) + 2,
                      updatedAt: new Date().toISOString(),
                    }
                  : c,
              ),
            }));

            set({
              isStreaming: streamingConversations.size > 0,
              streamingContent: '',
              streamingReasoning: '',
            });
          },

          onError: (error: Error) => {
            thinkingStartTimes.delete(conversationId);
            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);

            const currentMsgStore = getMsgStore();
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const currentContent = get().streamingContent;

            if (error instanceof ApiPaywallError) {
              const updatedMsgs = msgs.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: currentContent || '', isStreaming: false }
                  : m,
              );
              currentMsgStore.setState((s) => ({
                messages: { ...s.messages, [conversationId]: updatedMsgs },
              }));
              set({
                isStreaming: streamingConversations.size > 0,
                streamingContent: '',
                streamingReasoning: '',
                paywallError: {
                  feature: error.feature,
                  requiredTier: error.requiredTier,
                  reason: error.reason,
                },
              });
              return;
            }

            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: currentContent || 'Something went wrong. Please try again.',
                    isStreaming: false,
                  }
                : m,
            );
            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
            set({
              isStreaming: streamingConversations.size > 0,
              streamingContent: '',
              streamingReasoning: '',
            });
          },
        },
        controller.signal,
      );
    } catch (caughtErr) {
      thinkingStartTimes.delete(conversationId);
      abortControllers.delete(conversationId);
      streamingConversations.delete(conversationId);

      if (controller.signal.aborted) return;

      const currentMsgStore = getMsgStore();
      const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
      const currentContent = get().streamingContent;

      if (remoteDisabledReason) {
        const message = localSetupMessage(caughtErr);
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId ? { ...m, content: message, isStreaming: false } : m,
        );
        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        set({
          isStreaming: streamingConversations.size > 0,
          streamingContent: '',
          streamingReasoning: '',
          error: message,
          paywallError: null,
        });
        return;
      }

      if (caughtErr instanceof ApiPaywallError) {
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: currentContent || '', isStreaming: false }
            : m,
        );
        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        set({
          isStreaming: streamingConversations.size > 0,
          streamingContent: '',
          streamingReasoning: '',
          paywallError: {
            feature: caughtErr.feature,
            requiredTier: caughtErr.requiredTier,
            reason: caughtErr.reason,
          },
        });
        return;
      }

      if (caughtErr instanceof RemoteChatDisabledError) {
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: caughtErr.message, isStreaming: false }
            : m,
        );
        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        set({
          isStreaming: streamingConversations.size > 0,
          streamingContent: '',
          streamingReasoning: '',
          error: caughtErr.message,
          paywallError: null,
        });
        return;
      }

      const updatedMsgs = msgs.map((m) =>
        m.id === assistantMessageId
          ? {
              ...m,
              content: currentContent || 'Failed to connect. Check your network and try again.',
              isStreaming: false,
            }
          : m,
      );
      currentMsgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: updatedMsgs },
      }));
      set({
        isStreaming: streamingConversations.size > 0,
        streamingContent: '',
        streamingReasoning: '',
      });
    }
  },

  stopStreaming: () => {
    const currentMsgStore = getMsgStore();
    const msgState = currentMsgStore.getState();
    const currentId = msgState.currentConversationId;

    const targetId =
      currentId && streamingConversations.has(currentId)
        ? currentId
        : (streamingConversations.values().next().value ?? null);

    if (!targetId) {
      const cid = msgState.currentConversationId;
      if (cid) {
        // Mark as cancelled so a sendMessage coroutine that hasn't added to
        // streamingConversations yet (still awaiting pre-stream async ops) will
        // bail out when it reaches the isStreaming=true set point.
        cancelledBeforeStream.add(cid);
        const msgs = msgState.messages[cid] ?? [];
        const hasStreaming = msgs.some((m) => m.isStreaming);
        if (hasStreaming) {
          currentMsgStore.setState((s) => ({
            messages: {
              ...s.messages,
              [cid]: msgs.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
            },
          }));
          set({ isStreaming: false, streamingContent: '', streamingReasoning: '' });
          return;
        }
      }
      set({ isStreaming: false, streamingContent: '', streamingReasoning: '' });
      return;
    }

    thinkingStartTimes.delete(targetId);
    const ctrl = abortControllers.get(targetId);
    if (ctrl) {
      ctrl.abort();
      abortControllers.delete(targetId);
    }
    streamingConversations.delete(targetId);

    const msgs = msgState.messages[targetId] ?? [];
    currentMsgStore.setState((s) => ({
      messages: {
        ...s.messages,
        [targetId]: msgs.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
      },
    }));

    set({
      isStreaming: streamingConversations.size > 0,
      streamingContent: '',
      streamingReasoning: '',
    });
  },

  retryMessage: (conversationId, messageId) => {
    const state = get();
    if (state.isStreaming) return;

    const msgStore = getMsgStore();
    const msgs = msgStore.getState().messages[conversationId];
    if (!msgs) return;

    const msgIndex = msgs.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;

    const assistantMsg = msgs[msgIndex];
    if (!assistantMsg || assistantMsg.role !== 'assistant') return;

    const userMsg = msgIndex > 0 ? msgs[msgIndex - 1] : null;
    if (!userMsg || userMsg.role !== 'user') return;

    const currentAttempts = state.retryAttempts[messageId] ?? 0;
    const nextAttempt = currentAttempts + 1;

    if (nextAttempt > MAX_RETRY_ATTEMPTS) {
      Alert.alert(
        'Retry Limit Reached',
        `This message has failed ${MAX_RETRY_ATTEMPTS} times. Please check your connection and try a new message.`,
        [{ text: 'OK' }],
      );
      return;
    }

    const backoffMs = nextAttempt > 1 ? 1000 * Math.pow(2, nextAttempt - 2) : 0;
    const userContent = userMsg.content;
    const userModel = userMsg.model ?? assistantMsg.model ?? 'auto-balanced';

    set((s) => ({ retryAttempts: { ...s.retryAttempts, [messageId]: nextAttempt } }));

    const trimmedMsgs = msgs.slice(0, msgIndex - 1);
    msgStore.setState((s) => ({
      messages: { ...s.messages, [conversationId]: trimmedMsgs },
    }));

    if (backoffMs > 0) {
      setTimeout(() => {
        void get().sendMessage(conversationId, userContent, userModel);
      }, backoffMs);
    } else {
      void get().sendMessage(conversationId, userContent, userModel);
    }
  },

  editMessage: (conversationId, messageId, newContent) => {
    const state = get();

    if (state.isStreaming) {
      Alert.alert(
        'Cannot Edit',
        'Please wait for the current response to finish before editing a message.',
        [{ text: 'OK' }],
      );
      return;
    }

    if (state.isEditing) return;

    const msgStore = getMsgStore();
    const msgs = msgStore.getState().messages[conversationId];
    if (!msgs) return;

    const msgIndex = msgs.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;

    const targetMsg = msgs[msgIndex];
    if (!targetMsg || targetMsg.role !== 'user') return;

    const userModel = targetMsg.model ?? 'auto-balanced';

    set({ isEditing: true });

    const trimmedMsgs = msgs.slice(0, msgIndex);
    msgStore.setState((s) => ({
      messages: { ...s.messages, [conversationId]: trimmedMsgs },
    }));

    get()
      .sendMessage(conversationId, newContent, userModel)
      .catch((err) => {
        set({ error: err instanceof Error ? err.message : 'Failed to re-send edited message' });
      })
      .finally(() => {
        set({ isEditing: false });
      });
  },
}));
