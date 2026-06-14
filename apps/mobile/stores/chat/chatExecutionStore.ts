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
import { isCloudManagedModelId, isSelectableModelId } from '@/src/features/model-picker/service';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useProjectStore } from '@/src/features/projects/store';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatViewStore, type ChatMode, type ChatStyle } from './chatViewStore';
import { retrieveMemoryContext } from '@/src/features/memory/store';
import { buildPersonalContextBlocks } from '@/src/features/memory/services/personalContext';
import { consolidateFactsFromTurn } from '@/src/features/memory/services/consolidation';
import { recognizeText } from '@/src/features/image/services/ocr';
import {
  executionModeForConversation,
  executionModeForModel,
  providerForExecutionMode,
} from '@/src/features/chat/utils/conversationMode';
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

export interface SendMessageOptions {
  mode?: ChatMode;
  style?: ChatStyle;
  taskInstruction?: string;
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
    options?: SendMessageOptions,
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
const DEFAULT_LOCAL_SYSTEM_PROMPT =
  "You are AGI, a concise helpful assistant running locally on this device. Answer the user's current request directly. Keep final answers separate from any thinking or reasoning text. Do not invent a different prompt or test unless the user explicitly asks you to create one.";

const CHAT_MODE_PROMPTS: Record<ChatMode, string | null> = {
  chat: null,
  research:
    'Mode: Research. Give careful analysis, note uncertainty, and do not claim live web access unless a web-search tool is actually available in this turn.',
  create:
    'Mode: Create. Produce usable drafts, code, plans, or structured outputs with clear next steps.',
};

const CHAT_STYLE_PROMPTS: Record<ChatStyle, string | null> = {
  normal: null,
  concise: 'Style: Concise. Keep the answer short, direct, and easy to scan.',
  detailed: 'Style: Detailed. Explain reasoning and tradeoffs clearly without padding.',
  creative: 'Style: Creative. Offer more original phrasing or options while staying accurate.',
};

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

async function buildLocalImageOcrContext(imageUploads: MessageAttachment[]): Promise<string[]> {
  const context: string[] = [];
  for (const image of imageUploads) {
    try {
      const ocr = await recognizeText(image.url);
      const text = ocr.text.trim();
      if (text.length > 0) {
        context.push(
          `[Image: ${image.fileName ?? 'attached image'}]\nOn-device OCR text:\n${text}`,
        );
        continue;
      }
    } catch {
      // Fall through to the honest no-text message below.
    }
    context.push(
      `[Image: ${image.fileName ?? 'attached image'}]\nOn-device OCR found no readable text. The local text model cannot inspect the image pixels directly.`,
    );
  }
  return context;
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

function ensureLocalSystemPrompt(messages: LocalLlmMessage[]): LocalLlmMessage[] {
  // Always lead with the base identity prompt. Other system messages (persona,
  // memory, project instructions) are additive context, not a replacement — so
  // we only skip prepending when the base prompt itself is already present.
  const hasBase = messages.some(
    (message) =>
      message.role === 'system' && message.content.trim() === DEFAULT_LOCAL_SYSTEM_PROMPT,
  );
  if (hasBase) return messages;
  return [{ role: 'system', content: DEFAULT_LOCAL_SYSTEM_PROMPT }, ...messages];
}

function buildChatViewSystemPrompt(
  mode: ChatMode,
  style: ChatStyle,
  taskInstruction?: string,
): string | null {
  const parts = [CHAT_MODE_PROMPTS[mode], CHAT_STYLE_PROMPTS[style], taskInstruction].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join('\n') : null;
}

interface ParsedLocalThinking {
  content: string;
  reasoning: string;
  hasReasoning: boolean;
}

const LOCAL_REASONING_TAG_RE = /<\s*(\/?)\s*(think|thinking|reasoning)\s*>/gi;
const PARTIAL_LOCAL_REASONING_TAG_RE =
  /<\s*\/?\s*(?:t|th|thi|thin|think|thinki|thinkin|thinking|r|re|rea|reas|reaso|reason|reasoni|reasonin|reasoning)?$/i;

function stripPartialLocalReasoningTag(raw: string): string {
  return raw.replace(PARTIAL_LOCAL_REASONING_TAG_RE, '');
}

function parseLocalThinking(raw: string): ParsedLocalThinking {
  const safeRaw = stripPartialLocalReasoningTag(sanitizeLocalOutput(raw));
  LOCAL_REASONING_TAG_RE.lastIndex = 0;

  let cursor = 0;
  let mode: 'content' | 'reasoning' = 'content';
  let content = '';
  let reasoning = '';
  let hasReasoning = false;
  let match: RegExpExecArray | null;

  while ((match = LOCAL_REASONING_TAG_RE.exec(safeRaw)) !== null) {
    const segment = safeRaw.slice(cursor, match.index);
    if (mode === 'reasoning') {
      reasoning += segment;
    } else {
      content += segment;
    }

    const isClosingTag = match[1] === '/';
    if (isClosingTag) {
      mode = 'content';
    } else {
      hasReasoning = true;
      mode = 'reasoning';
    }
    cursor = LOCAL_REASONING_TAG_RE.lastIndex;
  }

  const tail = safeRaw.slice(cursor);
  if (mode === 'reasoning') {
    reasoning += tail;
  } else {
    content += tail;
  }

  return {
    content: sanitizeLocalOutput(content).replace(/^\s+/, ''),
    reasoning: reasoning.trim(),
    hasReasoning,
  };
}

function sanitizeLocalOutput(raw: string): string {
  return raw
    .replace(/<\|im_(?:start|end)\|>/gi, '')
    .replace(/<\|endoftext\|>/gi, '')
    .replace(/<\/?s>/gi, '')
    .split(String.fromCharCode(0))
    .join('')
    .trimEnd();
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
    return 'Local Mode is active, but no on-device model is ready yet. Open Models to download or select a local model.';
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

  sendMessage: async (conversationId, content, model, attachments, options) => {
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
    const msgStore = getMsgStore();
    const conversation = msgStore.getState().conversations.find((c) => c.id === conversationId);
    const cloudUnlocked = useWaitlistStore.getState().cloudUnlocked;
    const remoteDisabledReason = getRemoteChatDisabledReason(undefined, { cloudUnlocked });
    const isCloudModel = isCloudManagedModelId(model);
    const executionMode = conversation
      ? executionModeForConversation(conversation)
      : executionModeForModel(model);
    const provider = providerForExecutionMode(executionMode);
    const shouldUseLocalRuntime = executionMode === 'local' && isSelectableModelId(model);
    if (executionMode === 'local' && isCloudModel) {
      set({
        error: 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.',
        paywallError: null,
        isStreaming: streamingConversations.size > 0,
      });
      return;
    }
    if (executionMode === 'cloud' && !isCloudModel) {
      set({
        error: 'This is an AGI Cloud chat. Start a separate Local Mode chat to use local models.',
        paywallError: null,
        isStreaming: streamingConversations.size > 0,
      });
      return;
    }
    if (executionMode === 'cloud' && remoteDisabledReason) {
      set({
        error: remoteDisabledReason,
        paywallError: null,
        isStreaming: streamingConversations.size > 0,
      });
      return;
    }
    if (!shouldUseLocalRuntime && remoteDisabledReason) {
      set({
        error: remoteDisabledReason,
        paywallError: null,
        isStreaming: streamingConversations.size > 0,
      });
      return;
    }
    if (shouldUseLocalRuntime && attachments && attachments.length > 0) {
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

    if (shouldUseLocalRuntime && imageUploads && imageUploads.length > 0) {
      const imageContext = await buildLocalImageOcrContext(imageUploads);
      messageContent = [messageContent, ...imageContext].filter(Boolean).join('\n\n');
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

    const projectState = executionMode === 'local' ? useProjectStore.getState() : null;
    const localProjectId = executionMode === 'local' ? (conversation?.projectId ?? null) : null;
    if (projectState && localProjectId) {
      const activeProject = projectState.projects.find((p) => p.id === localProjectId);
      if (activeProject?.instructions?.trim()) {
        historyMessages.unshift({ role: 'system', content: activeProject.instructions.trim() });
      }
    }

    if (executionMode === 'local') {
      const chatViewState = useChatViewStore.getState();
      const viewSystemPrompt = buildChatViewSystemPrompt(
        options?.mode ?? chatViewState.chatMode,
        options?.style ?? chatViewState.chatStyle,
        options?.taskInstruction,
      );
      if (viewSystemPrompt) {
        historyMessages.unshift({ role: 'system', content: viewSystemPrompt });
      }
    }

    // Resolve per-conversation reasoning effort for the remote API path.
    // Local model execution ignores this value because mobile local runtimes do
    // not expose an equivalent effort axis.
    const agentControl = useAgentControlStore
      .getState()
      .resolve(conversationId, executionMode === 'local' ? localProjectId : null);

    if (executionMode === 'local') {
      // Inject personalization + top-K relevant memories as system context.
      // A pure composer decides block content + order ([persona, memory]); any
      // failure here must never block a chat turn (graceful, on-device).
      try {
        const memFacts = await retrieveMemoryContext(content, 5);
        const { personalization } = useSettingsStore.getState();
        const blocks = buildPersonalContextBlocks({ personalization, memories: memFacts });
        // Unshift in reverse so the final order is [persona, memory, ...existing].
        for (let i = blocks.length - 1; i >= 0; i -= 1) {
          historyMessages.unshift(blocks[i]);
        }
      } catch {
        // Non-fatal: memory/personalization injection must never block a local chat turn.
      }
    }

    // Learn from this turn: extract durable facts from the user's message and
    // persist new ones (deduped). Fire-and-forget — never await, never block the
    // turn — and skip entirely in temporary/incognito chats.
    if (executionMode === 'local' && !useSettingsStore.getState().isTemporaryChat) {
      void consolidateFactsFromTurn({ message: content, conversationId });
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
          ? {
              ...c,
              lastMessage: content,
              updatedAt: new Date().toISOString(),
              model: c.model ?? model,
              provider: c.provider ?? provider,
              executionMode: c.executionMode ?? executionMode,
            }
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
      if (shouldUseLocalRuntime) {
        const localMessages: LocalLlmMessage[] = ensureLocalSystemPrompt(
          historyMessages.slice(0, -1).map((message) => ({
            role:
              message.role === 'assistant' || message.role === 'system' || message.role === 'user'
                ? message.role
                : 'user',
            content: normalizeLocalMessageContent(message.content),
          })),
        );
        const localRef = await resolveLocalModelRef(model);
        let localStreamingRaw = '';
        // Measure on-device decode rate (tokens/sec) from first token to done.
        let localTokenCount = 0;
        let localFirstTokenAt = 0;
        const updateLocalStream = (parsed: ParsedLocalThinking) => {
          if (parsed.hasReasoning && !thinkingStartTimes.has(conversationId)) {
            thinkingStartTimes.set(conversationId, Date.now());
          }

          const currentMsgStore = getMsgStore();
          const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
          const updatedMsgs = msgs.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: parsed.content,
                  reasoning: parsed.hasReasoning ? parsed.reasoning : undefined,
                  isStreaming: true,
                  metadata: {
                    ...m.metadata,
                    localMode: true,
                    localModelId: localRef.modelId,
                  },
                }
              : m,
          );

          set({
            streamingContent: parsed.content,
            streamingReasoning: parsed.hasReasoning ? parsed.reasoning : '',
          });
          currentMsgStore.setState((s) => ({
            messages: { ...s.messages, [conversationId]: updatedMsgs },
          }));
        };

        const result = await localGenerate(localRef.modelPath, {
          modelId: localRef.modelId,
          prompt: messageContent,
          messages: localMessages,
          requestId: assistantMessageId,
          signal: controller.signal,
          onToken: (token) => {
            if (controller.signal.aborted) return;
            if (localFirstTokenAt === 0) localFirstTokenAt = Date.now();
            localTokenCount += 1;
            localStreamingRaw += token;
            updateLocalStream(parseLocalThinking(localStreamingRaw));
          },
        });
        if (controller.signal.aborted) {
          abortControllers.delete(conversationId);
          streamingConversations.delete(conversationId);
          return;
        }
        const parsedFinal = parseLocalThinking(result.text.trim() || localStreamingRaw.trim());
        const finalContent =
          parsedFinal.content.trim() ||
          'The local model returned an empty response. Try again with a shorter prompt.';
        const finalReasoning = parsedFinal.hasReasoning ? parsedFinal.reasoning : undefined;
        const startedAt = thinkingStartTimes.get(conversationId);
        const thinkingDuration = startedAt ? (Date.now() - startedAt) / 1000 : undefined;
        thinkingStartTimes.delete(conversationId);

        // On-device decode rate: tokens emitted / wall-clock since the first token.
        const decodeMs = localFirstTokenAt > 0 ? Date.now() - localFirstTokenAt : 0;
        const tokensPerSecond =
          decodeMs > 0 && localTokenCount > 1
            ? Math.round((localTokenCount / decodeMs) * 1000 * 10) / 10
            : undefined;

        const currentMsgStore = getMsgStore();
        const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: finalContent,
                reasoning: finalReasoning,
                isStreaming: false,
                ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
                metadata: {
                  ...m.metadata,
                  localRuntime: result.runtime,
                  localMode: true,
                  localModelId: localRef.modelId,
                  localModelName: localRef.displayName,
                  ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
                },
              }
            : m,
        );

        try {
          await markLocalModelRefUsed(localRef);
        } catch (err) {
          console.warn('[chatExecutionStore] Failed to record local model usage:', err);
        }

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
                  model: c.model ?? model,
                  provider: c.provider ?? provider,
                  executionMode: c.executionMode ?? executionMode,
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
        {
          model,
          messages: historyMessages,
          stream: true,
          thinking: true,
          effort: agentControl.effort,
        },
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

            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      lastMessage: preview,
                      messageCount: (c.messageCount ?? 0) + 2,
                      updatedAt: new Date().toISOString(),
                      model: c.model ?? model,
                      provider: c.provider ?? provider,
                      executionMode: c.executionMode ?? executionMode,
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

      if (shouldUseLocalRuntime) {
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
