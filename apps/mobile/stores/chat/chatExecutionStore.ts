import { Alert, AppState } from 'react-native';
import { create } from 'zustand';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { agiNativeColors } from '@agiworkforce/design-tokens';
import {
  QueueFullError,
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  type AgentActivityState,
} from '@agiworkforce/client-runtime';
import { localGenerate } from '@agiworkforce/local-llm';
import { getMobileSendQueue } from '@/lib/sendQueue';
import { api, ApiPaywallError } from '@/services/api';
import { buildAttachedDocumentContext } from '@/services/attachmentContext';
import { resolveTurnEffort } from '@/src/features/chat/utils/turnEffort';
import {
  paywallActivityErrorFromApiError,
  paywallErrorStateFromApiError,
  type PaywallErrorState,
} from '@/src/features/chat/utils/paywallRecovery';
import {
  cancelMobileCloudAgentRun,
  streamChat,
  streamToolApprovalResume,
  type StreamDelta,
  type ChatWireMessage,
} from '@/services/streaming';
import type { InteractiveCard } from '@agiworkforce/types';
import {
  parseInteractiveCardDelta,
  parseGeneratedFilesDelta,
  readPersistedInteractiveCards,
  reconcileManagedCloudPublicText,
  ManagedCloudAgentRunReferenceSchema,
  type GeneratedFileWire,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';
import {
  createToolCallAccumulator,
  seedToolCallAccumulator,
  accumulateToolCallDelta,
  toolCallList,
} from '@/src/features/chat/utils/toolCallAccumulator';
import { getRemoteChatDisabledReason, RemoteChatDisabledError } from '@/services/remoteChatGate';
import {
  checkContentFilter,
  MINOR_SAFE_REFUSAL,
  REDUCED_SENSITIVE_CONTENT_REFUSAL,
} from '@/lib/contentFilter';
import { isMinorMode } from '@/src/features/auth/services/ageGate';
import { useAuthStore } from '@/src/features/auth/store';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  markLocalModelRefUsed,
  resolveLocalModelRef,
} from '@/src/features/model-picker/localModelRuntime';
import {
  DEFAULT_AUTO_MODE_ID,
  isCloudManagedModelId,
  isSelectableModelId,
} from '@/src/features/model-picker/service';
import { resolveMobileCloudDispatch } from '@/src/features/chat/utils/cloudDispatchRouting';
import { useModelStore } from '@/src/features/model-picker/store';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import {
  useTierStore,
  ensureCloudEntitlementsReadyForRequest,
  isCapabilityRequestable,
} from '@/src/features/billing/store';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useChatViewStore, type ChatMode, type ChatStyle } from './chatViewStore';
import { retrieveMemoryContext } from '@/src/features/memory/store';
import { buildPersonalContextBlocks } from '@/src/features/memory/services/personalContext';
import { retrievePastChatContext } from '@/src/features/memory/services/pastChatContext';
import {
  consolidateFactsFromTurn,
  shouldConsolidateMemoryOnClient,
} from '@/src/features/memory/services/consolidation';
import { recognizeText } from '@/src/features/image/services/ocr';
import {
  executionModeForConversation,
  executionModeForModel,
  providerForExecutionMode,
  type ConversationExecutionMode,
} from '@/src/features/chat/utils/conversationMode';
import {
  labelMobileSession,
  mobileExecutionProfileFor,
} from '@/src/features/chat/utils/sessionLabeling';
import type { ChatMessage, MessageAttachment, ConversationSummary, ToolCall } from '@/types/chat';
import {
  canUseBillingPlanCapability,
  getModelMetadataById,
  isAutoModeModelId,
} from '@agiworkforce/types';
import { isWebSearchAvailable } from '@agiworkforce/search';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { markConversationForSync, markMessageForSync, syncNow } from '@/services/cloudSyncEngine';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import type { UploadFileInput, UploadFileResult } from '@/services/api';
import type { ChatMessage as LocalLlmMessage } from '@agiworkforce/local-llm';
import { getConversationMessageStore } from './conversationRepository';
import { useChatCloudMessageStore } from './chatCloudMessageStore';
import { deleteCloudMessagesRemote } from '@/src/features/chat/services/cloudMessageMutations';
import { readAgentActivityState } from '@/src/features/chat/utils/agentActivityState';
import type { MobileArtifactProvenance } from '@/src/features/artifacts/types';
import {
  generatedFileArtifactsFromWire,
  generatedFileMetadataFromWire,
  generatedFileWireFromMetadata,
  mergeDerivedAndGeneratedFileArtifacts,
} from '@/src/features/chat/utils/generatedFileArtifacts';
import { stripLeadingCurrentPromptEcho } from '@/src/features/chat/utils/assistantOutput';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

export interface SendMessageOptions {
  mode?: ChatMode;
  style?: ChatStyle;
  taskInstruction?: string;
  skillName?: string;
  onAccepted?: () => void;
}

interface DeferredSend {
  content: string;
  model: string;
  attachments?: Attachment[];
  options?: SendMessageOptions;
}

interface ExecutionState {
  isStreaming: boolean;
  streamingConversationIds: string[];
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
  ) => Promise<boolean>;
  stopStreaming: () => void;
  retryMessage: (conversationId: string, messageId: string) => void;
  editMessage: (conversationId: string, messageId: string, newContent: string) => void;
  clearError: () => void;
  setSendError: (message: string) => void;
  clearPaywallError: () => void;
  setPaywallError: (paywallError: PaywallErrorState) => void;
  resolveToolApproval: (
    conversationId: string,
    assistantMessageId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ) => Promise<void>;
}

const abortControllers = new Map<string, AbortController>();
const MAX_ABORT_CONTROLLERS = 50;
const MAX_DEFERRED_SENDS = 5;
const deferredSends = new Map<string, DeferredSend[]>();
const streamingConversations = new Set<string>();
const cloudStreamingConversations = new Set<string>();
let cloudExecutionGeneration = 0;
const activeCloudRuns = new Map<string, ManagedCloudAgentRunReference>();

interface PendingApprovalCall {
  toolCallId: string;
  name: string;
}

interface PendingApprovalTurn {
  runId: string;
  conversationId: string;
  calls: PendingApprovalCall[];
  decisions: Map<string, 'approved' | 'rejected'>;
  resolving: boolean;
}

const pendingApprovalTurns = new Map<string, PendingApprovalTurn>();

export function isApprovalTurnLive(assistantMessageId: string): boolean {
  if (pendingApprovalTurns.has(assistantMessageId)) return true;

  const cloudState = useChatCloudMessageStore.getState();
  for (const [conversationId, messages] of Object.entries(cloudState.messages)) {
    const message = messages.find((candidate) => candidate.id === assistantMessageId);
    if (!message) continue;

    const runReference = ManagedCloudAgentRunReferenceSchema.safeParse(
      message.metadata?.cloudAgentRun,
    );
    const calls = (message.toolCalls ?? [])
      .filter(
        (call): call is ToolCall & { toolCallId: string } =>
          call.requiresApproval === true && typeof call.toolCallId === 'string',
      )
      .map((call) => ({ toolCallId: call.toolCallId, name: call.name }));
    if (!runReference.success || calls.length === 0) return false;

    const decisions = new Map<string, 'approved' | 'rejected'>();
    for (const call of message.toolCalls ?? []) {
      if (call.toolCallId && call.approvalDecision) {
        decisions.set(call.toolCallId, call.approvalDecision);
      }
    }
    pendingApprovalTurns.set(assistantMessageId, {
      runId: runReference.data.runId,
      conversationId,
      calls,
      decisions,
      resolving: false,
    });
    return true;
  }
  return false;
}

export function __resetPendingApprovalTurnsForTests(): void {
  pendingApprovalTurns.clear();
  activeCloudRuns.clear();
  cloudStreamingConversations.clear();
}

export function clearCloudExecutionState(): void {
  cloudExecutionGeneration += 1;
  const cloudConversationIds = Array.from(cloudStreamingConversations);
  for (const conversationId of cloudConversationIds) {
    cloudStreamingConversations.delete(conversationId);
    streamingConversations.delete(conversationId);
    activeCloudRuns.delete(conversationId);
    cancelledBeforeStream.delete(conversationId);
    deferredSends.delete(conversationId);
    thinkingStartTimes.delete(conversationId);
    thinkingEndTimes.delete(conversationId);
    lastDeltaTimes.delete(conversationId);
    const controller = abortControllers.get(conversationId);
    abortControllers.delete(conversationId);
    controller?.abort();
  }
  pendingApprovalTurns.clear();
  useChatExecutionStore.setState({
    ...streamingFlags(),
    ...(streamingConversations.size === 0
      ? { streamingContent: '', streamingReasoning: '', paywallError: null, error: null }
      : {}),
  });
}

