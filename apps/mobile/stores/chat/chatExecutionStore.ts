import { Alert, AppState } from 'react-native';
import { create } from 'zustand';
import { TIMEOUTS } from '@/lib/constants';
import { agiNativeColors } from '@agiworkforce/design-tokens';
import { QueueFullError } from '@agiworkforce/runtime';
import { localGenerate } from '@agiworkforce/local-llm';
import { getMobileSendQueue } from '@/lib/sendQueue';
import { api, ApiPaywallError } from '@/services/api';
import { streamChat, type StreamDelta, type StreamGeneratedFile } from '@/services/streaming';
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
import { useModelStore } from '@/src/features/model-picker/store';
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
import type { ChatMessage, MessageAttachment, ConversationSummary, ToolCall } from '@/types/chat';
import type { GeneratedFile, GeneratedFileKind } from '@agiworkforce/types';
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
  /**
   * Fired the moment the user message is accepted (committed to the
   * transcript, all pre-flight gates passed). The composer clears its draft on
   * this signal — never optimistically on tap — so a send blocked by a
   * pre-flight gate (auth, egress, upload consent, content filter) keeps the
   * user's text intact.
   */
  onAccepted?: () => void;
}

interface ExecutionState {
  isStreaming: boolean;
  /**
   * Conversation ids with a live stream — the reactive mirror of the
   * module-level `streamingConversations` set. Screens must key their
   * composer streaming state off THIS (scoped to their conversation), not the
   * global `isStreaming`, or switching conversations mid-stream shows a stop
   * button for a conversation that isn't streaming.
   */
  streamingConversationIds: string[];
  streamingContent: string;
  streamingReasoning: string;
  error: string | null;
  paywallError: PaywallErrorState | null;
  retryAttempts: Record<string, number>;
  isEditing: boolean;

  /** Resolves true once the message was accepted into the transcript, false when a pre-flight gate blocked it. */
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
  /** Surface a send failure in the SendErrorBanner — for callers whose own
   *  catch would otherwise swallow the error with no UI. */
  setSendError: (message: string) => void;
  clearPaywallError: () => void;
  setPaywallError: (paywallError: PaywallErrorState) => void;
}

const abortControllers = new Map<string, AbortController>();
const MAX_ABORT_CONTROLLERS = 50;
const streamingConversations = new Set<string>();

/** Reactive streaming flags derived from the module-level set — spread into
 *  every `set()` that follows a `streamingConversations` add/delete so the
 *  per-conversation `streamingConversationIds` state never drifts. */
function streamingFlags(): { isStreaming: boolean; streamingConversationIds: string[] } {
  return {
    isStreaming: streamingConversations.size > 0,
    streamingConversationIds: Array.from(streamingConversations),
  };
}

// Foreground stall recovery: iOS suspends the app shortly after backgrounding
// and can tear down the stream socket without ever rejecting the pending
// read(). The rolling stall watchdog in services/streaming.ts fires eventually
// once JS resumes; this listener makes recovery immediate on foreground —
// any "streaming" conversation whose last delta predates the stall window is
// aborted, which routes through sendMessage's finally cleanup and returns the
// composer to its resting state instead of spinning forever.
AppState.addEventListener('change', (nextState) => {
  if (nextState !== 'active') return;
  const now = Date.now();
  for (const cid of Array.from(streamingConversations)) {
    const last = lastDeltaTimes.get(cid) ?? 0;
    if (now - last > TIMEOUTS.STREAM_STALL) {
      abortControllers.get(cid)?.abort();
    }
  }
});
/** Tracks conversation IDs that were cancelled before streaming started. */
const cancelledBeforeStream = new Set<string>();
const MAX_RETRY_ATTEMPTS = 3;
const thinkingStartTimes = new Map<string, number>();
/** First moment display content grew AFTER reasoning started — "Thought for Xs"
 *  measures the thinking phase only, not the whole answer stream. */
const thinkingEndTimes = new Map<string, number>();
/** Last wall-clock time a delta arrived per streaming conversation — the
 *  foreground stall check below uses it to abort streams iOS silently killed
 *  while the app was suspended. */
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
/**
 * Derive chat-message artifacts (the shapes InlineArtifactCard renders) from a
 * completed assistant response. Non-mobile-renderable types (html, mermaid,
 * react…) map to 'code' — mobile deliberately shows raw source, never executes
 * model output. Non-blocking: failures return [] so chat flow never breaks.
 */
