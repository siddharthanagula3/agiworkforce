import { Alert } from 'react-native';
import { create } from 'zustand';
import { agiNativeColors } from '@agiworkforce/design-tokens';
import { QueueFullError } from '@agiworkforce/runtime';
import { localGenerate } from '@agiworkforce/local-llm';
import { getMobileSendQueue } from '@/lib/sendQueue';
import { api, ApiPaywallError } from '@/services/api';
import { streamChat, type StreamDelta } from '@/services/streaming';
import {
  createToolCallAccumulator,
  accumulateToolCallDelta,
  toolCallList,
} from '@/src/features/chat/utils/toolCallAccumulator';
import { getRemoteChatDisabledReason, RemoteChatDisabledError } from '@/services/remoteChatGate';
import { checkContentFilter } from '@/lib/contentFilter';
import { isMinorMode } from '@/src/features/auth/services/ageGate';
import { useAuthStore } from '@/src/features/auth/store';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  markLocalModelRefUsed,
  resolveLocalModelRef,
} from '@/src/features/model-picker/localModelRuntime';
import { isCloudManagedModelId, isSelectableModelId } from '@/src/features/model-picker/service';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useChatViewStore, type ChatMode, type ChatStyle } from './chatViewStore';
import { retrieveMemoryContext } from '@/src/features/memory/store';
import { buildPersonalContextBlocks } from '@/src/features/memory/services/personalContext';
import { consolidateFactsFromTurn } from '@/src/features/memory/services/consolidation';
import { recognizeText } from '@/src/features/image/services/ocr';
import {
  executionModeForConversation,
  executionModeForModel,
  providerForExecutionMode,
  type ConversationExecutionMode,
} from '@/src/features/chat/utils/conversationMode';
import type { ChatMessage, MessageAttachment, ConversationSummary } from '@/types/chat';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { markConversationForSync, markMessageForSync, syncNow } from '@/services/cloudSyncEngine';
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

function getCloudStore() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatCloudMessageStore } =
    require('@/stores/chat/chatCloudMessageStore') as typeof import('@/stores/chat/chatCloudMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatCloudMessageStore;
}

/**
 * Deterministic transcript ordering for cloud conversations: by `createdAt`,
 * then by the stable server `id` for equal timestamps. Shared by the cloud
 * mirror + LLM-history paths below, and identical to the cross-device puller in
 * cloudSyncEngine.ts — so the SAME transcript renders/feeds in ONE order no
 * matter which path last wrote `setCloudMessages`. (`createdAt` is a free-form
 * ISO string with no uniqueness constraint, so ties are reachable.)
 */
export function compareCloudMessagesByCreatedAtThenId(a: ChatMessage, b: ChatMessage): number {
  const at = a.createdAt ?? '';
  const bt = b.createdAt ?? '';
  return at === bt ? a.id.localeCompare(b.id) : at.localeCompare(bt);
}

/**
 * Additive write-through for CLOUD conversations (P2 sync).
 *
 * The live send/stream path writes messages to the LOCAL message store (which feeds
 * LLM history-building). This mirrors a COMPLETED turn's messages into the cloud
 * store and queues them for the next sync push, so that: (a) the engine can push
 * them server-side (the first durable persistence path for mobile cloud chat), (b) a
 * conversation reopen's empty-GET guard sees existing messages and won't clobber
 * them, and (c) cross-device pulls merge against the same store. No-op for local
 * conversations — gated on the cloud store actually owning the conversation.
 */
function mirrorCloudTurn(
  conversationId: string,
  messages: ChatMessage[],
  convPatch: Partial<ConversationSummary>,
): void {
  const cloud = getCloudStore().getState();
  if (!cloud.conversations.some((c) => c.id === conversationId)) return;

  const current = cloud.messages[conversationId] ?? [];
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of messages) byId.set(m.id, { ...byId.get(m.id), ...m });
  const ordered = Array.from(byId.values()).sort(compareCloudMessagesByCreatedAtThenId);
  cloud.setCloudMessages(conversationId, ordered);
  cloud.patchCloudConversation(conversationId, { ...convPatch, messageCount: ordered.length });

  markConversationForSync(conversationId);
  for (const m of messages) {
    // Only user/assistant/system rows are part of the synced transcript.
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
      markMessageForSync(conversationId, m.id);
    }
  }
}