function streamingFlags(): { isStreaming: boolean; streamingConversationIds: string[] } {
  return {
    isStreaming: streamingConversations.size > 0,
    streamingConversationIds: Array.from(streamingConversations),
  };
}

AppState.addEventListener('change', (nextState) => {
  if (nextState !== 'active') return;
  const now = Date.now();
  for (const cid of Array.from(streamingConversations)) {
    const last = lastDeltaTimes.get(cid) ?? 0;
    if (now - last > TIMEOUTS.STREAM_STALL && !activeCloudRuns.has(cid)) {
      abortControllers.get(cid)?.abort();
    }
  }
});
const cancelledBeforeStream = new Set<string>();
const MAX_RETRY_ATTEMPTS = 3;
const thinkingStartTimes = new Map<string, number>();
const thinkingEndTimes = new Map<string, number>();
const lastDeltaTimes = new Map<string, number>();
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
    ...(attachment.fileSize != null ? { fileSize: attachment.fileSize } : {}),
    ...(attachment.assetId ? { assetId: attachment.assetId } : {}),
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

/**
 * Split inline `<thinking>`/`<think>`/`<reasoning>` tag markers out of a raw
 * assistant string into display content plus reasoning.
 *
 * Exported because parsing at STREAM time is not sufficient. The server emits
 * these markers as literal content chunks (a `legacy-web` wire rendering of
 * thinking-deltas), so any message that did not arrive through this device's
 * live stream — pulled by cloud sync, produced by an agent run, or persisted
 * before the streaming parser existed — is stored with the tags still inside
 * `content`. Those rendered as raw `</thinking><thinking>` tag soup in the
 * transcript (founder 2026-08-13). The renderer therefore parses on read as
 * well, which covers every source rather than just the one path.
 */
export function parseAssistantThinking(raw: string): ParsedLocalThinking {
  return parseLocalThinking(raw);
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

function parseCurrentTurnAssistantOutput(raw: string, prompt: string): ParsedLocalThinking {
  const parsed = parseLocalThinking(raw);
  return {
    ...parsed,
    content: stripLeadingCurrentPromptEcho(parsed.content, prompt),
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

export function compareCloudMessagesByCreatedAtThenId(a: ChatMessage, b: ChatMessage): number {
  const at = a.createdAt ?? '';
  const bt = b.createdAt ?? '';
  return at === bt ? a.id.localeCompare(b.id) : at.localeCompare(bt);
}

function queueCloudTurnForSync(conversationId: string, messages: ChatMessage[]): void {
  markConversationForSync(conversationId);
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
      markMessageForSync(conversationId, m.id);
    }
  }
}

function pushCloudAssistantUpdate(
  conversationId: string,
  messages: ChatMessage[],
  assistantMessageId: string,
): void {
  const assistant = messages.find(
    (message) => message.id === assistantMessageId && message.role === 'assistant',
  );
  if (!assistant) return;
  queueCloudTurnForSync(conversationId, [assistant]);
  void syncNow();
}

function settleMessageAgentActivity(
  message: ChatMessage,
  status: 'failed' | 'cancelled',
  completedAtMs: number,
  error?: string,
): ChatMessage {
  const activity = readAgentActivityState(message.metadata?.agentActivity);
  if (!activity) return message;
  return {
    ...message,
    metadata: {
      ...message.metadata,
      agentActivity: finishAgentActivityLocally(activity, {
        status,
        completedAtMs,
        ...(error ? { error } : {}),
      }),
    },
  };
}

function historyMessagesForConversation(
  conversationId: string,
  executionMode: ConversationExecutionMode,
): ChatMessage[] {
  const owned =
    getConversationMessageStore(conversationId).getState().messages[conversationId] ?? [];
  return executionMode === 'cloud' ? [...owned].sort(compareCloudMessagesByCreatedAtThenId) : owned;
}

const _artifactThemeColors = agiNativeColors.dark;

function deriveChatMessageArtifacts(
  content: string,
  conversationId: string,
  messageId: string,
  createdAt: string,
): NonNullable<ChatMessage['artifacts']> {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { deriveArtifacts } =
      require('@agiworkforce/artifacts') as typeof import('@agiworkforce/artifacts');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const shared = deriveArtifacts(content, {
      conversationId,
      messageId,
      include: 'code',
      minCodeLines: 4,
      now: createdAt,
    });
    return shared.map((s) => ({
      id: s.id,
      type: s.type === 'chart' || s.type === 'document' || s.type === 'image' ? s.type : 'code',
      title: s.title,
      content: s.content,
      ...(s.language && s.language !== 'text' ? { language: s.language } : {}),
    }));
  } catch {
    return [];
  }
}

export { generatedFileArtifactsFromWire } from '@/src/features/chat/utils/generatedFileArtifacts';

export function citationsFromToolCalls(
  toolCalls: ToolCall[],
): NonNullable<ChatMessage['citations']> {
  const seen = new Set<string>();
  const citations: NonNullable<ChatMessage['citations']> = [];
  for (const tc of toolCalls) {
    for (const r of tc.searchResults ?? []) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      citations.push({ url: r.url, title: r.title, ...(r.snippet ? { snippet: r.snippet } : {}) });
      if (citations.length >= 8) return citations;
    }
  }
  return citations;
}

/**
 * Derive and store artifacts for one assistant message.
 *
 * Exported because history needs it too: this used to run only as a turn
 * finished streaming, so every conversation reopened from the server had its
 * artifacts silently missing. `deriveAndMapToMobileArtifacts` is pure and its
 * ids are deterministic, so re-deriving the same content is idempotent.
 */
export function captureArtifactsFromMessage(
  content: string,
  messageId: string,
  conversationId: string,
  conversationTitle: string,
  createdAt: string,
  provenance: MobileArtifactProvenance,
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
      provenance,
    );
    if (mobileArtifacts.length > 0) {
      useArtifactStore.getState().addArtifacts(mobileArtifacts);
    }
  } catch {
    // Non-fatal — artifact capture must never block the chat flow.
  }
}

function flushDeferredSend(conversationId: string): void {
  const waiting = deferredSends.get(conversationId);
  const next = waiting?.[0];
  if (!waiting || !next) return;
  const rest = waiting.slice(1);
  if (rest.length > 0) deferredSends.set(conversationId, rest);
  else deferredSends.delete(conversationId);
  void useChatExecutionStore
    .getState()
    .sendMessage(conversationId, next.content, next.model, next.attachments, next.options);
}

