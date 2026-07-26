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
  cancelMobileCloudAgentRun,
  streamChat,
  streamToolApprovalResume,
  type StreamDelta,
  type ChatWireMessage,
} from '@/services/streaming';
import {
  parseGeneratedFilesDelta,
  reconcileManagedCloudPublicText,
  resolveGeneratedFileUri,
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
import { checkContentFilter } from '@/lib/contentFilter';
import { isMinorMode } from '@/src/features/auth/services/ageGate';
import { useAuthStore } from '@/src/features/auth/store';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  markLocalModelRefUsed,
  resolveLocalModelRef,
} from '@/src/features/model-picker/localModelRuntime';
import { isCloudManagedModelId, isSelectableModelId } from '@/src/features/model-picker/service';
import { resolveMobileCloudDispatch } from '@/src/features/chat/utils/cloudDispatchRouting';
import { useModelStore } from '@/src/features/model-picker/store';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useChatViewStore, type ChatMode, type ChatStyle } from './chatViewStore';
import { retrieveMemoryContext } from '@/src/features/memory/store';
import { buildPersonalContextBlocks } from '@/src/features/memory/services/personalContext';
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
import type { GeneratedFile, GeneratedFileKind } from '@agiworkforce/types';
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
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

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
  /** Exact Managed Cloud catalog name; ignored by the Local execution path. */
  skillName?: string;
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
  /**
   * Record the user's approve/reject decision for one pending MCP/connector
   * tool call and, once every call in the suspended turn is decided, resume
   * the turn via `POST /api/llm/v1/chat/completions/approve`. No-op if
   * `assistantMessageId` has no pending turn (already resolved, or the turn
   * never suspended) or `toolCallId` isn't one of its pending calls.
   */
  resolveToolApproval: (
    conversationId: string,
    assistantMessageId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
  ) => Promise<void>;
}

const abortControllers = new Map<string, AbortController>();
const MAX_ABORT_CONTROLLERS = 50;
const streamingConversations = new Set<string>();
/** Streaming conversations whose bytes and callbacks belong to Managed Cloud. */
const cloudStreamingConversations = new Set<string>();
/** Invalidated synchronously on account teardown, including auth-disabled test/dev turns. */
let cloudExecutionGeneration = 0;
/** Server-owned Cloud run currently projected into each streaming conversation. */
const activeCloudRuns = new Map<string, ManagedCloudAgentRunReference>();

/** One tool call the server suspended for user approval (`x_tool_approval_request`). */
interface PendingApprovalCall {
  toolCallId: string;
  name: string;
}

/**
 * Client projection of a server-owned approval checkpoint. The process map is
 * only a responsive cache; `isApprovalTurnLive` can rebuild it from the Cloud
 * message's persisted run reference and approval cards after a cold start.
 */
interface PendingApprovalTurn {
  runId: string;
  conversationId: string;
  calls: PendingApprovalCall[];
  decisions: Map<string, 'approved' | 'rejected'>;
  /** Set once the resume request has been dispatched, to prevent double-submit. */
  resolving: boolean;
}

const pendingApprovalTurns = new Map<string, PendingApprovalTurn>();

/**
 * Whether a suspended turn has a valid durable checkpoint. Rehydrate the
 * process cache from persisted Cloud state when necessary; Local messages are
 * never scanned because managed approvals cannot cross that trust boundary.
 */
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

/** TEST-ONLY: clear the module-level pending-approval registry between tests. */
export function __resetPendingApprovalTurnsForTests(): void {
  pendingApprovalTurns.clear();
  activeCloudRuns.clear();
  cloudStreamingConversations.clear();
}

/**
 * Abort only Managed Cloud execution state during sign-out/account switch.
 * Local model streams are device-owned and deliberately continue untouched.
 *
 * Generation is incremented before aborting so synchronous abort callbacks
 * cannot project account-A deltas/errors back into stores that teardown is
 * clearing for account B.
 */