/**
 * Build the prior-turn history the LLM sees for a conversation (P2 cross-device).
 *
 * For CLOUD conversations this MERGES the cloud store — which holds turns PULLED
 * from other devices plus the locally-mirrored turns — with the local store, so a
 * user can seamlessly continue on mobile a conversation they started on web/desktop
 * and the model receives the full pulled history. Local conversations read only the
 * local store. Union by id (cloud copy wins — it's the persisted/final content),
 * ordered by createdAt.
 */
function historyMessagesForConversation(
  conversationId: string,
  executionMode: ConversationExecutionMode,
): ChatMessage[] {
  const local = getMsgStore().getState().messages[conversationId] ?? [];
  if (executionMode !== 'cloud') return local;

  const cloud = getCloudStore().getState().messages[conversationId] ?? [];
  if (cloud.length === 0) return local;

  const byId = new Map<string, ChatMessage>();
  for (const m of local) byId.set(m.id, m);
  for (const m of cloud) byId.set(m.id, m);
  return Array.from(byId.values()).sort(compareCloudMessagesByCreatedAtThenId);
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
    const { useArtifactStore, deriveAndMapToMobileArtifacts } =
      require('@/src/features/artifacts/store') as typeof import('@/src/features/artifacts/store');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const mobileArtifacts = deriveAndMapToMobileArtifacts(
      content,
      conversationId,
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
    // #2: enforce minor-safe content filtering before the prompt reaches ANY LLM
    // (local or cloud). The age-gate promises minors "age-appropriate content
    // filtering"; this is the only enforcement point and was previously dead code.
    if (isMinorMode()) {
      const verdict = checkContentFilter(content, true);
      if (!verdict.allowed) {
        Alert.alert('Content not available', verdict.refusal);
        return;
      }
    }

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
    // C1: Cloud auth gate — checked before invite/paywall gates so "sign in"
    // takes priority. isClerkLoaded guard prevents false-rejection during the
    // ~200ms cold-start window where isClerkSignedIn is false for signed-in users.
    if (FEATURES.auth && executionMode === 'cloud') {
      const { isClerkLoaded, isClerkSignedIn } = useAuthStore.getState();
      if (isClerkLoaded && !isClerkSignedIn) {
        set({
          error: 'Sign in to use AGI Cloud.',
          paywallError: null,
          isStreaming: streamingConversations.size > 0,
        });
        return;
      }
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
      // LOCAL-DATA-TO-CLOUD FIX: local files must not be uploaded to the cloud
      // API without explicit user consent. Show a confirmation before upload.
      const fileNames = attachments.map((a) => a.fileName).join(', ');
      const userConsented = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Send files to AGI Cloud?',
          `"${fileNames}" will be uploaded to AGI Cloud to process your message. Files leave this device.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Upload & Send', style: 'default', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });

      if (!userConsented) {
        // User declined — send message without attachments (or abort).
        // We abort the whole send to avoid silently dropping files the user
        // thought were attached; they can choose to re-send without files.
        set({
          error: 'File upload cancelled. Re-send without files or tap Upload & Send to confirm.',
          paywallError: null,
          isStreaming: streamingConversations.size > 0,
        });
        return;
      }

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
      } catch (err) {
        // AUTH-ERROR-FIX: 401 / session-expired errors must be surfaced to user, not silently swallowed.
        // uploadWithRetry intentionally throws on auth errors so we can distinguish them from
        // transient network errors (which return null after retries). User must be notified that
        // attachments failed to upload due to auth, not connection issues.
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.message.includes('session expired') || error.message.includes('401')) {
          set({
            error: 'Session expired. Please sign in again to upload files.',
            paywallError: null,
            isStreaming: streamingConversations.size > 0,
          });
          return;
        }
        // For other errors, continue without attachments (transient network errors already
        // showed an Alert via uploadWithRetry). This allows the message to be sent even if
        // some files couldn't upload.
      }
    }

    // Cloud conversations need globally-unique, time-ordered ids (UUIDv7) so messages
    // can be pushed/merged across devices; local chats keep the lightweight local id.
    const newMessageId = () => (executionMode === 'cloud' ? uuidv7() : generateId());

    const userMessage: ChatMessage = {
      id: newMessageId(),
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      model,
      attachments: uploadedAttachments,
    };

    const assistantMessageId = newMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
      model,
    };

    // P2: for cloud chats, history merges in turns pulled from other devices so a
    // conversation started on web/desktop continues seamlessly here.
    const existingMessages = historyMessagesForConversation(conversationId, executionMode);

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

    // Project custom instructions — separate stores per trust boundary
    // (useProjectStore is local-only, useCloudProjectStore is cloud-only;
    // never cross-read one from the other's conversation.projectId).
    const activeProjectId = conversation?.projectId ?? null;
    if (activeProjectId) {
      const activeProject =
        executionMode === 'local'
          ? useProjectStore.getState().projects.find((p) => p.id === activeProjectId)
          : useCloudProjectStore
              .getState()
              .projects.find((p) => p.id === activeProjectId && p.deletedAt === null);
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
    const agentControl = useAgentControlStore.getState().resolve(conversationId, activeProjectId);

    // Inject personalization + top-K relevant memories as system context, in BOTH
    // modes (parity with web/desktop cloud chat). The sources are mode-scoped so
    // the trust boundary holds: `retrieveMemoryContext` reads the cloud memory
    // store in cloud mode and on-device SQLite in local mode, and personalization
    // comes from the matching settings store. A pure composer decides block content
    // + order ([persona, memory]); any failure here must never block a chat turn.
    try {
      const memFacts = await retrieveMemoryContext(content, 5);
      const personalization =
        executionMode === 'cloud'
          ? useCloudSettingsStore.getState().personalization
          : useLocalSettingsStore.getState().personalization;
      const blocks = buildPersonalContextBlocks({ personalization, memories: memFacts });
      // Unshift in reverse so the final order is [persona, memory, ...existing].
      for (let i = blocks.length - 1; i >= 0; i -= 1) {
        historyMessages.unshift(blocks[i]);
      }
    } catch {
      // Non-fatal: memory/personalization injection must never block a chat turn.
    }

    // Learn from this turn: extract durable facts from the user's message and
    // persist new ones (deduped) into the mode-matching memory namespace
    // (cloud-synced in cloud mode, on-device SQLite in local mode). Fire-and-forget
    // — never await, never block the turn — and skip in temporary/incognito chats.
    if (!useSettingsStore.getState().isTemporaryChat) {
      void consolidateFactsFromTurn({ message: content, conversationId, executionMode });
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

    // Cloud write-through: persist+queue the user message now so an aborted or failed
    // turn still syncs it (the assistant reply is mirrored on stream completion).
    if (executionMode === 'cloud') {
      mirrorCloudTurn(conversationId, [userMessage], { lastMessage: content });
    }

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

      // Per-turn agentic tool-call accumulator. The server streams tool steps
      // (web_search / code execution / MCP) as SSE deltas; we fold them into the
      // assistant message's toolCalls so InlineToolCall renders them live.
      const toolAcc = createToolCallAccumulator();

      // Per-turn web search: when the user has the web-search feature enabled
      // (AddToChatSheet toggle, gated by FEATURES.webSearch), ask the server to
      // inject its built-in web_search tool. The server streams results back as
      // x_search_results deltas, which the tool-call accumulator already renders.
      const webSearchEnabled = FEATURES.webSearch && useChatViewStore.getState().features.webSearch;

      // Raw content accumulator for cloud streams — separate from streamingContent
      // (which must hold only display-clean text). The server intentionally emits
      // Anthropic extended-thinking as literal `<thinking>...</thinking>` markers
      // inline in delta.content (apps/web .../stream-transform.ts), using the same
      // tag convention parseLocalThinking already parses for local models. Before
      // this fix, cloud deltas were appended to streamingContent unparsed, so
      // Claude thinking-model replies rendered raw `<thinking>` tag soup as the
      // visible message instead of routing to the reasoning/ThinkingChip UI.
      let cloudContentRaw = '';
      // Structured delta.reasoning is a separate, genuinely incremental channel
      // (e.g. a provider's dedicated reasoning field) from the tag-embedded
      // thinking parsed out of cloudContentRaw below. Tracked separately because
      // parseLocalThinking re-parses the FULL raw buffer on every delta (it has
      // to, to handle a tag straddling two chunks) — accumulating its output
      // onto itself across deltas would duplicate the reasoning text.
      let cloudStructuredReasoning = '';

      await streamChat(
        {
          model,
          messages: historyMessages,
          stream: true,
          thinking: true,
          effort: agentControl.effort,
          ...(webSearchEnabled ? { web_search: true } : {}),
        },
        {
          onDelta: (delta: StreamDelta) => {
            const state = get();

            if (delta.content) cloudContentRaw += delta.content;
            const parsedTags = parseLocalThinking(cloudContentRaw);
            const newContent = parsedTags.content;

            if (delta.reasoning) {
              if (!thinkingStartTimes.has(conversationId) && !state.streamingReasoning) {
                thinkingStartTimes.set(conversationId, Date.now());
              }
              cloudStructuredReasoning += delta.reasoning;
            }
            if (parsedTags.hasReasoning && !thinkingStartTimes.has(conversationId)) {
              thinkingStartTimes.set(conversationId, Date.now());
            }
            const newReasoning = [cloudStructuredReasoning, parsedTags.reasoning]
              .filter(Boolean)
              .join('\n\n');

            accumulateToolCallDelta(toolAcc, delta);
            const toolCalls = toolCallList(toolAcc);

            const currentMsgStore = getMsgStore();
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: newContent,
                    reasoning: newReasoning || undefined,
                    isStreaming: true,
                    ...(toolCalls.length > 0 ? { toolCalls } : {}),
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

            // Finalize the accumulated tool calls onto the message. mirrorCloudTurn
            // (below) reads this same finalized message, so the tool steps ride
            // along into the cloud write-through and survive reload.
            const finalToolCalls = toolCallList(toolAcc);

            const currentMsgStore = getMsgStore();
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    isStreaming: false,
                    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
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

            // Cloud write-through: mirror the finalized assistant reply into the cloud
            // store, queue it, and push immediately (don't wait for the sync interval).
            if (executionMode === 'cloud') {
              const finalAssistant = updatedMsgs.find((m) => m.id === assistantMessageId);
              if (finalAssistant) {
                mirrorCloudTurn(conversationId, [finalAssistant], {
                  lastMessage: preview,
                  updatedAt: new Date().toISOString(),
                });
              }
              void syncNow();
            }

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

            // Diagnostics go to the console only — never into the user-facing
            // assistant bubble or retry banner. Rendering `error.message`/`[DIAG]`
            // to the UI leaks internal strings (e.g. "The request timed out…") and
            // breaks the clean, consistent failure copy users expect.
            if (__DEV__) {
              console.warn(`[chat-stream] onError ${error?.name}: ${error?.message}`);
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
              // Surface the prominent one-tap retry (SendErrorBanner) for stream /
              // timeout failures too — not just pre-flight errors. Every failed cloud
              // send now gets an obvious Retry affordance, consistent with the
              // in-thread "Something went wrong" bubble. Cleared on the next send
              // (error: null at turn start) or via the banner's dismiss/retry.
              error: 'Something went wrong. Please try again.',
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

    // #16: only the CURRENT conversation may be stopped. Do NOT fall back to an
    // arbitrary streaming conversation — the global isStreaming flag can surface
    // the Stop button while the user views a non-streaming screen, and aborting a
    // random background stream is wrong.
    const targetId = currentId && streamingConversations.has(currentId) ? currentId : null;

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
        }
      }
      // Reflect whatever is still actually streaming — background conversations
      // must keep running and keep the global flag accurate.
      set({
        isStreaming: streamingConversations.size > 0,
        streamingContent: '',
        streamingReasoning: '',
      });
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

    // Resolve the (user, optional assistant) pair from EITHER id. The message
    // action sheet passes the ASSISTANT id; the send-failure banner passes the
    // last USER id (a pre-stream failure may never create an assistant message).
    const target = msgs[msgIndex];
    if (!target) return;
    let userMsg: (typeof msgs)[number] | null = null;
    let assistantMsg: (typeof msgs)[number] | undefined;
    let userIndex: number;
    if (target.role === 'assistant') {
      assistantMsg = target;
      userIndex = msgIndex - 1;
      userMsg = userIndex >= 0 ? msgs[userIndex] : null;
    } else if (target.role === 'user') {
      userMsg = target;
      userIndex = msgIndex;
      const next = msgs[msgIndex + 1];
      assistantMsg = next && next.role === 'assistant' ? next : undefined;
    } else {
      return;
    }
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
    const userModel = userMsg.model ?? assistantMsg?.model ?? 'auto-balanced';

    set((s) => ({ retryAttempts: { ...s.retryAttempts, [messageId]: nextAttempt } }));

    const removedCount = msgs.length - userIndex;
    // #23: only the finalize/success path increments messageCount (+2). An
    // assistant-targeted regenerate replaces a counted exchange (subtract the
    // removed messages); a banner retry of a FAILED send was never counted
    // (subtract 0). sendMessage re-adds +2 on success, keeping the count accurate.
    const countedRemoved = target.role === 'assistant' ? removedCount : 0;
    const trimmedMsgs = msgs.slice(0, userIndex);
    msgStore.setState((s) => ({
      messages: { ...s.messages, [conversationId]: trimmedMsgs },
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, messageCount: Math.max(0, (c.messageCount ?? 0) - countedRemoved) }
          : c,
      ),
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