function deriveChatMessageArtifacts(
  content: string,
  conversationId: string,
  messageId: string,
  createdAt: string,
): NonNullable<ChatMessage['artifacts']> {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { deriveArtifacts } =
      require('@agiworkforce/services') as typeof import('@agiworkforce/services');
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

const GENERATED_FILE_KINDS: ReadonlySet<string> = new Set([
  'pdf',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'json',
  'markdown',
  'html',
  'image',
  'archive',
  'other',
]);

/**
 * Map the server's x_generated_files wire descriptors (durable media URLs for
 * files the model created in the E2B sandbox) onto generated-file artifacts so
 * InlineArtifactCard / ArtifactFullScreen / GeneratedFileCard render a
 * downloadable file card on the message.
 */
export function generatedFileArtifactsFromWire(
  files: StreamGeneratedFile[],
  createdAt: string,
): NonNullable<ChatMessage['artifacts']> {
  return files.map((f) => {
    const kind: GeneratedFileKind = GENERATED_FILE_KINDS.has(f.kind)
      ? (f.kind as GeneratedFileKind)
      : 'other';
    const generatedFile: GeneratedFile = {
      id: f.id,
      // Sandbox sessions are server-internal; the card's presentation layer
      // treats these as absent and falls back to file-level labels.
      computeSessionId: '',
      ownerUserId: '',
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind,
      fileName: f.file_name,
      mimeType: f.mime_type,
      uri: f.uri,
      byteCount: f.byte_count,
      checksumSha256: '',
      previewDerivatives: [],
      createdAt,
    };
    return {
      id: f.id,
      type: kind === 'image' ? ('image' as const) : ('document' as const),
      title: f.file_name,
      content: '',
      generatedFile,
    };
  });
}

/**
 * Derive inline answer citations from the turn's accumulated web-search tool
 * results, so CitationChip / CollapsibleSources render sources on the prose
 * (ChatGPT-style) instead of only inside the collapsed tool timeline.
 */
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
    // #2: enforce minor-safe content filtering before the prompt reaches ANY LLM
    // (local or cloud). The age-gate promises minors "age-appropriate content
    // filtering"; this is the only enforcement point and was previously dead code.
    if (isMinorMode()) {
      const verdict = checkContentFilter(content, true);
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
        ...streamingFlags(),
      });
      return false;
    }
    if (executionMode === 'cloud' && !isCloudModel) {
      set({
        error: 'This is an AGI Cloud chat. Start a separate Local Mode chat to use local models.',
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
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
          ...streamingFlags(),
        });
        return false;
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
            ...streamingFlags(),
          });
          return false;
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

    // The user message is now committed to the transcript — every pre-flight
    // gate passed. Signal the composer so it clears its draft NOW (not on tap,
    // not at stream end).
    options?.onAccepted?.();

    // Guard: if stopStreaming was called before we reached this point, bail out.
    // Remove the just-inserted empty assistant placeholder — it was committed
    // above with isStreaming:true and stopStreaming's message sweep ran BEFORE
    // it existed, so leaving it would strand a spinner bubble forever.
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
    // Seed the delta clock at stream start so the foreground stall check never
    // aborts a stream that simply hasn't produced its first token yet.
    lastDeltaTimes.set(conversationId, Date.now());

    // Clear any stale error from a previous turn/conversation/mode — `error` is
    // a single shared field, not scoped per-conversation, so without this a
    // banner like "Local Mode is active, but no on-device model is ready yet"
    // survives a New Chat + mode switch and shows on top of a message that just
    // streamed successfully in Cloud mode.
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
        const localRef = await resolveLocalModelRef(model);
        let localStreamingRaw = '';
        // Measure on-device decode rate (tokens/sec) from first token to done.
        let localTokenCount = 0;
        let localFirstTokenAt = 0;
        const updateLocalStream = (parsed: ParsedLocalThinking) => {
          if (parsed.hasReasoning && !thinkingStartTimes.has(conversationId)) {
            thinkingStartTimes.set(conversationId, Date.now());
          }

          const thinkingStartedAt = thinkingStartTimes.get(conversationId);
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
                    // Live thinking-timer anchor: ThinkingChip ticks elapsed
                    // seconds from this while the reply streams.
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
            updateLocalStream(parseLocalThinking(localStreamingRaw));
          },
        });
        if (controller.signal.aborted) {
          abortControllers.delete(conversationId);
          streamingConversations.delete(conversationId);
          set({ ...streamingFlags() });
          return true;
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
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          error: null,
          paywallError: null,
        });
        return true;
      }

      // Per-turn agentic tool-call accumulator. The server streams tool steps
      // (web_search / code execution / MCP) as SSE deltas; we fold them into the
      // assistant message's toolCalls so ToolCallTimeline renders them live.
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
      // Files the model generated in the E2B sandbox this turn — the server
      // emits one x_generated_files delta (durable media URLs) before [DONE];
      // onDone maps them to generated-file artifacts so GeneratedFileCard /
      // InlineArtifactCard render a downloadable file card.
      const turnGeneratedFiles: StreamGeneratedFile[] = [];
      // Structured delta.reasoning is a separate, genuinely incremental channel
      // (e.g. a provider's dedicated reasoning field) from the tag-embedded
      // thinking parsed out of cloudContentRaw below. Tracked separately because
      // parseLocalThinking re-parses the FULL raw buffer on every delta (it has
      // to, to handle a tag straddling two chunks) — accumulating its output
      // onto itself across deltas would duplicate the reasoning text.
      let cloudStructuredReasoning = '';

      // Honor the user's per-model Thinking toggle — the same state that drives
      // the Brain badge on ModelSelectorButton. Hardcoding `thinking: true`
      // here made that toggle a dead control (thinking ran on every cloud turn
      // regardless of choice) and broke free-trial sends on non-thinking
      // models, which the server rejects when thinking/effort is requested
      // without the capability. Effort rides along only when thinking is on.
      const thinkingEnabled = useModelStore.getState().thinkingEnabledPerModel[model] ?? false;

      await streamChat(
        {
          model,
          messages: historyMessages,
          stream: true,
          thinking: thinkingEnabled,
          ...(thinkingEnabled ? { effort: agentControl.effort } : {}),
          ...(webSearchEnabled ? { web_search: true } : {}),
        },
        {
          onDelta: (delta: StreamDelta) => {
            // Regression: a chunk already in flight when the user taps Stop would
            // still land here and unconditionally set isStreaming:true below,
            // clobbering the false stopStreaming() had just set. Because an abort
            // never fires onDone, nothing ever flipped it back — the Stop button
            // and composer got stuck permanently in the "still generating" state.
            // Every other delta-handling callback in this file already guards on
            // this; this one didn't.
            if (controller.signal.aborted) return;

            const state = get();
            lastDeltaTimes.set(conversationId, Date.now());

            const prevContentLength = cloudContentRaw.length;
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
            // "Thought for Xs" measures the THINKING phase: mark its end the
            // first time answer content grows after reasoning began. Without
            // this the duration ran to end-of-stream, over-counting a 3s think
            // + 30s answer as "Thought for 33s".
            if (
              delta.content &&
              !delta.reasoning &&
              thinkingStartTimes.has(conversationId) &&
              !thinkingEndTimes.has(conversationId) &&
              cloudContentRaw.length > prevContentLength &&
              newContent.length > 0
            ) {
              thinkingEndTimes.set(conversationId, Date.now());
            }
            const newReasoning = [cloudStructuredReasoning, parsedTags.reasoning]
              .filter(Boolean)
              .join('\n\n');

            accumulateToolCallDelta(toolAcc, delta);
            const toolCalls = toolCallList(toolAcc);

            if (delta.x_generated_files?.files?.length) {
              turnGeneratedFiles.push(...delta.x_generated_files.files);
            }

            const thinkingStartedAt = thinkingStartTimes.get(conversationId);
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
                    // Live thinking-timer anchor: ThinkingChip ticks elapsed
                    // seconds from this while reasoning streams.
                    ...(thinkingStartedAt !== undefined
                      ? { metadata: { ...m.metadata, thinkingStartedAt } }
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
            const startedAt = thinkingStartTimes.get(conversationId);
            const endedAt = thinkingEndTimes.get(conversationId) ?? Date.now();
            const thinkingDuration = startedAt
              ? Math.max(0, endedAt - startedAt) / 1000
              : undefined;
            thinkingStartTimes.delete(conversationId);
            thinkingEndTimes.delete(conversationId);

            // Finalize the accumulated tool calls onto the message. mirrorCloudTurn
            // (below) reads this same finalized message, so the tool steps ride
            // along into the cloud write-through and survive reload.
            const finalToolCalls = toolCallList(toolAcc);

            const currentMsgStore = getMsgStore();
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            // Read the finalized content from THIS turn's message, not the
            // global streamingContent — under concurrent streams the global
            // buffer holds whichever conversation last emitted a delta.
            const finalContent = msgs.find((m) => m.id === assistantMessageId)?.content ?? '';
            const completedAt = new Date().toISOString();
            const convTitle =
              currentMsgStore.getState().conversations.find((c) => c.id === conversationId)
                ?.title ?? '';
            // Attach fenced-code artifacts to the message so InlineArtifactCard
            // renders in cloud chat (was local-only), and feed the gallery.
            const messageArtifacts = [
              ...deriveChatMessageArtifacts(
                finalContent,
                conversationId,
                assistantMessageId,
                completedAt,
              ),
              // E2B sandbox files (durable download URLs from x_generated_files).
              ...generatedFileArtifactsFromWire(turnGeneratedFiles, completedAt),
            ];
            // Inline answer citations from this turn's web-search results.
            const finalCitations = citationsFromToolCalls(finalToolCalls);
            captureArtifactsFromMessage(
              finalContent,
              assistantMessageId,
              conversationId,
              convTitle,
              completedAt,
            );
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    isStreaming: false,
                    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
                    ...(messageArtifacts.length > 0 ? { artifacts: messageArtifacts } : {}),
                    ...(finalCitations.length > 0 ? { citations: finalCitations } : {}),
                    metadata: {
                      ...m.metadata,
                      ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
                    },
                  }
                : m,
            );

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
              ...streamingFlags(),
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
                ...streamingFlags(),
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
              ...streamingFlags(),
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
      return true;
    } catch (caughtErr) {
      thinkingStartTimes.delete(conversationId);
      abortControllers.delete(conversationId);
      streamingConversations.delete(conversationId);

      if (controller.signal.aborted) {
        set({ ...streamingFlags() });
        return true;
      }

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
            ? { ...m, content: currentContent || '', isStreaming: false }
            : m,
        );
        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          paywallError: {
            feature: caughtErr.feature,
            requiredTier: caughtErr.requiredTier,
            reason: caughtErr.reason,
          },
        });
        return true;
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
        ...streamingFlags(),
        streamingContent: '',
        streamingReasoning: '',
      });
      return true;
    } finally {
      // Structural guarantee against the stuck-composer bug class (Claude's
      // own iOS app ships this bug): no matter which path the turn took —
      // clean done, error, abort, or a stream that ended without ever firing
      // onDone/onError — this turn's bookkeeping is released, the assistant
      // bubble stops spinning, and the send button returns to rest. All
      // operations here are idempotent re-runs of what the happy paths do.
      thinkingStartTimes.delete(conversationId);
      thinkingEndTimes.delete(conversationId);
      lastDeltaTimes.delete(conversationId);
      if (abortControllers.get(conversationId) === controller) {
        abortControllers.delete(conversationId);
      }
      streamingConversations.delete(conversationId);
      const sweepStore = getMsgStore();
      const sweepMsgs = sweepStore.getState().messages[conversationId] ?? [];
      if (sweepMsgs.some((m) => m.id === assistantMessageId && m.isStreaming)) {
        sweepStore.setState((s) => ({
          messages: {
            ...s.messages,
            [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
              m.id === assistantMessageId && m.isStreaming ? { ...m, isStreaming: false } : m,
            ),
          },
        }));
      }
      set({ ...streamingFlags() });
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
      ...streamingFlags(),
      streamingContent: '',
      streamingReasoning: '',
    });
  },

  retryMessage: (conversationId, messageId) => {
    const state = get();
    // Scope to THIS conversation — a background stream elsewhere must not
    // block retrying here.
    if (streamingConversations.has(conversationId)) return;

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