export function clearCloudExecutionState(): void {
  cloudExecutionGeneration += 1;
  const cloudConversationIds = Array.from(cloudStreamingConversations);
  for (const conversationId of cloudConversationIds) {
    cloudStreamingConversations.delete(conversationId);
    streamingConversations.delete(conversationId);
    activeCloudRuns.delete(conversationId);
    cancelledBeforeStream.delete(conversationId);
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

/** Reactive streaming flags derived from the module-level set — spread into
 *  every `set()` that follows a `streamingConversations` add/delete so the
 *  per-conversation `streamingConversationIds` state never drifts. */
function streamingFlags(): { isStreaming: boolean; streamingConversationIds: string[] } {
  return {
    isStreaming: streamingConversations.size > 0,
    streamingConversationIds: Array.from(streamingConversations),
  };
}

// Foreground stall recovery: local streams have no server journal, so abort a
// stale local reader when iOS resumes. Managed Cloud runs deliberately stay
// alive here: services/streaming.ts's resumed stall timer switches those runs
// to durable journal follow. Aborting their caller signal would incorrectly
// look like an explicit user Stop and strand real server work.
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

/** Queue messages already written to the Cloud repository for cross-device sync. */
function queueCloudTurnForSync(conversationId: string, messages: ChatMessage[]): void {
  markConversationForSync(conversationId);
  for (const m of messages) {
    // Only user/assistant/system rows are part of the synced transcript.
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
      markMessageForSync(conversationId, m.id);
    }
  }
}

/** Queue one finalized Cloud assistant update and request an immediate push. */
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

/** Close a durable canonical run when Mobile ends it without a server stop envelope. */
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

/**
 * Build the prior-turn history the LLM sees for a conversation (P2 cross-device).
 *
 * Cloud history comes only from the Cloud repository (including turns pulled
 * from web/desktop); Local history comes only from the Local repository.
 */
function historyMessagesForConversation(
  conversationId: string,
  executionMode: ConversationExecutionMode,
): ChatMessage[] {
  const owned =
    getConversationMessageStore(conversationId).getState().messages[conversationId] ?? [];
  return executionMode === 'cloud' ? [...owned].sort(compareCloudMessagesByCreatedAtThenId) : owned;
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
 * Map the server's x_generated_files wire descriptors (files the model
 * created in the E2B sandbox) onto generated-file artifacts so
 * InlineArtifactCard / ArtifactFullScreen / GeneratedFileCard render a
 * downloadable file card on the message.
 *
 * Wire `uri` is the RELATIVE authed route `/api/files/{id}` on the cloud
 * origin (see the generated-files cloud contract) — resolve it against
 * API_URL here so every downstream consumer (download, share, preview) holds
 * a fetchable absolute URL. Auth (Bearer) is attached at fetch time by
 * `downloadGeneratedFile` in services/fileCreation.ts.
 */
export function generatedFileArtifactsFromWire(
  files: GeneratedFileWire[],
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
      uri: resolveGeneratedFileUri(f.uri, API_URL),
      byteCount: f.byte_count,
      checksumSha256: f.checksum_sha256 ?? '',
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
    // Boundary mismatches are independent of Cloud authentication. Report the
    // actionable mode error before requiring an account epoch so a Local-model
    // send in a Cloud-owned thread cannot be misdiagnosed as merely signed out.
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
      // W5 stage-2 session labeling — additive, dev/test-only (see
      // src/features/chat/utils/sessionLabeling.ts module doc). Does not
      // change routing, persistence, or any value used below; only asserts
      // this conversation's AppSession/ExecutionProfile are internally
      // consistent and agree with the real Local/Cloud trust boundary.
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
    if (executionMode === 'cloud') {
      const route = resolveMobileCloudDispatch({
        selection: requestedModel,
        message: content,
        subscriptionTier: useTierStore.getState().tier,
        // PRIOR turns only: the current user message is not written to the
        // store until after this dispatch (first setState below), so this is
        // the same "history excludes the outgoing turn" contract the web
        // router uses. Enables the shared sticky-pivot/long-context continuity.
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
      if (!isTurnAccountCurrent()) return false;

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
        if (!isTurnAccountCurrent()) return false;
        const successful = uploadResults
          .map((result, i) => ({ result, attachment: attachments[i]! }))
          .filter((x) => x.result !== null);

        if (successful.length > 0) {
          // STB-4: keep the server-confirmed asset id, mime type, and name —
          // the completion route is authoritative for all three.
          uploadedAttachments = successful.map(({ result }) => ({
            assetId: result!.id,
            url: result!.url,
            mimeType: result!.mimeType,
            fileName: result!.name,
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

    // P2: for cloud chats, history merges in turns pulled from other devices so a
    // conversation started on web/desktop continues seamlessly here.
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

    // STB-4: an attachment with an `assetId` lives in managed-cloud storage and is
    // hydrated server-side from that id (see the completions route's
    // chat-attachment hydration). Only attachments still sitting on this device
    // — Local mode, or an upload that did not complete — carry a readable
    // `file://` url and need on-device extraction / OCR. Mixing the two would
    // hand the on-device parser an `/api/files/{id}` path it cannot read and
    // produce a "content could not be extracted" stub for a document the server
    // can read perfectly well.
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
      if (!isTurnAccountCurrent()) return false;
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
    if (!isTurnAccountCurrent()) return false;

    // Learn from this turn (LOCAL mode only): extract durable facts from the user's
    // message and persist new ones (deduped) into the on-device SQLite memory.
    // Fire-and-forget — never await, never block the turn — and skip temporary chats.
    //
    // Cloud mode intentionally does NOT consolidate here. The managed server owns
    // cloud auto-memory: `recordManagedAutoMemoryTurn` persists the same conservative
    // user-authored facts, but only AFTER a completed turn (outcome === 'completed'),
    // exactly like web. Consolidating on the client for cloud mode would duplicate the
    // server's write and — worse — learn from this send BEFORE the turn succeeds.
    if (
      shouldConsolidateMemoryOnClient({
        executionMode,
        isTemporaryChat: useSettingsStore.getState().isTemporaryChat,
      })
    ) {
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
              model: c.model ?? requestedModel,
              provider: c.provider ?? provider,
              executionMode: c.executionMode ?? executionMode,
            }
          : c,
      ),
    }));

    // Cloud write-through: persist+queue the user message now so an aborted or failed
    // turn still syncs it (the assistant reply is mirrored on stream completion).
    if (executionMode === 'cloud') {
      queueCloudTurnForSync(conversationId, [userMessage]);
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
    if (executionMode === 'cloud') {
      cloudStreamingConversations.add(conversationId);
    }
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
        const localRef = await resolveLocalModelRef(requestedModel);
        let localStreamingRaw = '';
        // Measure on-device decode rate (tokens/sec) from first token to done.
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
        return true;
      }

      // Per-turn agentic tool-call accumulator. The server streams tool steps
      // (web_search / code execution / MCP) as SSE deltas; we fold them into the
      // assistant message's toolCalls so ToolCallTimeline renders them live.
      const toolAcc = createToolCallAccumulator();
      // MCP/connector tool calls this turn suspended on for user approval
      // (x_tool_approval_request). Registered into `pendingApprovalTurns` in
      // onDone so `resolveToolApproval` can rebuild the resume request.
      const turnPendingApprovals: PendingApprovalCall[] = [];

      // Ambient web search: there is no per-turn toggle in the composer.
      // Automatically offer search when the selected Cloud model or the
      // configured generic backend can execute it; capability metadata still
      // clamps the request so unsupported models never receive a cosmetic flag.
      // The server streams results back as x_search_results deltas, which the
      // tool-call accumulator already renders.
      const executionModelMetadata = getModelMetadataById(executionModel);
      const entitlementState = useTierStore.getState();
      const webSearchEnabled =
        FEATURES.webSearch &&
        entitlementState.grantedCapabilities.includes('canUseWebSearch') &&
        isWebSearchAvailable({
          provider: executionModelMetadata?.provider,
          modelSupportsNativeSearch: executionModelMetadata?.capabilities.search,
          modelSupportsTools: executionModelMetadata?.capabilities.tools,
          genericBackendConfigured: entitlementState.genericWebSearchAvailable,
        });

      // Deep Research: multi-turn cited synthesis. Re-verified per-send (not just
      // at the AddToChatSheet UI) so the toggle is never cosmetic — the SELECTED
      // model must declare BOTH the `research` capability AND native `search`
      // (the server's research loop requires web search: request-processor gates
      // researchMode on `search`, and the model must be a real deep-research
      // model), and the account must be PAID (the server rejects research for
      // free-trial requests). Free UI + wire request stay aligned; the server
      // still enforces the entitlement.
      const researchEnabled =
        FEATURES.research &&
        useChatViewStore.getState().features.research &&
        executionModelMetadata?.capabilities?.research === true &&
        executionModelMetadata?.capabilities?.search === true &&
        entitlementState.grantedCapabilities.includes('canUseDeepResearch');

      // Per-turn code execution: mirrors webSearchEnabled above, with two extra
      // honesty checks so the toggle is never cosmetic — re-verified here (not
      // just at the AddToChatSheet UI layer) in case the user switched models
      // after enabling it: the SELECTED MODEL must actually support server-side
      // code execution (models.json capabilities.codeExecution), and THIS
      // DEPLOYMENT must have the E2B execution loop reachable
      // (`/api/me` feature_flags.code_execution, cached in useTierStore).
      const codeExecutionEnabled =
        FEATURES.codeExecution &&
        executionModelMetadata?.capabilities?.codeExecution === true &&
        entitlementState.codeExecutionAvailable &&
        entitlementState.grantedCapabilities.includes('canUseCloudExecution') &&
        useChatViewStore.getState().features.codeExecution;
      const requestedWorkMode = useChatViewStore.getState().workMode;
      // The server is authoritative, but do not replay a persisted paid mode
      // after a cached subscription downgrade. This keeps the Free UI and wire
      // request aligned while the server still enforces the entitlement.
      const workMode = canUseBillingPlanCapability(entitlementState.tier, 'agi_work')
        ? requestedWorkMode
        : 'chat';

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
      const turnGeneratedFiles: GeneratedFileWire[] = [];
      // Structured delta.reasoning is a separate, genuinely incremental channel
      // (e.g. a provider's dedicated reasoning field) from the tag-embedded
      // thinking parsed out of cloudContentRaw below. Tracked separately because
      // parseLocalThinking re-parses the FULL raw buffer on every delta (it has
      // to, to handle a tag straddling two chunks) — accumulating its output
      // onto itself across deltas would duplicate the reasoning text.
      let cloudStructuredReasoning = '';
      // How this turn ended (OpenAI-wire finish_reason, last one seen) and
      // whether the provider failed mid-stream (additive `x_stream_error` —
      // finish_reason alone can't reliably say 'error', see
      // packages/ui/unified-chat's hasStreamError doc comment). Previously
      // parsed off the wire in services/streaming.ts but never read here at
      // all — a mid-stream provider failure rendered as a clean completion
      // with zero indication, worse than web/desktop (which at least
      // persisted finishReason even before this fix). `code`/`retryable`
      // ride along when the provider adapter supplied them.
      let turnFinishReason: string | undefined;
      let turnStreamError: { message: string; code?: string; retryable?: boolean } | undefined;
      let agentActivity: AgentActivityState | undefined;
      let cloudAgentRun: ManagedCloudAgentRunReference | undefined;
      // Ordinary SSE answer text can arrive immediately before its canonical
      // text event. Retain it until the journal acknowledges the same public
      // text so reconnect replay never duplicates an already-visible prefix.
      let unacknowledgedPublicText = '';

      // Honor the user's per-model Thinking toggle — the same state that drives
      // the Brain badge on ModelSelectorButton. Hardcoding `thinking: true`
      // here made that toggle a dead control (thinking ran on every cloud turn
      // regardless of choice) and broke free-trial sends on non-thinking
      // models, which the server rejects when thinking/effort is requested
      // without the capability. Effort rides along only when thinking is on.
      const thinkingEnabled =
        useModelStore.getState().thinkingEnabledPerModel[executionModel] ?? false;
      // Reasoning effort (fixes the silently-dropped-effort bug). The picker offers
      // effort rungs from the SELECTED model's `reasoning.supportedEfforts`, so:
      //  - only send an effort the CURRENT model actually supports (the per-turn
      //    value may have been chosen for a previously-selected model);
      //  - for `effort_levels` models effort IS the native reasoning control, so it
      //    is sent regardless of the Thinking toggle (which defaults off); for
      //    toggle-based models effort still rides with thinking, as before;
      //  - `none`/`minimal` are forwarded when supported (the server accepts any
      //    effort string and validates it per model) instead of being dropped.
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
            // Regression: a chunk already in flight when the user taps Stop would
            // still land here and unconditionally set isStreaming:true below,
            // clobbering the false stopStreaming() had just set. Because an abort
            // never fires onDone, nothing ever flipped it back — the Stop button
            // and composer got stuck permanently in the "still generating" state.
            // Every other delta-handling callback in this file already guards on
            // this; this one didn't.
            if (controller.signal.aborted || !isTurnAccountCurrent()) return;

            const state = get();
            lastDeltaTimes.set(conversationId, Date.now());

            const previousParsedTags = parseLocalThinking(cloudContentRaw);
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
            const parsedTags = parseLocalThinking(cloudContentRaw);
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
              contentChunk &&
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

            // Manual-approval suspend: record the pending call's AUTHORITATIVE
            // args from the validated event itself (not the accumulator's
            // stringified `input`, whose provenance may be raw streamed
            // fragments) so the resume request rebuilds `function.arguments`
            // exactly as the server sent it.
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
              // Validate against the shared cloud contract; malformed
              // descriptors are dropped per-file instead of trusted blindly.
              turnGeneratedFiles.push(...parseGeneratedFilesDelta(delta.x_generated_files));
            }

            // Keep the LAST finish_reason seen (server tool loops emit
            // intermediate 'tool_calls' before the final reason) — mirrors
            // web/desktop's "keep the last reason" handling.
            if (typeof delta.finish_reason === 'string' && delta.finish_reason) {
              turnFinishReason = delta.finish_reason;
            }
            // Sticky: keep the FIRST error payload seen, it identifies the
            // actual failure (unlike finish_reason, which legitimately
            // changes as the turn progresses). Accepts a bare string
            // defensively too, though the wire only ever sends the object.
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
                    // Live thinking-timer anchor: ThinkingChip ticks elapsed
                    // seconds from this while reasoning streams.
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
            if (!isTurnAccountCurrent()) return;
            const startedAt = thinkingStartTimes.get(conversationId);
            const endedAt = thinkingEndTimes.get(conversationId) ?? Date.now();
            const thinkingDuration = startedAt
              ? Math.max(0, endedAt - startedAt) / 1000
              : undefined;
            thinkingStartTimes.delete(conversationId);
            thinkingEndTimes.delete(conversationId);

            // Finalize accumulated tool calls directly on the owning repository.
            const finalToolCalls = toolCallList(toolAcc);

            const currentMsgStore = getConversationMessageStore(conversationId);
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
                    metadata: {
                      ...m.metadata,
                      ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
                      ...(turnFinishReason !== undefined ? { finishReason: turnFinishReason } : {}),
                      // Mid-stream provider failure: the turn otherwise looks
                      // like a clean completion (server still sends a normal
                      // stream end) — this is the only persisted signal that
                      // tells MessageBubble to show the incomplete-response
                      // notice + retry affordance instead.
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

            // Cloud write-through: mirror the finalized assistant reply into the cloud
            // store, queue it, and push immediately (don't wait for the sync interval).
            if (executionMode === 'cloud') {
              pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);

              // Manual-approval suspend: register only the durable server-owned
              // run handle plus the projected cards. The server checkpoint owns
              // the trusted transcript, arguments, policy and continuation cursor.
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
                  error: 'Usage limit reached. Upgrade to continue.',
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
                'Usage limit reached. Upgrade to continue.',
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

    // Persist each local choice while a multi-call checkpoint waits for all
    // decisions. Keep the approval gate visible until the complete decision
    // set can be submitted atomically.
    patchToolCall({ approvalDecision: decision, requiresApproval: true });

    // Wait until every pending call in this turn is decided before resuming —
    // a multi-tool suspend needs one resume request carrying every decision.
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

    // Seed from the message's existing tool cards (the just-decided ones) so
    // the continuation's deltas EXTEND the same timeline instead of a fresh
    // accumulator dropping them.
    const toolAcc = seedToolCallAccumulator(seedToolCalls);
    let cloudContentRaw = assistantContent;
    // Seed from any reasoning the model already produced before the tool call
    // (thinking is force-disabled server-side for the resume itself, but the
    // ORIGINAL pre-suspend stream may have streamed real reasoning text) — an
    // empty seed would overwrite it with `undefined` the instant the first
    // resume delta lands, since every onDelta below replaces `reasoning`
    // wholesale rather than appending.
    let cloudStructuredReasoning = currentMessage?.reasoning ?? '';
    const turnGeneratedFiles: GeneratedFileWire[] = [];
    const turnPendingApprovals: PendingApprovalCall[] = [];
    // See the sendMessage onDelta/onDone pair above for why these are
    // captured and persisted (finish_reason previously parsed off the wire
    // but never read; x_stream_error is the additive mid-stream-failure
    // marker finish_reason alone can't reliably carry).
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
            if (delta.reasoning) cloudStructuredReasoning += delta.reasoning;
            const newReasoning = [cloudStructuredReasoning, parsedTags.reasoning]
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
            const messageArtifacts = [
              ...deriveChatMessageArtifacts(
                finalContent,
                conversationId,
                assistantMessageId,
                completedAt,
              ),
              ...generatedFileArtifactsFromWire(turnGeneratedFiles, completedAt),
            ];
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
              agentActivity !== undefined;
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    isStreaming: false,
                    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
                    ...(messageArtifacts.length > 0 ? { artifacts: messageArtifacts } : {}),
                    ...(finalCitations.length > 0 ? { citations: finalCitations } : {}),
                    ...(hasTurnMetadata
                      ? {
                          metadata: {
                            ...m.metadata,
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
              // messageCount is deliberately NOT incremented here: the initial
              // suspend's onDone already counted the user+assistant pair. This
              // resume continuation extends the SAME assistant message — it
              // creates no new transcript rows.
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, lastMessage: preview, updatedAt: new Date().toISOString() }
                  : c,
              ),
            }));

            if (turnPendingApprovals.length > 0) {
              // The same server-owned run advanced to a new approval
              // checkpoint. Keep only its handle plus the newly projected cards;
              // genuine tool output stays private and authoritative on-server.
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
      // Defensive fallback only: streamToolApprovalResume never rethrows (it
      // routes every failure through onError above), so this branch is not
      // expected to run in practice — kept for structural parity with
      // sendMessage's stuck-composer guarantee.
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
    }
  },

  stopStreaming: () => {
    const currentId = getMsgStore().getState().currentConversationId;

    // #16: only the CURRENT conversation may be stopped. Do NOT fall back to an
    // arbitrary streaming conversation — the global isStreaming flag can surface
    // the Stop button while the user views a non-streaming screen, and aborting a
    // random background stream is wrong.
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
        // Mark as cancelled so a sendMessage coroutine that hasn't added to
        // streamingConversations yet (still awaiting pre-stream async ops) will
        // bail out when it reaches the isStreaming=true set point.
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
    // Scope to THIS conversation — a background stream elsewhere must not
    // block retrying here.
    if (streamingConversations.has(conversationId)) return;

    const msgStore = getConversationMessageStore(conversationId);
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
    const userModel = userMsg.model ?? assistantMsg?.model ?? 'auto';

    set((s) => ({ retryAttempts: { ...s.retryAttempts, [messageId]: nextAttempt } }));

    const removedCount = msgs.length - userIndex;
    // #23: only the finalize/success path increments messageCount (+2). An
    // assistant-targeted regenerate replaces a counted exchange (subtract the
    // removed messages); a banner retry of a FAILED send was never counted
    // (subtract 0). sendMessage re-adds +2 on success, keeping the count accurate.
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

    // Scope to THIS conversation — a background stream in another chat must not
    // block editing here (mirrors retryMessage; the global isStreaming check
    // wrongly blocked edits in an idle conversation whenever any chat streamed).
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

    const userModel = targetMsg.model ?? 'auto';

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