export const useChatExecutionStore = create<ExecutionState>()((set, get) => ({
  isStreaming: false,
  streamingConversationIds: [],
  streamingContent: '',
  streamingReasoning: '',
  error: null,
  paywallError: null,
  retryAttempts: {},
  isEditing: false,

  clearError: () => set({ error: null }),
  setSendError: (message: string) => set({ error: message }),
  clearPaywallError: () => set({ paywallError: null }),
  setPaywallError: (paywallError) => set({ paywallError }),

  sendMessage: async (conversationId, content, model, attachments, options) => {
    const minorMode = isMinorMode();
    const reduceSensitiveContent = useSettingsStore.getState().reduceSensitiveContent;
    if (minorMode || reduceSensitiveContent) {
      const verdict = checkContentFilter(
        content,
        true,
        minorMode ? MINOR_SAFE_REFUSAL : REDUCED_SENSITIVE_CONTENT_REFUSAL,
      );
      if (!verdict.allowed) {
        Alert.alert('Content not available', verdict.refusal);
        return false;
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
        return false;
      }
      throw err;
    }
    queue.dequeue();

    if (abortControllers.has(conversationId)) {
      const waiting = deferredSends.get(conversationId) ?? [];
      if (waiting.length >= MAX_DEFERRED_SENDS) {
        set({
          error: `Only ${MAX_DEFERRED_SENDS} follow-ups can wait for the current reply. Send this one once the reply finishes.`,
          paywallError: null,
        });
        return false;
      }
      deferredSends.set(conversationId, [...waiting, { content, model, attachments, options }]);
      options?.onAccepted?.();
      return true;
    }
    cancelledBeforeStream.delete(conversationId);

    let uploadedAttachments: MessageAttachment[] | undefined;
    const msgStore = getConversationMessageStore(conversationId);
    const conversation = msgStore.getState().conversations.find((c) => c.id === conversationId);
    const cloudUnlocked = useWaitlistStore.getState().cloudUnlocked;
    const remoteDisabledReason = getRemoteChatDisabledReason(undefined, { cloudUnlocked });
    const requestedModel = model;
    const isCloudModel = isCloudManagedModelId(requestedModel);
    const isAutoSelection = isAutoModeModelId(requestedModel);
    const executionMode = conversation
      ? executionModeForConversation(conversation)
      : executionModeForModel(requestedModel);
    const provider = providerForExecutionMode(executionMode);
    const shouldUseLocalRuntime = executionMode === 'local' && isSelectableModelId(requestedModel);
    if (executionMode === 'local' && isCloudModel) {
      set({
        error: 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.',
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    if (executionMode === 'cloud' && !isCloudModel && !isAutoSelection) {
      set({
        error: 'This is an AGI Cloud chat. Start a separate Local Mode chat to use local models.',
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    const cloudAccountEpoch = executionMode === 'cloud' ? captureCloudAccountEpoch() : null;
    let artifactProvenance: MobileArtifactProvenance;
    if (executionMode === 'local') {
      artifactProvenance = { scope: 'local' };
    } else {
      if (cloudAccountEpoch === null) {
        set({
          error: 'Sign in to use AGI Cloud.',
          paywallError: null,
          ...streamingFlags(),
        });
        return false;
      }
      artifactProvenance = {
        scope: 'cloud',
        ownerId: cloudAccountEpoch.ownerId,
      };
    }
    const turnCloudExecutionGeneration = cloudExecutionGeneration;
    const isTurnAccountCurrent = () =>
      executionMode !== 'cloud' ||
      (turnCloudExecutionGeneration === cloudExecutionGeneration &&
        isCloudAccountEpochCurrent(cloudAccountEpoch));
    if (__DEV__) {
      labelMobileSession({
        id: conversationId,
        ownerUserId:
          artifactProvenance.scope === 'cloud' ? artifactProvenance.ownerId : 'local-device',
        executionMode,
      });
      mobileExecutionProfileFor(executionMode);
    }
    let executionModel = requestedModel;
    let routingReason: string | undefined;
    if (FEATURES.auth && executionMode === 'cloud') {
      const { isClerkLoaded, isClerkSignedIn } = useAuthStore.getState();
      if (isClerkLoaded && !isClerkSignedIn) {
        set({
          error: 'Sign in to use AGI Cloud.',
          paywallError: null,
          ...streamingFlags(),
        });
        return false;
      }
    }
    if (executionMode === 'cloud' && remoteDisabledReason) {
      set({
        error: remoteDisabledReason,
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    if (!shouldUseLocalRuntime && remoteDisabledReason) {
      set({
        error: remoteDisabledReason,
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    if (executionMode === 'cloud') {
      await ensureCloudEntitlementsReadyForRequest();
      if (!isTurnAccountCurrent()) return false;

      const route = resolveMobileCloudDispatch({
        selection: requestedModel,
        message: content,
        subscriptionTier: useTierStore.getState().tier,
        history: historyMessagesForConversation(conversationId, executionMode).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        attachments: attachments?.map((attachment) => ({
          mime: attachment.mimeType,
          type: attachment.mimeType.startsWith('image/') ? 'image' : 'document',
        })),
        currentModelKey:
          conversation?.model && !isAutoModeModelId(conversation.model)
            ? conversation.model
            : undefined,
      });

      if (route.status === 'unavailable') {
        set({
          error: `No AGI Cloud route is available for this request: ${route.reasons.join('; ')}`,
          paywallError: null,
          ...streamingFlags(),
        });
        return false;
      }
      if (route.dispatch !== 'chat') {
        set({
          error: 'This request requires the AGI Cloud media workflow.',
          paywallError: null,
          ...streamingFlags(),
        });
        return false;
      }
      executionModel = route.modelKey;
      routingReason = route.reason;
    }
    if (shouldUseLocalRuntime && attachments && attachments.length > 0) {
      uploadedAttachments = createLocalAttachmentReferences(attachments);
    } else if (attachments && attachments.length > 0) {
      const reusableCloudAttachments = attachments
        .filter((attachment) => Boolean(attachment.assetId))
        .map((attachment) => ({
          assetId: attachment.assetId!,
          url: attachment.uri,
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
          ...(attachment.fileSize != null ? { fileSize: attachment.fileSize } : {}),
        }));
      const attachmentsNeedingUpload = attachments.filter((attachment) => !attachment.assetId);
      uploadedAttachments =
        reusableCloudAttachments.length > 0 ? reusableCloudAttachments : undefined;

      if (attachmentsNeedingUpload.length > 0) {
        const fileNames = attachmentsNeedingUpload.map((a) => a.fileName).join(', ');
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
        if (!isTurnAccountCurrent()) return false;

        if (!userConsented) {
          set({
            error: 'File upload cancelled. Re-send without files or tap Upload & Send to confirm.',
            paywallError: null,
            ...streamingFlags(),
          });
          return false;
        }

        try {
          const uploadResults = await Promise.all(
            attachmentsNeedingUpload.map((a) =>
              uploadWithRetry({ uri: a.uri, name: a.fileName, type: a.mimeType }, a.fileName),
            ),
          );
          if (!isTurnAccountCurrent()) return false;
          const successful = uploadResults
            .map((result, i) => ({ result, attachment: attachmentsNeedingUpload[i]! }))
            .filter((x) => x.result !== null);

          if (successful.length > 0) {
            uploadedAttachments = [
              ...reusableCloudAttachments,
              ...successful.map(({ result }) => ({
                assetId: result!.id,
                url: result!.url,
                mimeType: result!.mimeType,
                fileName: result!.name,
                fileSize: result!.byteCount,
              })),
            ];
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (error.message.includes('session expired') || error.message.includes('401')) {
            set({
              error: 'Session expired. Please sign in again to upload files.',
              paywallError: null,
              ...streamingFlags(),
            });
            return false;
          }
          // For other errors, continue without newly selected attachments
          // (transient network errors already showed an Alert via
          // uploadWithRetry). Previously owned Cloud assets remain attached.
        }
      }
    }

    const newMessageId = () => (executionMode === 'cloud' ? uuidv7() : generateId());

    const userMessage: ChatMessage = {
      id: newMessageId(),
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      model: requestedModel,
      attachments: uploadedAttachments,
      ...(executionMode === 'cloud'
        ? {
            metadata: {
              requestedModel,
              resolvedModel: executionModel,
              ...(routingReason ? { routingReason } : {}),
            },
          }
        : {}),
    };

    const assistantMessageId = newMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
      model: executionMode === 'cloud' ? executionModel : requestedModel,
      ...(executionMode === 'cloud'
        ? {
            metadata: {
              requestedModel,
              resolvedModel: executionModel,
              ...(routingReason ? { routingReason } : {}),
            },
          }
        : {}),
    };

    const existingMessages = historyMessagesForConversation(conversationId, executionMode);

    const historyMessages: Array<{
      role: string;
      content:
        | string
        | Array<{
            type: string;
            text?: string;
            image_url?: { url: string };
            file?: { asset_id: string };
          }>;
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
                ...imageAttachments.map((a) =>
                  a.assetId
                    ? { type: 'file' as const, file: { asset_id: a.assetId } }
                    : { type: 'image_url' as const, image_url: { url: a.url } },
                ),
              ],
            };
          }
          return { role: m.role, content: m.content };
        }),
    ];

    const imageUploads = uploadedAttachments?.filter((a) => a.mimeType.startsWith('image/'));
    const fileUploads = uploadedAttachments?.filter((a) => !a.mimeType.startsWith('image/'));

    const remoteUploads: string[] =
      uploadedAttachments?.flatMap((a) => (a.assetId ? [a.assetId] : [])) ?? [];
    const localImageUploads = imageUploads?.filter((a) => !a.assetId) ?? [];
    const localFileUploads = fileUploads?.filter((a) => !a.assetId) ?? [];

    let messageContent = content;
    if (localFileUploads.length > 0) {
      const documentContext = await buildAttachedDocumentContext(localFileUploads);
      if (!isTurnAccountCurrent()) return false;
      messageContent = [...documentContext, content].filter(Boolean).join('\n\n');
    }

    if (shouldUseLocalRuntime && localImageUploads.length > 0) {
      const imageContext = await buildLocalImageOcrContext(localImageUploads);
      if (!isTurnAccountCurrent()) return false;
      messageContent = [messageContent, ...imageContext].filter(Boolean).join('\n\n');
    }

    if (remoteUploads.length > 0 || localImageUploads.length > 0) {
      historyMessages.push({
        role: 'user',
        content: [
          ...(messageContent ? [{ type: 'text', text: messageContent }] : []),
          ...remoteUploads.map((assetId) => ({ type: 'file', file: { asset_id: assetId } })),
          ...localImageUploads.map((a) => ({
            type: 'image_url',
            image_url: { url: a.url },
          })),
        ],
      });
    } else {
      historyMessages.push({ role: 'user', content: messageContent });
    }

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

    const chatViewState = useChatViewStore.getState();
    const viewSystemPrompt = buildChatViewSystemPrompt(
      options?.mode ?? chatViewState.chatMode,
      options?.style ?? chatViewState.chatStyle,
      options?.taskInstruction,
    );
    if (viewSystemPrompt) {
      historyMessages.unshift({ role: 'system', content: viewSystemPrompt });
    }

    const agentControl = useAgentControlStore.getState().resolve(conversationId, activeProjectId);

    const memorySettings =
      executionMode === 'cloud'
        ? useCloudSettingsStore.getState()
        : useLocalSettingsStore.getState();
    const isTemporaryChat = useSettingsStore.getState().isTemporaryChat;
    const memoryContextEnabled =
      memorySettings.memoryEnabled && memorySettings.referencePastChats && !isTemporaryChat;

    try {
      const [memFacts, pastChatContext] = memoryContextEnabled
        ? await Promise.all([
            retrieveMemoryContext(content, 5),
            retrievePastChatContext({
              executionMode,
              query: content,
              currentConversationId: conversationId,
              enabled: true,
            }),
          ])
        : [[], null];
      if (!isTurnAccountCurrent()) return false;
      const blocks = buildPersonalContextBlocks({
        personalization: memorySettings.personalization,
        memories: memFacts,
      });
      if (pastChatContext) {
        blocks.push({ role: 'system', content: pastChatContext });
      }
      for (let i = blocks.length - 1; i >= 0; i -= 1) {
        historyMessages.unshift(blocks[i]);
      }
    } catch {
      // Non-fatal: memory/personalization injection must never block a chat turn.
    }
    if (!isTurnAccountCurrent()) return false;

    const shouldCaptureCompletedLocalTurn = shouldConsolidateMemoryOnClient({
      executionMode,
      isTemporaryChat,
      memoryEnabled: memorySettings.memoryEnabled && memorySettings.referencePastChats,
      generateMemoryFromHistory: memorySettings.generateMemoryFromHistory,
    });
    let completedLocalMemoryCaptured = false;
    const captureCompletedLocalMemory = () => {
      if (!shouldCaptureCompletedLocalTurn || completedLocalMemoryCaptured) return;
      completedLocalMemoryCaptured = true;
      void consolidateFactsFromTurn({ message: content, conversationId });
    };

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
              model: c.model ?? requestedModel,
              provider: c.provider ?? provider,
              executionMode: c.executionMode ?? executionMode,
            }
          : c,
      ),
    }));

    if (executionMode === 'cloud') {
      queueCloudTurnForSync(conversationId, [userMessage]);
    }

    options?.onAccepted?.();

    if (cancelledBeforeStream.has(conversationId)) {
      cancelledBeforeStream.delete(conversationId);
      msgStore.setState((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] ?? []).filter(
            (m) => m.id !== assistantMessageId,
          ),
        },
      }));
      return true;
    }

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
    if (executionMode === 'cloud') {
      cloudStreamingConversations.add(conversationId);
    }
    lastDeltaTimes.set(conversationId, Date.now());

    set({ ...streamingFlags(), streamingContent: '', streamingReasoning: '', error: null });

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
        const localRef = await resolveLocalModelRef(requestedModel);
        let localStreamingRaw = '';
        let localTokenCount = 0;
        let localFirstTokenAt = 0;
        const updateLocalStream = (parsed: ParsedLocalThinking) => {
          if (parsed.hasReasoning && !thinkingStartTimes.has(conversationId)) {
            thinkingStartTimes.set(conversationId, Date.now());
          }

          const thinkingStartedAt = thinkingStartTimes.get(conversationId);
          const currentMsgStore = getConversationMessageStore(conversationId);
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
                    ...(thinkingStartedAt !== undefined ? { thinkingStartedAt } : {}),
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
            lastDeltaTimes.set(conversationId, Date.now());
            localTokenCount += 1;
            localStreamingRaw += token;
            updateLocalStream(parseCurrentTurnAssistantOutput(localStreamingRaw, content));
          },
        });
        if (controller.signal.aborted || result.aborted) {
          abortControllers.delete(conversationId);
          streamingConversations.delete(conversationId);
          set({ ...streamingFlags() });
          return true;
        }
        const parsedFinal = parseCurrentTurnAssistantOutput(
          result.text.trim() || localStreamingRaw.trim(),
          content,
        );
        const finalContent =
          parsedFinal.content.trim() ||
          'The local model returned an empty response. Try again with a shorter prompt.';
        const finalReasoning = parsedFinal.hasReasoning ? parsedFinal.reasoning : undefined;
        const startedAt = thinkingStartTimes.get(conversationId);
        const thinkingDuration = startedAt ? (Date.now() - startedAt) / 1000 : undefined;
        thinkingStartTimes.delete(conversationId);

        const decodeMs = localFirstTokenAt > 0 ? Date.now() - localFirstTokenAt : 0;
        const tokensPerSecond =
          decodeMs > 0 && localTokenCount > 1
            ? Math.round((localTokenCount / decodeMs) * 1000 * 10) / 10
            : undefined;

        const currentMsgStore = getConversationMessageStore(conversationId);
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

        const localConvTitle =
          currentMsgStore.getState().conversations.find((c) => c.id === conversationId)?.title ??
          '';
        captureArtifactsFromMessage(
          finalContent,
          assistantMessageId,
          conversationId,
          localConvTitle,
          new Date().toISOString(),
          artifactProvenance,
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
                  model: c.model ?? requestedModel,
                  provider: c.provider ?? provider,
                  executionMode: c.executionMode ?? executionMode,
                }
              : c,
          ),
        }));
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          error: null,
          paywallError: null,
        });

        if (parsedFinal.content.trim()) {
          captureCompletedLocalMemory();
        }
        return true;
      }

      const toolAcc = createToolCallAccumulator();
      const turnPendingApprovals: PendingApprovalCall[] = [];

      const executionModelMetadata = getModelMetadataById(executionModel);
      const entitlementState = useTierStore.getState();
      const webSearchEnabled =
        FEATURES.webSearch &&
        useChatViewStore.getState().features.webSearch &&
        isCapabilityRequestable('canUseWebSearch') &&
        isWebSearchAvailable({
          provider: executionModelMetadata?.provider,
          modelSupportsNativeSearch: executionModelMetadata?.capabilities.search,
          modelSupportsTools: executionModelMetadata?.capabilities.tools,
          genericBackendConfigured: entitlementState.genericWebSearchAvailable,
        });
      const researchEnabled =
        FEATURES.research &&
        useChatViewStore.getState().features.research &&
        executionModelMetadata?.capabilities?.research === true &&
        executionModelMetadata?.capabilities?.search === true &&
        isCapabilityRequestable('canUseDeepResearch');

      const codeExecutionEnabled =
        FEATURES.codeExecution &&
        executionModelMetadata?.capabilities?.codeExecution === true &&
        entitlementState.codeExecutionAvailable &&
        isCapabilityRequestable('canUseCloudExecution') &&
        useChatViewStore.getState().features.codeExecution;
      const officeCreationEnabled =
        FEATURES.codeExecution &&
        executionModelMetadata?.capabilities?.tools === true &&
        entitlementState.codeExecutionAvailable &&
        isCapabilityRequestable('canUseCloudExecution') &&
        useChatViewStore.getState().features.codeExecution;
      const requestedWorkMode = useChatViewStore.getState().workMode;
      const workMode = canUseBillingPlanCapability(entitlementState.tier, 'agi_work')
        ? requestedWorkMode
        : 'chat';

      let cloudContentRaw = '';
      const turnGeneratedFiles: GeneratedFileWire[] = [];
      const turnInteractiveCards: InteractiveCard[] = [];
      let turnFinishReason: string | undefined;
      let turnStreamError: { message: string; code?: string; retryable?: boolean } | undefined;
      let agentActivity: AgentActivityState | undefined;
      let cloudAgentRun: ManagedCloudAgentRunReference | undefined;
      let unacknowledgedPublicText = '';

      const thinkingEnabled =
        useModelStore.getState().thinkingEnabledPerModel[executionModel] ?? false;
      const modelReasoning = executionModelMetadata?.reasoning;
      const turnEffort = resolveTurnEffort({
        selectedEffort: agentControl.effort,
        supportedEfforts: modelReasoning?.supportedEfforts ?? [],
        reasoningControl: modelReasoning?.control,
        thinkingEnabled,
      });

      await streamChat(
        {
          model: executionModel,
          messages: historyMessages,
          stream: true,
          operationId: assistantMessageId,
          thinking: thinkingEnabled,
          ...(turnEffort ? { effort: turnEffort } : {}),
          ...(webSearchEnabled ? { web_search: true } : {}),
          ...(researchEnabled ? { research: true } : {}),
          ...(codeExecutionEnabled ? { code_execution: true } : {}),
          ...(officeCreationEnabled ? { office_creation: true } : {}),
          x_interactive_cards: { supported: ['map-search.v1'], canRespond: false },
          ...(workMode === 'agiwork' ? { work_mode: workMode } : {}),
          ...(options?.skillName ? { skill_name: options.skillName } : {}),
        },
        {
          onRunReference: (reference) => {
            if (!isTurnAccountCurrent() || controller.signal.aborted) return;
            cloudAgentRun = {
              ...reference,
              lastSequence: Math.max(
                cloudAgentRun?.lastSequence ?? -1,
                reference.lastSequence,
                agentActivity?.lastSequence ?? -1,
              ),
            };
            activeCloudRuns.set(conversationId, { ...cloudAgentRun });
            const currentMsgStore = getConversationMessageStore(conversationId);
            currentMsgStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] ?? []).map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        metadata: { ...message.metadata, cloudAgentRun: { ...cloudAgentRun } },
                      }
                    : message,
                ),
              },
            }));
          },
          onDelta: (delta: StreamDelta) => {
            if (controller.signal.aborted || !isTurnAccountCurrent()) return;

            const state = get();
            lastDeltaTimes.set(conversationId, Date.now());

            const previousParsedTags = parseCurrentTurnAssistantOutput(cloudContentRaw, content);
            let contentChunk = delta.content;
            const canonicalText =
              delta.x_agent_event?.event.type === 'text-delta'
                ? delta.x_agent_event.event.delta
                : undefined;

            if (delta.durableReplay && canonicalText !== undefined) {
              const reconciled = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                canonicalText,
              );
              unacknowledgedPublicText = reconciled.pending;
              contentChunk = reconciled.unmatchedIncoming;
            }

            if (delta.x_agent_event) {
              agentActivity = applyAgentActivityEvent(agentActivity, delta.x_agent_event);
            }

            const prevContentLength = cloudContentRaw.length;
            if (contentChunk) cloudContentRaw += contentChunk;
            const parsedTags = parseCurrentTurnAssistantOutput(cloudContentRaw, content);
            const newContent = parsedTags.content;

            if (!delta.durableReplay && contentChunk) {
              const publicDelta = newContent.startsWith(previousParsedTags.content)
                ? newContent.slice(previousParsedTags.content.length)
                : '';
              if (publicDelta) unacknowledgedPublicText += publicDelta;
            }
            if (!delta.durableReplay && canonicalText !== undefined) {
              unacknowledgedPublicText = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                canonicalText,
              ).pending;
            }

            if (parsedTags.hasReasoning && !thinkingStartTimes.has(conversationId)) {
              thinkingStartTimes.set(conversationId, Date.now());
            }
            if (
              contentChunk &&
              thinkingStartTimes.has(conversationId) &&
              !thinkingEndTimes.has(conversationId) &&
              cloudContentRaw.length > prevContentLength &&
              newContent.length > 0
            ) {
              thinkingEndTimes.set(conversationId, Date.now());
            }
            const newReasoning = parsedTags.reasoning;

            accumulateToolCallDelta(toolAcc, delta);
            const toolCalls = toolCallList(toolAcc);

            const approvalReq = delta.x_tool_approval_request;
            if (
              approvalReq?.tool_call_id &&
              !turnPendingApprovals.some((c) => c.toolCallId === approvalReq.tool_call_id)
            ) {
              turnPendingApprovals.push({
                toolCallId: approvalReq.tool_call_id,
                name: approvalReq.name,
              });
            }

            if (delta.x_generated_files) {
              turnGeneratedFiles.push(...parseGeneratedFilesDelta(delta.x_generated_files));
            }

            if (delta.x_interactive_card) {
              const card = parseInteractiveCardDelta(delta.x_interactive_card);
              if (card) {
                const existing = turnInteractiveCards.findIndex((c) => c.cardId === card.cardId);
                if (existing >= 0) turnInteractiveCards[existing] = card;
                else turnInteractiveCards.push(card);
              }
            }

            if (typeof delta.finish_reason === 'string' && delta.finish_reason) {
              turnFinishReason = delta.finish_reason;
            }
            if (!turnStreamError) {
              const rawStreamError = delta.x_stream_error as unknown;
              if (
                rawStreamError &&
                typeof rawStreamError === 'object' &&
                typeof (rawStreamError as { message?: unknown }).message === 'string' &&
                (rawStreamError as { message: string }).message
              ) {
                const r = rawStreamError as {
                  message: string;
                  code?: unknown;
                  retryable?: unknown;
                };
                turnStreamError = {
                  message: r.message,
                  ...(typeof r.code === 'string' ? { code: r.code } : {}),
                  ...(typeof r.retryable === 'boolean' ? { retryable: r.retryable } : {}),
                };
              } else if (typeof rawStreamError === 'string' && rawStreamError) {
                turnStreamError = { message: rawStreamError };
              }
            }

            const thinkingStartedAt = thinkingStartTimes.get(conversationId);
            const currentMsgStore = getConversationMessageStore(conversationId);
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: newContent,
                    reasoning: newReasoning || undefined,
                    isStreaming: true,
                    ...(toolCalls.length > 0 ? { toolCalls } : {}),
                    ...(thinkingStartedAt !== undefined || agentActivity || cloudAgentRun
                      ? {
                          metadata: {
                            ...m.metadata,
                            ...(thinkingStartedAt !== undefined ? { thinkingStartedAt } : {}),
                            ...(agentActivity ? { agentActivity } : {}),
                            ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
                          },
                        }
                      : {}),
                  }
                : m,
            );

            set({ streamingContent: newContent, streamingReasoning: newReasoning });
            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
          },

          onDone: () => {
            if (controller.signal.aborted || !isTurnAccountCurrent()) return;
            const startedAt = thinkingStartTimes.get(conversationId);
            const endedAt = thinkingEndTimes.get(conversationId) ?? Date.now();
            const thinkingDuration = startedAt
              ? Math.max(0, endedAt - startedAt) / 1000
              : undefined;
            thinkingStartTimes.delete(conversationId);
            thinkingEndTimes.delete(conversationId);

            const finalToolCalls = toolCallList(toolAcc);

            const currentMsgStore = getConversationMessageStore(conversationId);
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const finalContent = msgs.find((m) => m.id === assistantMessageId)?.content ?? '';
            if (
              !finalContent.trim() &&
              finalToolCalls.length === 0 &&
              turnGeneratedFiles.length === 0 &&
              turnInteractiveCards.length === 0 &&
              !turnStreamError
            ) {
              turnStreamError = {
                message: 'AGI Cloud returned an empty response. Try again.',
                code: 'empty_response',
                retryable: true,
              };
            }
            const completedAt = new Date().toISOString();
            const convTitle =
              currentMsgStore.getState().conversations.find((c) => c.id === conversationId)
                ?.title ?? '';
            const generatedFilesMetadata = generatedFileMetadataFromWire(turnGeneratedFiles);
            const messageArtifacts = mergeDerivedAndGeneratedFileArtifacts(
              deriveChatMessageArtifacts(
                finalContent,
                conversationId,
                assistantMessageId,
                completedAt,
              ),
              generatedFileArtifactsFromWire(turnGeneratedFiles, completedAt),
            );
            const finalCitations = citationsFromToolCalls(finalToolCalls);
            captureArtifactsFromMessage(
              finalContent,
              assistantMessageId,
              conversationId,
              convTitle,
              completedAt,
              artifactProvenance,
            );
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    isStreaming: false,
                    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
                    ...(messageArtifacts.length > 0 ? { artifacts: messageArtifacts } : {}),
                    ...(finalCitations.length > 0 ? { citations: finalCitations } : {}),
                    ...(turnInteractiveCards.length > 0
                      ? { interactiveCards: turnInteractiveCards }
                      : {}),
                    metadata: {
                      ...m.metadata,
                      ...(generatedFilesMetadata.length > 0
                        ? { generatedFiles: generatedFilesMetadata }
                        : {}),
                      ...(turnInteractiveCards.length > 0
                        ? { interactiveCards: turnInteractiveCards }
                        : {}),
                      ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
                      ...(turnFinishReason !== undefined ? { finishReason: turnFinishReason } : {}),
                      ...(turnStreamError !== undefined ? { streamError: turnStreamError } : {}),
                      ...(agentActivity ? { agentActivity } : {}),
                      ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
                    },
                  }
                : m,
            );

            const preview = finalContent.slice(0, 100);

            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);
            cloudStreamingConversations.delete(conversationId);
            activeCloudRuns.delete(conversationId);

            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      lastMessage: preview,
                      messageCount: (c.messageCount ?? 0) + 2,
                      updatedAt: new Date().toISOString(),
                      model: c.model ?? requestedModel,
                      provider: c.provider ?? provider,
                      executionMode: c.executionMode ?? executionMode,
                    }
                  : c,
              ),
            }));

            if (executionMode === 'cloud') {
              pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);

              if (turnPendingApprovals.length > 0 && cloudAgentRun?.runId) {
                pendingApprovalTurns.set(assistantMessageId, {
                  runId: cloudAgentRun.runId,
                  conversationId,
                  calls: turnPendingApprovals,
                  decisions: new Map(),
                  resolving: false,
                });
              } else {
                pendingApprovalTurns.delete(assistantMessageId);
              }
            }

            set({
              ...streamingFlags(),
              streamingContent: '',
              streamingReasoning: '',
            });

            if (turnStreamError === undefined && finalContent.trim()) {
              captureCompletedLocalMemory();
            }
          },

          onError: (error: Error) => {
            if (!isTurnAccountCurrent()) return;
            thinkingStartTimes.delete(conversationId);
            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);
            cloudStreamingConversations.delete(conversationId);
            activeCloudRuns.delete(conversationId);

            const currentMsgStore = getConversationMessageStore(conversationId);
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const currentContent = get().streamingContent;

            if (error instanceof ApiPaywallError) {
              if (agentActivity) {
                agentActivity = finishAgentActivityLocally(agentActivity, {
                  status: 'failed',
                  completedAtMs: Date.now(),
                  error: paywallActivityErrorFromApiError(error),
                });
              }
              const updatedMsgs = msgs.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: currentContent || '',
                      isStreaming: false,
                      ...(agentActivity || cloudAgentRun
                        ? {
                            metadata: {
                              ...m.metadata,
                              ...(agentActivity ? { agentActivity } : {}),
                              ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
                            },
                          }
                        : {}),
                    }
                  : m,
              );
              currentMsgStore.setState((s) => ({
                messages: { ...s.messages, [conversationId]: updatedMsgs },
              }));
              if (executionMode === 'cloud') {
                pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
              }
              set({
                ...streamingFlags(),
                streamingContent: '',
                streamingReasoning: '',
                paywallError: paywallErrorStateFromApiError(error),
              });
              return;
            }

            if (__DEV__) {
              console.warn(`[chat-stream] onError ${error?.name}: ${error?.message}`);
            }
            if (agentActivity) {
              agentActivity = finishAgentActivityLocally(agentActivity, {
                status: 'failed',
                completedAtMs: Date.now(),
                error: 'Something went wrong. Please try again.',
              });
            }
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: currentContent || 'Something went wrong. Please try again.',
                    isStreaming: false,
                    ...(agentActivity || cloudAgentRun
                      ? {
                          metadata: {
                            ...m.metadata,
                            ...(agentActivity ? { agentActivity } : {}),
                            ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
                          },
                        }
                      : {}),
                  }
                : m,
            );
            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
            if (executionMode === 'cloud') {
              pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
            }
            set({
              ...streamingFlags(),
              streamingContent: '',
              streamingReasoning: '',
              error: 'Something went wrong. Please try again.',
            });
          },
        },
        controller.signal,
      );
      return true;
    } catch (caughtErr) {
      thinkingStartTimes.delete(conversationId);
      abortControllers.delete(conversationId);
      streamingConversations.delete(conversationId);
      cloudStreamingConversations.delete(conversationId);
      activeCloudRuns.delete(conversationId);

      if (!isTurnAccountCurrent()) return true;
      if (controller.signal.aborted) {
        set({ ...streamingFlags() });
        return true;
      }

      const currentMsgStore = getConversationMessageStore(conversationId);
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
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          error: message,
          paywallError: null,
        });
        return true;
      }

      if (caughtErr instanceof ApiPaywallError) {
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? settleMessageAgentActivity(
                { ...m, content: currentContent || '', isStreaming: false },
                'failed',
                Date.now(),
                paywallActivityErrorFromApiError(caughtErr),
              )
            : m,
        );
        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        if (executionMode === 'cloud') {
          pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
        }
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          paywallError: paywallErrorStateFromApiError(caughtErr),
        });
        return true;
      }

      if (caughtErr instanceof RemoteChatDisabledError) {
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? settleMessageAgentActivity(
                { ...m, content: caughtErr.message, isStreaming: false },
                'failed',
                Date.now(),
                caughtErr.message,
              )
            : m,
        );
        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        if (executionMode === 'cloud') {
          pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
        }
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          error: caughtErr.message,
          paywallError: null,
        });
        return true;
      }

      const updatedMsgs = msgs.map((m) =>
        m.id === assistantMessageId
          ? settleMessageAgentActivity(
              {
                ...m,
                content: currentContent || 'Failed to connect. Check your network and try again.',
                isStreaming: false,
              },
              'failed',
              Date.now(),
              'Failed to connect. Check your network and try again.',
            )
          : m,
      );
      currentMsgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: updatedMsgs },
      }));
      if (executionMode === 'cloud') {
        pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
      }
      set({
        ...streamingFlags(),
        streamingContent: '',
        streamingReasoning: '',
      });
      return true;
    } finally {
      thinkingStartTimes.delete(conversationId);
      thinkingEndTimes.delete(conversationId);
      lastDeltaTimes.delete(conversationId);
      if (abortControllers.get(conversationId) === controller) {
        abortControllers.delete(conversationId);
      }
      streamingConversations.delete(conversationId);
      cloudStreamingConversations.delete(conversationId);
      if (isTurnAccountCurrent()) {
        const sweepStore = getConversationMessageStore(conversationId);
        const sweepMsgs = sweepStore.getState().messages[conversationId] ?? [];
        if (sweepMsgs.some((m) => m.id === assistantMessageId && m.isStreaming)) {
          const completedAtMs = Date.now();
          const settledMessages = sweepMsgs.map((m) =>
            m.id === assistantMessageId && m.isStreaming
              ? settleMessageAgentActivity(
                  { ...m, isStreaming: false },
                  controller.signal.aborted ? 'cancelled' : 'failed',
                  completedAtMs,
                  controller.signal.aborted ? undefined : 'Something went wrong. Please try again.',
                )
              : m,
          );
          sweepStore.setState((s) => ({
            messages: {
              ...s.messages,
              [conversationId]: settledMessages,
            },
          }));
          if (executionMode === 'cloud') {
            pushCloudAssistantUpdate(conversationId, settledMessages, assistantMessageId);
          }
        }
      }
      set({ ...streamingFlags() });
      flushDeferredSend(conversationId);
    }
  },

  resolveToolApproval: async (conversationId, assistantMessageId, toolCallId, decision) => {
    const approvalAccountEpoch = captureCloudAccountEpoch();
    if (approvalAccountEpoch === null) {
      set({
        error: 'Sign in to resume this AGI Cloud task.',
        paywallError: null,
        ...streamingFlags(),
      });
      return;
    }
    const approvalArtifactProvenance: MobileArtifactProvenance = {
      scope: 'cloud',
      ownerId: approvalAccountEpoch.ownerId,
    };
    const approvalExecutionGeneration = cloudExecutionGeneration;
    const isApprovalAccountCurrent = () =>
      approvalExecutionGeneration === cloudExecutionGeneration &&
      isCloudAccountEpochCurrent(approvalAccountEpoch);
    if (!isApprovalTurnLive(assistantMessageId)) return;
    const turn = pendingApprovalTurns.get(assistantMessageId);
    if (!turn || turn.resolving) return;
    if (turn.conversationId !== conversationId) return;
    if (!turn.calls.some((c) => c.toolCallId === toolCallId)) return;

    turn.decisions.set(toolCallId, decision);

    const msgStore = getConversationMessageStore(conversationId);
    const patchToolCall = (patch: Partial<ToolCall>) => {
      msgStore.setState((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  toolCalls: (m.toolCalls ?? []).map((t) =>
                    t.toolCallId === toolCallId ? { ...t, ...patch } : t,
                  ),
                }
              : m,
          ),
        },
      }));
      const projectedMessages = msgStore.getState().messages[conversationId] ?? [];
      pushCloudAssistantUpdate(conversationId, projectedMessages, assistantMessageId);
    };

    patchToolCall({ approvalDecision: decision, requiresApproval: true });

    if (turn.decisions.size < turn.calls.length) return;
    turn.resolving = true;

    msgStore.setState((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((t) => {
                  if (!t.toolCallId || !turn.decisions.has(t.toolCallId)) return t;
                  return turn.decisions.get(t.toolCallId) === 'approved'
                    ? { ...t, status: 'running' as const, requiresApproval: false }
                    : {
                        ...t,
                        status: 'failed' as const,
                        requiresApproval: false,
                        output: 'You denied permission to run this tool.',
                      };
                }),
              }
            : m,
        ),
      },
    }));
    pushCloudAssistantUpdate(
      conversationId,
      msgStore.getState().messages[conversationId] ?? [],
      assistantMessageId,
    );

    const existingController = abortControllers.get(conversationId);
    if (existingController) existingController.abort();
    const controller = new AbortController();
    abortControllers.set(conversationId, controller);
    streamingConversations.add(conversationId);
    cloudStreamingConversations.add(conversationId);
    lastDeltaTimes.set(conversationId, Date.now());
    set({ ...streamingFlags(), streamingContent: '', streamingReasoning: '', error: null });

    const currentMsgs = msgStore.getState().messages[conversationId] ?? [];
    const currentMessage = currentMsgs.find((m) => m.id === assistantMessageId);
    const assistantContent = currentMessage?.content ?? '';
    const seedToolCalls = currentMessage?.toolCalls
      ? currentMessage.toolCalls.map((t) => ({ ...t }))
      : [];

    const toolApprovals = turn.calls.map((c) => ({
      tool_call_id: c.toolCallId,
      decision: turn.decisions.get(c.toolCallId) ?? ('rejected' as const),
    }));

    msgStore.setState((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.id === assistantMessageId ? { ...m, isStreaming: true } : m,
        ),
      },
    }));

    const toolAcc = seedToolCallAccumulator(seedToolCalls);
    let cloudContentRaw = assistantContent;
    const priorReasoning = currentMessage?.reasoning ?? '';
    const turnGeneratedFiles: GeneratedFileWire[] = [
      ...generatedFileWireFromMetadata(currentMessage?.metadata?.generatedFiles),
    ];
    const turnInteractiveCards: InteractiveCard[] = [
      ...(currentMessage?.interactiveCards ??
        readPersistedInteractiveCards(currentMessage?.metadata)),
    ];
    const turnPendingApprovals: PendingApprovalCall[] = [];
    let turnFinishReason: string | undefined;
    let turnStreamError: { message: string; code?: string; retryable?: boolean } | undefined;
    let agentActivity = readAgentActivityState(currentMessage?.metadata?.agentActivity);

    try {
      await streamToolApprovalResume(
        {
          run_id: turn.runId,
          operationId: uuidv7(),
          tool_approvals: toolApprovals,
        },
        {
          onDelta: (delta: StreamDelta) => {
            if (controller.signal.aborted || !isApprovalAccountCurrent()) return;
            lastDeltaTimes.set(conversationId, Date.now());

            if (delta.x_agent_event) {
              agentActivity = applyAgentActivityEvent(agentActivity, delta.x_agent_event);
            }

            if (delta.content) cloudContentRaw += delta.content;
            const parsedTags = parseLocalThinking(cloudContentRaw);
            const newContent = parsedTags.content;
            const newReasoning = [priorReasoning, parsedTags.reasoning]
              .filter(Boolean)
              .join('\n\n');

            accumulateToolCallDelta(toolAcc, delta);
            const toolCalls = toolCallList(toolAcc);

            const approvalReq = delta.x_tool_approval_request;
            if (
              approvalReq?.tool_call_id &&
              !turnPendingApprovals.some((c) => c.toolCallId === approvalReq.tool_call_id)
            ) {
              turnPendingApprovals.push({
                toolCallId: approvalReq.tool_call_id,
                name: approvalReq.name,
              });
            }

            if (delta.x_generated_files) {
              turnGeneratedFiles.push(...parseGeneratedFilesDelta(delta.x_generated_files));
            }

            if (delta.x_interactive_card) {
              const card = parseInteractiveCardDelta(delta.x_interactive_card);
              if (card) {
                const existing = turnInteractiveCards.findIndex(
                  (entry) => entry.cardId === card.cardId,
                );
                if (existing >= 0) turnInteractiveCards[existing] = card;
                else turnInteractiveCards.push(card);
              }
            }

            if (typeof delta.finish_reason === 'string' && delta.finish_reason) {
              turnFinishReason = delta.finish_reason;
            }
            if (!turnStreamError) {
              const rawStreamError = delta.x_stream_error as unknown;
              if (
                rawStreamError &&
                typeof rawStreamError === 'object' &&
                typeof (rawStreamError as { message?: unknown }).message === 'string' &&
                (rawStreamError as { message: string }).message
              ) {
                const r = rawStreamError as {
                  message: string;
                  code?: unknown;
                  retryable?: unknown;
                };
                turnStreamError = {
                  message: r.message,
                  ...(typeof r.code === 'string' ? { code: r.code } : {}),
                  ...(typeof r.retryable === 'boolean' ? { retryable: r.retryable } : {}),
                };
              } else if (typeof rawStreamError === 'string' && rawStreamError) {
                turnStreamError = { message: rawStreamError };
              }
            }

            const innerMsgStore = getConversationMessageStore(conversationId);
            const msgs = innerMsgStore.getState().messages[conversationId] ?? [];
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: newContent,
                    reasoning: newReasoning || undefined,
                    isStreaming: true,
                    ...(toolCalls.length > 0 ? { toolCalls } : {}),
                    ...(agentActivity ? { metadata: { ...m.metadata, agentActivity } } : {}),
                  }
                : m,
            );
            set({ streamingContent: newContent, streamingReasoning: newReasoning });
            innerMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
          },

          onDone: () => {
            if (!isApprovalAccountCurrent()) return;
            const finalToolCalls = toolCallList(toolAcc);
            const innerMsgStore = getConversationMessageStore(conversationId);
            const msgs = innerMsgStore.getState().messages[conversationId] ?? [];
            const finalContent = msgs.find((m) => m.id === assistantMessageId)?.content ?? '';
            const completedAt = new Date().toISOString();
            const convTitle =
              innerMsgStore.getState().conversations.find((c) => c.id === conversationId)?.title ??
              '';
            const generatedFilesMetadata = generatedFileMetadataFromWire(turnGeneratedFiles);
            const messageArtifacts = mergeDerivedAndGeneratedFileArtifacts(
              deriveChatMessageArtifacts(
                finalContent,
                conversationId,
                assistantMessageId,
                completedAt,
              ),
              generatedFileArtifactsFromWire(turnGeneratedFiles, completedAt),
            );
            const finalCitations = citationsFromToolCalls(finalToolCalls);
            captureArtifactsFromMessage(
              finalContent,
              assistantMessageId,
              conversationId,
              convTitle,
              completedAt,
              approvalArtifactProvenance,
            );

            const hasTurnMetadata =
              turnFinishReason !== undefined ||
              turnStreamError !== undefined ||
              agentActivity !== undefined ||
              generatedFilesMetadata.length > 0 ||
              turnInteractiveCards.length > 0;
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    isStreaming: false,
                    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
                    ...(messageArtifacts.length > 0 ? { artifacts: messageArtifacts } : {}),
                    ...(finalCitations.length > 0 ? { citations: finalCitations } : {}),
                    ...(turnInteractiveCards.length > 0
                      ? { interactiveCards: turnInteractiveCards }
                      : {}),
                    ...(hasTurnMetadata
                      ? {
                          metadata: {
                            ...m.metadata,
                            ...(generatedFilesMetadata.length > 0
                              ? { generatedFiles: generatedFilesMetadata }
                              : {}),
                            ...(turnInteractiveCards.length > 0
                              ? { interactiveCards: turnInteractiveCards }
                              : {}),
                            ...(turnFinishReason !== undefined
                              ? { finishReason: turnFinishReason }
                              : {}),
                            ...(turnStreamError !== undefined
                              ? { streamError: turnStreamError }
                              : {}),
                            ...(agentActivity ? { agentActivity } : {}),
                          },
                        }
                      : {}),
                  }
                : m,
            );
            const preview = finalContent.slice(0, 100);

            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);
            cloudStreamingConversations.delete(conversationId);

            innerMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, lastMessage: preview, updatedAt: new Date().toISOString() }
                  : c,
              ),
            }));

            if (turnPendingApprovals.length > 0) {
              pendingApprovalTurns.set(assistantMessageId, {
                runId: turn.runId,
                conversationId,
                calls: turnPendingApprovals,
                decisions: new Map(),
                resolving: false,
              });
            } else {
              pendingApprovalTurns.delete(assistantMessageId);
            }

            pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);

            set({ ...streamingFlags(), streamingContent: '', streamingReasoning: '' });
          },

          onError: (error: Error) => {
            if (!isApprovalAccountCurrent()) return;
            turn.resolving = false;
            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);
            cloudStreamingConversations.delete(conversationId);

            if (__DEV__) {
              console.warn(
                `[chat-stream] resolveToolApproval onError ${error?.name}: ${error?.message}`,
              );
            }
            const innerMsgStore = getConversationMessageStore(conversationId);
            const msgs = innerMsgStore.getState().messages[conversationId] ?? [];
            const currentContent = get().streamingContent || cloudContentRaw;
            const checkpointIds = new Set(turn.calls.map((c) => c.toolCallId));
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: currentContent || m.content,
                    isStreaming: false,
                    toolCalls: (m.toolCalls ?? []).map((t) =>
                      t.toolCallId && checkpointIds.has(t.toolCallId)
                        ? {
                            ...t,
                            status: 'running' as const,
                            requiresApproval: true,
                            approvalDecision: undefined,
                            output: undefined,
                          }
                        : t,
                    ),
                  }
                : m,
            );
            turn.decisions.clear();
            innerMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
            pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
            set({
              ...streamingFlags(),
              streamingContent: '',
              streamingReasoning: '',
              error: 'Something went wrong. Please try again.',
            });
          },
        },
        controller.signal,
      );
    } catch (caughtErr) {
      if (__DEV__ && isApprovalAccountCurrent()) {
        console.warn('[chat-stream] resolveToolApproval unexpected throw:', caughtErr);
      }
      if (!isApprovalAccountCurrent()) return;
      turn.resolving = false;
      turn.decisions.clear();
      if (!controller.signal.aborted) {
        const innerMsgStore = getConversationMessageStore(conversationId);
        const msgs = innerMsgStore.getState().messages[conversationId] ?? [];
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: cloudContentRaw || m.content,
                isStreaming: false,
                toolCalls: (m.toolCalls ?? []).map((tool) =>
                  tool.toolCallId && turn.calls.some((call) => call.toolCallId === tool.toolCallId)
                    ? {
                        ...tool,
                        status: 'running' as const,
                        requiresApproval: true,
                        approvalDecision: undefined,
                        output: undefined,
                      }
                    : tool,
                ),
              }
            : m,
        );
        innerMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
      }
      set({ ...streamingFlags(), streamingContent: '', streamingReasoning: '' });
    } finally {
      lastDeltaTimes.delete(conversationId);
      if (abortControllers.get(conversationId) === controller) {
        abortControllers.delete(conversationId);
      }
      streamingConversations.delete(conversationId);
      cloudStreamingConversations.delete(conversationId);
      if (isApprovalAccountCurrent()) {
        const sweepStore = getConversationMessageStore(conversationId);
        const sweepMsgs = sweepStore.getState().messages[conversationId] ?? [];
        if (sweepMsgs.some((m) => m.id === assistantMessageId && m.isStreaming)) {
          const completedAtMs = Date.now();
          const settledMessages = sweepMsgs.map((m) =>
            m.id === assistantMessageId && m.isStreaming
              ? settleMessageAgentActivity(
                  { ...m, isStreaming: false },
                  controller.signal.aborted ? 'cancelled' : 'failed',
                  completedAtMs,
                  controller.signal.aborted ? undefined : 'Something went wrong. Please try again.',
                )
              : m,
          );
          sweepStore.setState((s) => ({
            messages: {
              ...s.messages,
              [conversationId]: settledMessages,
            },
          }));
          pushCloudAssistantUpdate(conversationId, settledMessages, assistantMessageId);
        }
      }
      set({ ...streamingFlags() });
      flushDeferredSend(conversationId);
    }
  },

  stopStreaming: () => {
    const currentId = getMsgStore().getState().currentConversationId;

    const targetId = currentId && streamingConversations.has(currentId) ? currentId : null;

    if (!targetId) {
      const cid = currentId;
      if (cid) {
        const activeRun = activeCloudRuns.get(cid);
        activeCloudRuns.delete(cid);
        if (activeRun) {
          void cancelMobileCloudAgentRun(activeRun.runId).catch(() => {
            set({ error: 'Could not stop the Cloud task. Check its activity before retrying.' });
          });
        }
        cancelledBeforeStream.add(cid);
        const ownerStore = getConversationMessageStore(cid);
        const msgs = ownerStore.getState().messages[cid] ?? [];
        const hasStreaming = msgs.some((m) => m.isStreaming);
        if (hasStreaming) {
          const stoppedAssistantIds = new Set(
            msgs
              .filter((message) => message.isStreaming && message.role === 'assistant')
              .map((message) => message.id),
          );
          const completedAtMs = Date.now();
          const stoppedMessages = msgs.map((m) =>
            m.isStreaming
              ? settleMessageAgentActivity({ ...m, isStreaming: false }, 'cancelled', completedAtMs)
              : m,
          );
          ownerStore.setState((s) => ({
            messages: {
              ...s.messages,
              [cid]: stoppedMessages,
            },
          }));
          const conversation = ownerStore
            .getState()
            .conversations.find((candidate) => candidate.id === cid);
          if (conversation && executionModeForConversation(conversation) === 'cloud') {
            queueCloudTurnForSync(
              cid,
              stoppedMessages.filter((message) => stoppedAssistantIds.has(message.id)),
            );
            void syncNow();
          }
        }
      }
      set({
        ...streamingFlags(),
        streamingContent: '',
        streamingReasoning: '',
      });
      return;
    }

    thinkingStartTimes.delete(targetId);
    thinkingEndTimes.delete(targetId);
    lastDeltaTimes.delete(targetId);
    const ctrl = abortControllers.get(targetId);
    const activeRun = activeCloudRuns.get(targetId);
    activeCloudRuns.delete(targetId);
    if (ctrl) {
      ctrl.abort();
      abortControllers.delete(targetId);
    }
    streamingConversations.delete(targetId);
    if (activeRun) {
      void cancelMobileCloudAgentRun(activeRun.runId).catch(() => {
        set({ error: 'Could not stop the Cloud task. Check its activity before retrying.' });
      });
    }

    const ownerStore = getConversationMessageStore(targetId);
    const msgs = ownerStore.getState().messages[targetId] ?? [];
    const stoppedAssistantIds = new Set(
      msgs
        .filter((message) => message.isStreaming && message.role === 'assistant')
        .map((message) => message.id),
    );
    const completedAtMs = Date.now();
    const stoppedMessages = msgs.map((m) =>
      m.isStreaming
        ? settleMessageAgentActivity({ ...m, isStreaming: false }, 'cancelled', completedAtMs)
        : m,
    );
    ownerStore.setState((s) => ({
      messages: {
        ...s.messages,
        [targetId]: stoppedMessages,
      },
    }));
    const conversation = ownerStore
      .getState()
      .conversations.find((candidate) => candidate.id === targetId);
    if (conversation && executionModeForConversation(conversation) === 'cloud') {
      queueCloudTurnForSync(
        targetId,
        stoppedMessages.filter((message) => stoppedAssistantIds.has(message.id)),
      );
      void syncNow();
    }

    set({
      ...streamingFlags(),
      streamingContent: '',
      streamingReasoning: '',
    });
  },

  retryMessage: (conversationId, messageId) => {
    const state = get();
    if (streamingConversations.has(conversationId)) return;

    const msgStore = getConversationMessageStore(conversationId);
    const msgs = msgStore.getState().messages[conversationId];
    if (!msgs) return;

    const msgIndex = msgs.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;

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
    const userModel = userMsg.model ?? assistantMsg?.model ?? DEFAULT_AUTO_MODE_ID;

    set((s) => ({ retryAttempts: { ...s.retryAttempts, [messageId]: nextAttempt } }));

    const removedCount = msgs.length - userIndex;
    const countedRemoved = target.role === 'assistant' ? removedCount : 0;
    const trimmedMsgs = msgs.slice(0, userIndex);
    const conversation = msgStore
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    const replaceAndRetry = async () => {
      if (conversation && executionModeForConversation(conversation) === 'cloud') {
        try {
          await deleteCloudMessagesRemote(
            conversationId,
            msgs.slice(userIndex).map((message) => message.id),
          );
        } catch {
          set({ error: 'Could not replace the Cloud response. Check your connection and retry.' });
          return;
        }
      }

      msgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: trimmedMsgs },
        conversations: s.conversations.map((candidate) =>
          candidate.id === conversationId
            ? {
                ...candidate,
                messageCount: Math.max(0, (candidate.messageCount ?? 0) - countedRemoved),
              }
            : candidate,
        ),
      }));
      await get().sendMessage(conversationId, userContent, userModel);
    };

    if (backoffMs > 0) {
      setTimeout(() => {
        void replaceAndRetry();
      }, backoffMs);
    } else {
      void replaceAndRetry();
    }
  },

  editMessage: (conversationId, messageId, newContent) => {
    const state = get();

    if (streamingConversations.has(conversationId)) {
      Alert.alert(
        'Cannot Edit',
        'Please wait for the current response to finish before editing a message.',
        [{ text: 'OK' }],
      );
      return;
    }

    if (state.isEditing) return;

    const msgStore = getConversationMessageStore(conversationId);
    const msgs = msgStore.getState().messages[conversationId];
    if (!msgs) return;

    const msgIndex = msgs.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;

    const targetMsg = msgs[msgIndex];
    if (!targetMsg || targetMsg.role !== 'user') return;

    const userModel = targetMsg.model ?? DEFAULT_AUTO_MODE_ID;

    set({ isEditing: true });

    const trimmedMsgs = msgs.slice(0, msgIndex);
    const conversation = msgStore
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    void (async () => {
      if (conversation && executionModeForConversation(conversation) === 'cloud') {
        await deleteCloudMessagesRemote(
          conversationId,
          msgs.slice(msgIndex).map((message) => message.id),
        );
      }
      msgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: trimmedMsgs },
      }));
      await get().sendMessage(conversationId, newContent, userModel);
    })()
      .catch((err) => {
        set({
          error:
            conversation && executionModeForConversation(conversation) === 'cloud'
              ? 'Could not replace the Cloud message. Check your connection and retry.'
              : err instanceof Error
                ? err.message
                : 'Failed to re-send edited message',
        });
      })
      .finally(() => {
        set({ isEditing: false });
      });
  },
}));
