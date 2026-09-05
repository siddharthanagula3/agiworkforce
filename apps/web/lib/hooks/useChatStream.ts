'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useEffect,
  type MutableRefObject,
} from 'react';
import {
  INTERACTIVE_CARD_DELTA_KEY,
  INTERACTIVE_CARD_REQUEST_KEY,
  INTERACTIVE_CARDS_MAX_PER_MESSAGE,
  type InteractiveCard,
  type InteractiveCardClientCapability,
  type InteractiveCardResponsePayload,
  type KnownInteractiveCardKind,
} from '@agiworkforce/types';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
import {
  useChatStore,
  selectIsActiveConversationStreaming,
  parkUnsentDraft,
  type Message,
  type Attachment,
  type MessageMetadata,
  type MessageResearchState,
  type MessageToolEntry,
} from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { logger } from '@shared/lib/logger';
import {
  getModelMetadataById,
  getModelReasoning,
  resolveModelEffort,
  WEB_SEARCH_CITATION_DELTA_KEY,
  WEB_SEARCH_CITATION_KIND,
  type CloudWorkMode,
  type Effort,
  type WebSearchCitationDeltaWire,
} from '@agiworkforce/types';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  createManagedCloudChatClient,
  createManagedCloudAgentRunClient,
  ManagedCloudChatHttpError,
  parseAgentEventDelta,
  parseGeneratedFilesDelta,
  reconcileManagedCloudPublicText,
  readPersistedCloudToolApproval,
  readManagedCloudAgentRunHandle,
  CloudToolApprovalProjectionSchema,
  TOOL_APPROVAL_RESUME_PATH,
  type ManagedCloudAgentRunHandle,
  type ManagedCloudAgentRunReference,
  type ManagedCloudSaveMessageOptions,
} from '@agiworkforce/cloud-contracts';
import {
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  startAgentActivityLocally,
  withoutGenerationProgress,
  type AgentActivityState,
  type AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import {
  INTERACTIVE_CARD_RESPONSE_PATH,
  RESPONDABLE_INTERACTIVE_CARD_KIND,
  interactiveCardNeedsResume,
  type InteractiveCardResponseRequest,
} from '@/app/api/interactive-cards/response-contract';
import { addCsrfHeaders, getCsrfToken } from '@/lib/client/csrf';
import { FALLBACK_REASON_HEADER } from '@/lib/chat-fallback-reason';
import { SECRET_REDACTION_COUNT_HEADER } from '@/lib/chat-secret-redaction-notice';
import { getBrowserTimeZone } from '@/lib/client/browser-timezone';
import { createFrameCoalescedAppender } from '@/lib/client/frame-coalesced-appender';
import { isFreeTrialErrorCode, useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import type {
  AgentEvent,
  AgentEventEnvelope,
  AgentEventToolCategory,
  AgentTaskState,
  ResearchStep,
} from '@agiworkforce/types';
import { parseResearchPlanEvent } from '@/features/chat/utils/research-plan';
import { deriveAgentActivityLabel, extractToolActivityArgument } from './agentActivityLabel';
import {
  linearTail,
  resolveVisibleThread,
  stampLinearParents,
} from '@/features/chat/lib/messageThread';
import { parseAgiWorkPlanEvent, type AgiWorkGoalInput } from '@/features/chat/utils/agiwork-plan';
import {
  resolveQuotaPaywallSlot,
  type ServerQuotaRecovery,
} from '@/features/chat/lib/quotaPaywallSlot';
import { readRetryAt } from '@/features/chat/lib/freeCapacityRecovery';
import { ROUTE_LANE_HEADER, readRouteLane } from '@/features/chat/lib/routeLane';
import { useBillingStore } from '@shared/stores/web-auth-store';
import {
  createSendReplayMetadata,
  hasWebSearchSources,
  type SearchResult,
} from '@/features/chat/types/message-metadata';
import {
  CONTINUE_GENERATION_INSTRUCTION,
  isMessageContinuable,
} from '@/features/chat/lib/continue-generation';
import {
  collapseDuplicateAgentActivityErrors,
  humanizeAgentEventEnvelope,
  isTerminalAgentEventEnvelope,
} from '@/features/chat/lib/agent-activity-notice';
import {
  hasCanonicalToolActivity,
  normalizeCitationUrl,
  repairContinuationSeam,
  SEAM_INSPECTION_WINDOW,
} from '@agiworkforce/unified-chat';
import { parseQualifiedMcpToolName } from '@/features/connectors/lib/mcp-tool-name';
import { useToolPermissionsStore } from '@/features/connectors/stores/tool-permissions-store';
import { networkErrorMessage, toUserMessage } from '@/lib/user-error-message';
import {
  buildApiMessageContent,
  durableAttachmentDescriptors,
} from '@/features/chat/lib/persisted-attachments';
import type { McpContextSelection } from '@/features/connectors/lib/mcp-context-selection';

interface SendMessageOptions {
  model?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  temperature?: number;
  maxTokens?: number;
  attachments?: Attachment[];
  conversationId?: string;
  webSearch?: boolean;
  webFetch?: boolean;
  codeExecution?: boolean;
  officeCreation?: boolean;
  thinkingEnabled?: boolean;
  thinkingEffort?: Effort;
  styleMode?: string;
  styleInstruction?: string;
  skillName?: string;
  mcpContext?: McpContextSelection;
  /** Connector ids switched off for this conversation; their tools are not offered to the model. */
  disabledConnectorIds?: string[];
  /** Per-chat Memory override. False skips injecting and writing account memories for this turn. */
  memoryEnabled?: boolean;
  research?: boolean;
  researchResume?: {
    sources: Array<{ url: string; title?: string; snippet?: string }>;
    steps: ResearchStep[];
    /** The plan the user pressed Start on after the server paused for approval. */
    approvedSteps?: ResearchStep[];
  };
  workMode?: CloudWorkMode;
  agiWorkGoal?: AgiWorkGoalInput;
  onTurnCommitted?: () => void;
  /**
   * Edit-as-sibling: the parent the REVISED user message hangs from, which is
   * the edited message's own parent. The two become variants of the same turn
   * and the original keeps the tail it already produced.
   */
  userMessageParentId?: string | null;
  /**
   * Regenerate-as-sibling: the user message to answer again. No user message is
   * created or persisted, the new answer hangs straight off this one, beside
   * the answer that is already there.
   */
  regenerateParentMessageId?: string;
  /**
   * The caller painted this turn under a client-generated placeholder id
   * because the real conversation did not exist yet (the fresh-chat send
   * path). Resolves to the server id once the create call lands, or null if
   * it never does; `sendMessage` renames the placeholder to that id before
   * touching the network.
   */
  ensureConversationId?: () => Promise<string | null>;
}

const CLIENT_MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveClientMessageId(value: string | undefined): string {
  return value && CLIENT_MESSAGE_ID_PATTERN.test(value) ? value : crypto.randomUUID();
}

const STYLE_SYSTEM_INSTRUCTIONS: Record<string, string> = {
  concise: 'Be concise. Give short, direct answers without unnecessary detail.',
  formal: 'Use formal, professional language. Be precise and structured.',
  explanatory: 'Be thorough and educational. Explain concepts in detail with examples.',
};

export type ToolApprovalDecision = 'approved' | 'rejected';

export interface UseChatStreamReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<boolean>;
  stopGeneration: (conversationId?: string) => void;
  continueGeneration: (assistantMessageId: string) => Promise<void>;
  resumeInteractiveCardTurn: (
    assistantMessageId: string,
    options?: { force?: boolean },
  ) => Promise<void>;
  resolveToolApproval: (
    assistantMessageId: string,
    toolCallId: string,
    decision: ToolApprovalDecision,
    guidance?: string,
  ) => Promise<void>;
  isStreaming: boolean;
}

const NO_RECOVERY_OPTIONS: readonly ServerQuotaRecovery[] = Object.freeze([]);

class ChatApiError extends Error {
  code: string | undefined;
  status: number | undefined;
  resetAt: string | undefined;
  retryAt: string | undefined;
  recovery: readonly ServerQuotaRecovery[];

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      resetAt?: string;
      retryAt?: string;
      recovery?: readonly ServerQuotaRecovery[];
    } = {},
  ) {
    super(message);
    this.name = 'ChatApiError';
    this.code = options.code;
    this.status = options.status;
    this.resetAt = options.resetAt;
    this.retryAt = options.retryAt;
    this.recovery = options.recovery ?? NO_RECOVERY_OPTIONS;
  }
}

function readErrorResetAt(payload: unknown, response: Response): string | undefined {
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    const error = body['error'];
    const candidate =
      error && typeof error === 'object'
        ? (error as Record<string, unknown>)['reset_at']
        : body['reset_at'];
    if (typeof candidate === 'string' && !Number.isNaN(Date.parse(candidate))) {
      return new Date(candidate).toISOString();
    }
  }
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readServerQuotaRecoveryOption(value: unknown): ServerQuotaRecovery | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const action = readString((value as Record<string, unknown>)['action']);
  const href = readString((value as Record<string, unknown>)['href']);
  return action && href ? { action, href } : undefined;
}

/**
 * Both shapes the wire uses. A managed quota refusal names one way out and sends
 * an object; the free lane offers several and sends an array. Reading only the
 * object left every free-lane recovery on the floor, so the client keeps one
 * list and lets the resolvers decide which entries they can render.
 */
function readServerQuotaRecoveries(value: unknown): readonly ServerQuotaRecovery[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const option = readServerQuotaRecoveryOption(entry);
      return option ? [option] : [];
    });
  }
  const option = readServerQuotaRecoveryOption(value);
  return option ? [option] : NO_RECOVERY_OPTIONS;
}

/**
 * True only for an expired or missing session. A 403 is a permission answer and
 * a 429 is a quota answer, neither means "sign in and try that again", so
 * neither should repopulate the composer.
 */
function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof ChatApiError) return error.status === 401;
  return false;
}

function readChatApiErrorPayload(
  payload: unknown,
  fallbackMessage: string,
): {
  message: string;
  code?: string;
  recovery?: readonly ServerQuotaRecovery[];
  retryAt?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { message: fallbackMessage };
  }

  const body = payload as Record<string, unknown>;
  const topLevelMessage = readString(body['message']);
  const topLevelCode = readString(body['code']);
  const error = body['error'];

  if (typeof error === 'string') {
    return { message: readString(error) ?? fallbackMessage, code: topLevelCode };
  }

  if (error && typeof error === 'object') {
    const errorBody = error as Record<string, unknown>;
    const nestedMessage = readString(errorBody['message']);
    const nestedCode = readString(errorBody['code']);
    const recovery = readServerQuotaRecoveries(errorBody['recovery']);
    const retryAt = readRetryAt(errorBody['retry_at']);
    return {
      message: nestedMessage ?? topLevelMessage ?? fallbackMessage,
      code: nestedCode ?? topLevelCode,
      ...(recovery.length > 0 ? { recovery } : {}),
      ...(retryAt ? { retryAt } : {}),
    };
  }

  return { message: topLevelMessage ?? fallbackMessage, code: topLevelCode };
}

function getVisibleErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) {
    return networkErrorMessage(error) ?? error.trim();
  }
  return toUserMessage(error, 'An unknown error occurred');
}

function buildAssistantErrorContent(message: string): string {
  return `Error: ${message}\n\nTry again, or start a new chat if this response is stuck.`;
}

const EMPTY_ASSISTANT_CONTENT_PLACEHOLDER = String.fromCharCode(0x200b);

type AuthTokenProvider = () => Promise<string>;

type SaveRetryOptions = ManagedCloudSaveMessageOptions;

async function saveMessageToDb(
  conversationId: string,
  message: {
    id?: string;
    role: string;
    content: string;
    model?: string;
    metadata?: MessageMetadata;
    /**
     * Names the row this message branches from; null asks for the root sibling
     * group. Omitted, the server chains it onto whatever the conversation's
     * active leaf is, which is the right answer for a normal turn and the wrong
     * one for a variant, so every sibling write states its parent explicitly.
     */
    parentId?: string | null;
  },
  getAuthToken: AuthTokenProvider,
  options: SaveRetryOptions = {},
): Promise<{ id: string }> {
  const client = createManagedCloudChatClient({
    getAuthToken,
    decorateMutationHeaders: addCsrfHeaders,
    fetchImpl: (input, init) => fetch(input, init),
  });
  try {
    const saved = await client.saveMessage(
      conversationId,
      {
        id:
          message.id && CLIENT_MESSAGE_ID_PATTERN.test(message.id)
            ? message.id
            : crypto.randomUUID(),
        role: message.role as 'user' | 'assistant' | 'system',
        content: message.content,
        model: message.model,
        metadata: message.metadata ? { ...message.metadata } : undefined,
        // Null is a value the route reads, not an omission: it is the only way
        // to say "root sibling" rather than "continue from the leaf".
        ...(message.parentId === undefined ? {} : { parentId: message.parentId }),
      },
      options,
    );
    return { id: saved.id };
  } catch (error) {
    if (error instanceof ManagedCloudChatHttpError) {
      if (error.status === 429) {
        console.warn('[useChatStream] Message persistence rate-limited (429); turn not saved');
      }
      throw new Error(`Failed to save message to DB: ${error.status}`);
    }
    throw error;
  }
}

function notifyPersistenceFailure(kind: 'user' | 'assistant', error: unknown): void {
  console.error(`[useChatStream] Failed to save ${kind} message:`, error);
  toast.error(
    kind === 'assistant'
      ? "Couldn't save this response, it may not appear after you reload."
      : "Couldn't save your message, it may not appear after you reload.",
    { duration: 6000 },
  );
}

export { saveMessageToDb, notifyPersistenceFailure, EMPTY_ASSISTANT_CONTENT_PLACEHOLDER };

/** Every row this conversation has loaded, variants included. */
function readConversationRows(conversationId: string): Message[] {
  const state = useChatStore.getState();
  const bucket = state.messagesByConversation[conversationId];
  if (bucket) return bucket;
  return state.activeConversationId === conversationId ? state.messages : [];
}

function readActiveLeaf(conversationId: string): string | null {
  return useChatStore.getState().activeLeafByConversation[conversationId] ?? null;
}

/**
 * Whether this conversation is a tree yet. A conversation that has never
 * branched must keep naming no parents at all: that is what routes its writes
 * down the server's single-statement fast path and keeps a chat nobody has
 * regenerated byte-identical to what it was before variants existed.
 */
function isThreadedConversation(conversationId: string): boolean {
  if (readActiveLeaf(conversationId) !== null) return true;
  return readConversationRows(conversationId).some((message) => message.parentId);
}

/**
 * The parent a user message states, in the three-way distinction the write
 * routes share (see `resolveParentId` in the messages route's message-thread
 * lib): a uuid names the branch point, null asks for the root sibling group.
 * which is what an edit of the opening turn is, and absent means this caller
 * has nothing to say about the tree, so a threaded conversation continues from
 * its leaf exactly as the server would.
 */
function resolveUserMessageParentId(
  conversationId: string,
  explicitParentId: string | null | undefined,
): string | null | undefined {
  if (explicitParentId !== undefined) return explicitParentId;
  if (!isThreadedConversation(conversationId)) return undefined;
  return (
    readActiveLeaf(conversationId) ?? linearTail(readConversationRows(conversationId)) ?? undefined
  );
}

/**
 * Whether regenerating under `parentMessageId` would actually produce a second
 * answer, or merely the first one.
 *
 * The error banner's Retry comes through the same flow, and there the question
 * has no answer yet: converting that conversation to a tree would buy a row lock
 * on every subsequent write and a `parent_id` on every row, for a sibling group
 * of one. Stamping in memory is what lets the linear case be asked the same
 * question as the threaded one.
 */
function regenerateCreatesSibling(conversationId: string, parentMessageId: string): boolean {
  const rows = readConversationRows(conversationId);
  const stamped = isThreadedConversation(conversationId) ? rows : stampLinearParents(rows);
  return stamped.some((row) => row.parentId === parentMessageId);
}

/** An answer always hangs off the question it answers, once there is a tree. */
function resolveAssistantParentId(
  conversationId: string,
  userMessageId: string,
): string | undefined {
  return isThreadedConversation(conversationId) ? userMessageId : undefined;
}

/**
 * The conversation as the reader sees it, and the ONLY thing an LLM request is
 * ever built from. Both context-assembly sites, the send path and the continue
 * path, go through here, so an abandoned variant cannot reach a prompt without
 * first becoming visible in the transcript.
 *
 * A conversation with no leaf resolves to its bucket by identity, so a chat that
 * has never branched assembles exactly the array it always did.
 */
function readConversationMessages(conversationId: string): Message[] {
  const state = useChatStore.getState();
  return resolveVisibleThread(
    readConversationRows(conversationId),
    state.activeLeafByConversation[conversationId] ?? null,
  );
}

function findConversationMessage(conversationId: string, messageId: string): Message | undefined {
  return readConversationMessages(conversationId).find((message) => message.id === messageId);
}

type MessageContent = ReturnType<typeof buildApiMessageContent>;
type ApiMessage = {
  role: string;
  content: MessageContent;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

interface PendingApprovalCall {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

interface PendingTurn {
  runId: string;
  model: string;
  conversationId: string;
  isTemporaryConversation: boolean;
  calls: PendingApprovalCall[];
  decisions: Map<string, ToolApprovalDecision>;
  resolving: boolean;
  guidance?: string;
}

const pendingTurns = new Map<string, PendingTurn>();

export function __resetPendingTurnsForTests(): void {
  pendingTurns.clear();
}

export function isApprovalTurnLive(assistantMessageId: string): boolean {
  return pendingTurns.has(assistantMessageId) || restorePendingTurn(assistantMessageId) !== null;
}

function restorePendingTurn(assistantMessageId: string): PendingTurn | null {
  const store = useChatStore.getState();
  const message = store.messages.find((candidate) => candidate.id === assistantMessageId);
  const conversationId = store.activeConversationId;
  const persisted = readPersistedCloudToolApproval(message?.metadata);
  if (message && conversationId && persisted) {
    const turn: PendingTurn = {
      runId: persisted.runReference.runId,
      model: message.model ?? message.metadata?.model ?? 'auto',
      conversationId,
      isTemporaryConversation:
        store.conversations.find((conversation) => conversation.id === conversationId)
          ?.isTemporary ?? false,
      calls: persisted.projection.calls.map((call) => ({
        toolCallId: call.toolCallId,
        name: call.name,
        args: parseApprovalInput(call.input),
      })),
      decisions: new Map(
        persisted.projection.calls.flatMap((call) =>
          call.approvalDecision ? [[call.toolCallId, call.approvalDecision] as const] : [],
        ),
      ),
      resolving: false,
    };
    pendingTurns.set(assistantMessageId, turn);
    return turn;
  }

  const runId = message?.metadata?.cloudAgentRun?.runId;
  const approvalTools = (message?.metadata?.tools ?? []).filter(
    (tool) => tool.requiresApproval === true && typeof tool.toolCallId === 'string',
  );
  if (!message || !runId || !conversationId || approvalTools.length === 0) return null;

  const turn: PendingTurn = {
    runId,
    model: message.model ?? message.metadata?.model ?? 'auto',
    conversationId,
    isTemporaryConversation:
      store.conversations.find((conversation) => conversation.id === conversationId)?.isTemporary ??
      false,
    calls: approvalTools.map((tool) => ({
      toolCallId: tool.toolCallId!,
      name: tool.name,
      args: tool.parameters ?? tool.rawArgs ?? {},
    })),
    decisions: new Map(
      approvalTools.flatMap((tool) =>
        typeof tool.approved === 'boolean'
          ? [[tool.toolCallId!, tool.approved ? 'approved' : 'rejected'] as const]
          : [],
      ),
    ),
    resolving: false,
  };
  pendingTurns.set(assistantMessageId, turn);
  return turn;
}

function parseApprovalInput(input: string | undefined): Record<string, unknown> {
  if (!input) return {};
  try {
    const parsed: unknown = JSON.parse(input);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { value: input };
  }
}

function stringifyApprovalInput(input: Record<string, unknown> | undefined): string | undefined {
  if (!input || Object.keys(input).length === 0) return undefined;
  try {
    const serialized = JSON.stringify(input);
    return serialized.length <= 100_000 ? serialized : undefined;
  } catch {
    return undefined;
  }
}

const SOURCE_TRACKING_PARAM_PATTERN = /^(utm_[a-z_]+|fbclid|gclid|msclkid|ref|mc_[ce]id)$/i;

function normalizeSourceUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    }
    for (const key of Array.from(new Set(parsed.searchParams.keys()))) {
      if (SOURCE_TRACKING_PARAM_PATTERN.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function dedupeNewSearchResults(
  existing: readonly SearchResult[],
  incoming: readonly SearchResult[],
): SearchResult[] {
  const seen = new Set(existing.map((result) => normalizeSourceUrlKey(result.url)));
  return incoming.filter((source) => {
    const key = normalizeSourceUrlKey(source.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function projectPendingTurn(turn: PendingTurn) {
  return CloudToolApprovalProjectionSchema.parse({
    schemaVersion: 1,
    runId: turn.runId,
    calls: turn.calls.map((call) => {
      const input = stringifyApprovalInput(call.args);
      const approvalDecision = turn.decisions.get(call.toolCallId);
      return {
        toolCallId: call.toolCallId,
        name: call.name,
        ...(input ? { input } : {}),
        ...(approvalDecision ? { approvalDecision } : {}),
      };
    }),
  });
}

type ResolveToolApprovalFn = UseChatStreamReturn['resolveToolApproval'];
const ToolApprovalContext = createContext<ResolveToolApprovalFn | null>(null);
export const ToolApprovalProvider = ToolApprovalContext.Provider;
export function useToolApprovalResolver(): ResolveToolApprovalFn | null {
  return useContext(ToolApprovalContext);
}

type ResumeInteractiveCardTurnFn = UseChatStreamReturn['resumeInteractiveCardTurn'];
const InteractiveCardResumeContext = createContext<ResumeInteractiveCardTurnFn | null>(null);
export const InteractiveCardResumeProvider = InteractiveCardResumeContext.Provider;
export function useInteractiveCardResume(): ResumeInteractiveCardTurnFn | null {
  return useContext(InteractiveCardResumeContext);
}

export interface InteractiveCardResponseBinding {
  conversationId: string;
  messageId: string;
  cardId: string;
}

export const WEB_INTERACTIVE_CARD_KINDS = [
  'clarify.v1',
  'map-search.v1',
  'mcp-app.v1',
  'places.v1',
] as const satisfies readonly KnownInteractiveCardKind[];

export type WebInteractiveCardKind = (typeof WEB_INTERACTIVE_CARD_KINDS)[number];

const WEB_INTERACTIVE_CARD_CAPABILITY: InteractiveCardClientCapability = {
  supported: [...WEB_INTERACTIVE_CARD_KINDS],
  canRespond: WEB_INTERACTIVE_CARD_KINDS.includes(RESPONDABLE_INTERACTIVE_CARD_KIND),
};

const INTERACTIVE_CARD_RESPONSE_FAILURE_MESSAGE =
  "Couldn't send that answer, the questions are still waiting for you.";

const CLARIFY_ANSWERED_PREAMBLE = 'The user answered the clarifying questions:';
const CLARIFY_DISMISSED_PREAMBLE = 'The user declined the clarifying questions and said instead:';
const CLARIFY_DISMISSED_SILENTLY = 'The user declined the clarifying questions without answering.';

/**
 * The client default is one poll per second, 60 requests a minute against a
 * per-minute limiter, which leaves no headroom for a second surface following
 * the same run and buys nothing: the journal is written in coalesced batches,
 * so a faster poll returns the same rows more often.
 */
const DURABLE_RUN_POLL_INTERVAL_MS = 2_500;

export const REASONING_ACTIVITY_FALLBACK_THRESHOLD_MS = 1_500;

function describeSettledInteractiveCard(card: InteractiveCard): string | null {
  if (!card.recognized || card.kind !== RESPONDABLE_INTERACTIVE_CARD_KIND) return null;
  const { questions, state } = card.body;

  if (state.status === 'dismissed') {
    return state.freeText
      ? `${CLARIFY_DISMISSED_PREAMBLE} ${state.freeText}`
      : CLARIFY_DISMISSED_SILENTLY;
  }
  if (state.status !== 'answered') return null;

  const lines = state.answers.flatMap((answer) => {
    const question = questions.find((candidate) => candidate.id === answer.questionId);
    if (!question || answer.kind === 'skipped') return [];
    const value = answer.kind === 'other' ? answer.text : answer.labels.join(', ');
    return value.length > 0 ? [`- ${question.question} ${value}`] : [];
  });

  return lines.length > 0 ? [CLARIFY_ANSWERED_PREAMBLE, ...lines].join('\n') : null;
}

function settledInteractiveCardTurn(message: Message): ApiMessage | null {
  const settled = (message.metadata?.interactiveCards ?? [])
    .map(describeSettledInteractiveCard)
    .filter((entry): entry is string => entry !== null);
  return settled.length > 0 ? { role: 'user', content: settled.join('\n\n') } : null;
}

function hasResumableInteractiveCard(message: Message | undefined): boolean {
  if (!message || message.role !== 'assistant' || message.isStreaming) return false;
  return (message.metadata?.interactiveCards ?? []).some(interactiveCardNeedsResume);
}

const inFlightCardResponses = new Set<string>();

function patchInteractiveCardSubmissionError(
  binding: InteractiveCardResponseBinding,
  errorMessage: string | undefined,
): void {
  const message = findConversationMessage(binding.conversationId, binding.messageId);
  const errors = { ...message?.metadata?.interactiveCardSubmissionErrors };
  if (errorMessage) {
    errors[binding.cardId] = errorMessage;
  } else if (!(binding.cardId in errors)) {
    return;
  } else {
    delete errors[binding.cardId];
  }
  useChatStore.getState().updateMessage(
    binding.messageId,
    {
      metadata: {
        ...message?.metadata,
        interactiveCardSubmissionErrors: Object.keys(errors).length > 0 ? errors : undefined,
      },
    },
    binding.conversationId,
  );
}

export async function respondToInteractiveCard(
  binding: InteractiveCardResponseBinding,
  payload: InteractiveCardResponsePayload,
): Promise<void> {
  const inFlightKey = `${binding.conversationId}:${binding.messageId}:${binding.cardId}`;
  if (inFlightCardResponses.has(inFlightKey)) return;
  inFlightCardResponses.add(inFlightKey);
  patchInteractiveCardSubmissionError(binding, undefined);
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch(INTERACTIVE_CARD_RESPONSE_PATH, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversation_id: binding.conversationId,
        message_id: binding.messageId,
        card_id: binding.cardId,
        response: payload,
      } satisfies InteractiveCardResponseRequest),
    });
    if (!response.ok) {
      throw new Error(`Interactive card response rejected with ${response.status}`);
    }
    const settled = parseInteractiveCardDelta(await response.json());
    if (!settled?.recognized) {
      throw new Error('Interactive card response returned a card that failed validation');
    }
    const message = findConversationMessage(binding.conversationId, binding.messageId);
    useChatStore.getState().updateMessage(
      binding.messageId,
      {
        metadata: {
          ...message?.metadata,
          interactiveCards: (message?.metadata?.interactiveCards ?? []).map((card) =>
            card.cardId === settled.cardId ? settled : card,
          ),
        },
      },
      binding.conversationId,
    );
  } catch (error) {
    logger.error('[useChatStream] Interactive card response failed', error);
    toast.error(INTERACTIVE_CARD_RESPONSE_FAILURE_MESSAGE);
    patchInteractiveCardSubmissionError(binding, INTERACTIVE_CARD_RESPONSE_FAILURE_MESSAGE);
  } finally {
    inFlightCardResponses.delete(inFlightKey);
  }
}

function autoResolvePendingApprovals(
  assistantMessageId: string,
  calls: PendingApprovalCall[],
  resolve: ResolveToolApprovalFn,
): void {
  const permissions = useToolPermissionsStore.getState();
  for (const call of calls) {
    const parsed = parseQualifiedMcpToolName(call.name);
    if (!parsed) continue;
    const level = permissions.getToolPermission(parsed.serverId, parsed.toolName);
    if (level === 'allow') {
      void resolve(assistantMessageId, call.toolCallId, 'approved');
    } else if (level === 'deny') {
      void resolve(assistantMessageId, call.toolCallId, 'rejected');
    }
  }
}

interface StreamOutcome {
  suspended: boolean;
  pendingCalls: PendingApprovalCall[];
  runHandle: ManagedCloudAgentRunHandle | null;
}

interface ConsumeStreamContext {
  response: Response;
  assistantMessageId: string;
  model: string;
  conversationId: string;
  isTemporaryConversation: boolean;
  getAuthToken: AuthTokenProvider;
  seedContent?: string;
  seedTools?: MessageToolEntry[];
  /**
   * The row this answer branches from, on a conversation that has variants. The
   * turn is only durable once the stream ends, so this has to travel with the
   * stream: without it the server would chain the answer onto whatever the leaf
   * had become, which after a second regenerate is a different variant.
   */
  assistantParentId?: string;
  onRunHandle?: (handle: ManagedCloudAgentRunHandle | null) => void;
}

const EMPTY_RESPONSE_STREAM_ERROR_CODE = 'empty_response';
const BLOCKED_STREAM_ERROR_CODES: ReadonlySet<string> = new Set([
  'content_blocked',
  'content_filter',
]);
const MAX_TOKENS_FINISH_REASONS: ReadonlySet<string> = new Set(['length', 'max_tokens']);

/**
 * A finished assistant turn that produced nothing: no text, no tool call, no
 * error. Mirrors the render-time "no visible output" check in MessageBubble
 * (`producedNoVisibleOutput`) -- the card that turn falls through to if the
 * retry this drives also comes back empty -- so both use the same definition
 * of empty and the retry never fires on a turn the UI wouldn't otherwise flag.
 */
function isEmptyAssistantTurn(
  message: Message | undefined | null,
  requestedModel: string,
): boolean {
  if (!message || message.role !== 'assistant') return false;
  if (message.isStreaming || message.error) return false;
  const content = message.content.replace(/[\u200B\uFEFF]/g, '').trim();
  if (content.length > 0) return false;
  if ((message.attachments?.length ?? 0) > 0) return false;
  const meta = message.metadata;
  if (!meta) return true;
  const streamErrorCode = meta.streamError?.code;
  if (streamErrorCode && BLOCKED_STREAM_ERROR_CODES.has(streamErrorCode)) return false;
  if (meta.finishReason && MAX_TOKENS_FINISH_REASONS.has(meta.finishReason)) {
    if (message.model !== requestedModel) return false;
  } else if (meta.streamError && streamErrorCode !== EMPTY_RESPONSE_STREAM_ERROR_CODE) {
    return false;
  }
  if (
    !meta.streamError &&
    (meta.agentActivity?.status === 'failed' || meta.agentActivity?.status === 'partial')
  ) {
    return false;
  }
  if ((meta.tools?.length ?? 0) > 0) return false;
  if (hasCanonicalToolActivity(meta.agentActivity)) return false;
  return !(
    meta.imageUrl ||
    meta.videoUrl ||
    meta.videoStatus ||
    meta.documentData ||
    meta.generatedFile ||
    meta.artifactManifest ||
    meta.computeSession ||
    meta.codeExecutionResult ||
    meta.isExecutingCode ||
    (meta.interactiveCards?.length ?? 0) > 0 ||
    meta.paywall
  );
}

/**
 * Resets the assistant placeholder for one silent retry of an empty turn
 * (see isEmptyAssistantTurn). The activity label reads "Retrying", never the
 * normal starting summary -- a turn that quietly failed once and is being
 * resent gets a truthful state, not a fresh-looking progress indicator.
 */
function beginEmptyTurnRetry(
  conversationId: string,
  assistantMessageId: string,
  currentMetadata: MessageMetadata | undefined,
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string) => void,
): void {
  updateMessage(
    assistantMessageId,
    {
      content: '',
      isStreaming: true,
      metadata: {
        ...(currentMetadata?.webSearchRequested ? { webSearchRequested: true } : {}),
        agentActivity: startAgentActivityLocally({
          sessionId: conversationId,
          turnId: assistantMessageId,
          summary: 'Retrying',
          startedAtMs: Date.now(),
          isRetry: true,
        }),
      },
    },
    conversationId,
  );
}

async function consumeAssistantStream(ctx: ConsumeStreamContext): Promise<StreamOutcome> {
  const {
    response,
    assistantMessageId,
    model,
    conversationId,
    isTemporaryConversation,
    getAuthToken,
  } = ctx;

  const store = useChatStore.getState();
  const runHandle = readManagedCloudAgentRunHandle(response);
  ctx.onRunHandle?.(runHandle);
  const updateMessage = store.updateMessage;
  const streamFallbackReason = response.headers.get(FALLBACK_REASON_HEADER)?.trim();
  const isTurnContinuation = ctx.seedContent !== undefined;
  if (streamFallbackReason) {
    updateMessage(assistantMessageId, { fallbackReason: streamFallbackReason }, conversationId);
  } else if (!isTurnContinuation) {
    updateMessage(assistantMessageId, { fallbackReason: undefined }, conversationId);
  }
  // Read here rather than at each caller so a continuation and a resumed run
  // disclose the lane on the same terms as a first attempt. Cleared on the same
  // condition as the substitution code above: absent means the response never
  // consulted the lane, which is an answer, not a gap to leave stale.
  const streamRouteLane = readRouteLane(response.headers.get(ROUTE_LANE_HEADER));
  if (streamRouteLane) {
    updateMessage(assistantMessageId, { routeLane: streamRouteLane }, conversationId);
  } else if (!isTurnContinuation) {
    updateMessage(assistantMessageId, { routeLane: undefined }, conversationId);
  }
  const streamSecretRedactionCount = response.headers.get(SECRET_REDACTION_COUNT_HEADER);
  if (streamSecretRedactionCount) {
    updateMessage(
      assistantMessageId,
      { secretRedactionCount: Number(streamSecretRedactionCount) },
      conversationId,
    );
  } else if (!isTurnContinuation) {
    updateMessage(assistantMessageId, { secretRedactionCount: undefined }, conversationId);
  }
  const appendToMessage = store.appendToMessage;
  const appendToThinking = store.appendToThinking;
  const coalescedAppends = createFrameCoalescedAppender({
    onFlush: (kind, messageId, text) => {
      if (kind === 'thinking') {
        appendToThinking(messageId, text, conversationId);
        return;
      }
      appendToMessage(messageId, text, conversationId);
    },
  });
  const setSearching = store.setSearching;
  const setExecutingCode = store.setExecutingCode;
  const setSearchResults = store.setSearchResults;
  const setCodeExecutionResult = store.setCodeExecutionResult;
  const setToolTimeline = store.setToolTimeline;
  const setResearchState = store.setResearchState;
  const setAgiWorkPlan = store.setAgiWorkPlan;
  const stopStreaming = store.stopStreaming;
  const setLoading = store.setLoading;

  const toolTimeline: MessageToolEntry[] = ctx.seedTools
    ? ctx.seedTools.map((t) => ({ ...t }))
    : [];
  const toolStartTimes = new Map<string, number>();
  const pendingCalls: PendingApprovalCall[] = [];
  let suspended = false;
  const liveMessageMetadata = findConversationMessage(
    conversationId,
    ctx.assistantMessageId,
  )?.metadata;
  const seedMetadata = ctx.seedContent !== undefined ? liveMessageMetadata : undefined;
  // Stamped on the assistant placeholder at send time (see sendMessage); read here
  // once, up front, because buildAssistantMetadata rebuilds metadata from scratch
  // and would otherwise drop it on the final persist.
  const webSearchRequestedForTurn = liveMessageMetadata?.webSearchRequested === true;
  const interactiveCardsResumed = seedMetadata?.interactiveCardsResumed;
  let currentSearchResults: MessageMetadata['searchResults'] = seedMetadata?.searchResults;
  const citationsInModelMarkerOrder: NonNullable<MessageMetadata['citations']> = [
    ...(seedMetadata?.citations ?? []),
  ];
  let currentCodeExecutionResult: MessageMetadata['codeExecutionResult'] =
    seedMetadata?.codeExecutionResult;
  let currentResearch: MessageResearchState | undefined = seedMetadata?.research
    ? { ...seedMetadata.research }
    : undefined;
  let currentAgiWorkPlan: MessageMetadata['agiWorkPlan'] = seedMetadata?.agiWorkPlan;
  let currentGeneratedFiles: MessageMetadata['generatedFiles'] = seedMetadata?.generatedFiles;
  let currentAgentActivity: AgentActivityState | undefined = liveMessageMetadata?.agentActivity;
  let currentCloudAgentRun: ManagedCloudAgentRunReference | undefined = runHandle
    ? {
        ...runHandle,
        lastSequence: seedMetadata?.agentActivity?.lastSequence ?? -1,
      }
    : seedMetadata?.cloudAgentRun;
  let finishReason: string | undefined;
  let streamErrorInfo: { message: string; code?: string; retryable?: boolean } | undefined =
    seedMetadata?.streamError;
  const interactiveCards = new Map<string, InteractiveCard>(
    (seedMetadata?.interactiveCards ?? [])
      .slice(0, INTERACTIVE_CARDS_MAX_PER_MESSAGE)
      .map((card) => [card.cardId, card]),
  );

  const patchMessageMeta = (patch: Partial<MessageMetadata>) => {
    const current = findConversationMessage(conversationId, assistantMessageId)?.metadata;
    updateMessage(assistantMessageId, { metadata: { ...current, ...patch } }, conversationId);
  };

  const existingSearchResults = (): SearchResult[] =>
    Array.isArray(currentSearchResults)
      ? currentSearchResults
      : (currentSearchResults?.results ?? []);

  const mergeSearchResults = (incoming: SearchResult[]): SearchResult[] | undefined => {
    const existing = existingSearchResults();
    const additions = dedupeNewSearchResults(existing, incoming);
    if (additions.length === 0) return undefined;
    const merged = [...existing, ...additions];
    currentSearchResults = merged;
    setSearchResults(assistantMessageId, merged, conversationId);
    return merged;
  };

  const appendMarkerOrderedCitation = (url: string, title: string) => {
    if (!url || !title) return;
    const dedupeKey = normalizeCitationUrl(url) ?? url;
    const existingKey = (existingUrl: string | undefined) =>
      existingUrl ? (normalizeCitationUrl(existingUrl) ?? existingUrl) : existingUrl;
    if (citationsInModelMarkerOrder.some((c) => existingKey(c.url) === dedupeKey)) return;
    citationsInModelMarkerOrder.push({ type: WEB_SEARCH_CITATION_KIND, url, title });
    patchMessageMeta({ citations: [...citationsInModelMarkerOrder] });
  };

  const applySourceListEvent = (event: AgentEventEnvelope['event']) => {
    if (event.type !== 'source-list' || event.sources.length === 0) return;
    mergeSearchResults(
      event.sources.map((source) => ({
        url: source.url,
        title: source.title || source.url,
        snippet: source.snippet ?? '',
      })),
    );
  };

  // A turn that gets the structured `x_agent_event` stream (the managed cloud
  // chat / agent run dialect, not only AGI Work) already drives truthful
  // phase labels through applyAgentActivityEvent below. A turn that never
  // sees one of those only gets the older `x_tool_status` / `x_search_results`
  // deltas, which used to update nothing but the legacy tool timeline,
  // leaving the header stuck on its starting label. Projecting those through
  // the identical state machine gives both dialects the same labels
  // ("Searching the web" -> "Reading N sources" -> "Writing response") from
  // the same kind of event, without a second, bespoke label deriver.
  //
  // Real `x_agent_event`s always win: `sawRealAgentEvent` flips true the
  // moment one is parsed (seeded true if this message already carries one
  // from an earlier chunk) and permanently disables synthesis for the turn,
  // so a stream carrying both dialects for the same tool call never lets the
  // synthetic projection collide with the canonical one.
  let sawRealAgentEvent = (currentAgentActivity?.lastSequence ?? -1) > -1;
  let localAgentEventSequence = 0;
  const applyLocalAgentEvent = (event: AgentEvent) => {
    if (sawRealAgentEvent) return;
    currentAgentActivity = applyAgentActivityEvent(currentAgentActivity, {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: conversationId,
      turnId: assistantMessageId,
      sequence: localAgentEventSequence++,
      emittedAtMs: Date.now(),
      event,
    });
    patchMessageMeta({ agentActivity: currentAgentActivity });
  };

  const nativeToolCategory = (name: string): AgentEventToolCategory => {
    if (name === 'web_search' || name === 'gemini_grounding') return 'web-search';
    if (name === 'web_fetch' || name === 'url_fetch') return 'web-fetch';
    if (name === 'code_execution') return 'code-execution';
    return 'other';
  };

  const nativeToolCallId = (name: string) => `native:${name}`;

  // Google's grounded search has no separate "started" signal on the wire at
  // all (packages/ai/providers/google/src/stream.ts yields only a single
  // server-tool-result once grounding is already done), and the server's
  // canonical forwarding for native search (tool-loop.ts) only pairs a
  // start with a result, it never covers Google's result-only shape. So a
  // Gemini turn can legitimately see OTHER real x_agent_events (lifecycle,
  // text-delta) while never seeing one for the search itself, which is why
  // this is its own mechanism instead of another `applyLocalAgentEvent`
  // case gated on `sawRealAgentEvent`: it upserts the entries array
  // directly, never touching `lastSequence`, so it stays safe to run
  // alongside a real event stream that covers everything except this one
  // tool. `hasCanonicalWebSearchEntry` yields to a real forwarded entry the
  // moment one appears (a different id, since real ones carry a server
  // toolCallId), and `reconcileNativeWebSearchEntry` drops this synthetic
  // row if a real one lands after it already started one, so a same-call
  // race never leaves two rows on screen.
  const nativeWebSearchEntryId = `tool:${nativeToolCallId('web_search')}`;
  const hasCanonicalWebSearchEntry = () =>
    currentAgentActivity?.entries.some(
      (entry) =>
        entry.kind === 'tool' &&
        entry.category === 'web-search' &&
        entry.id !== nativeWebSearchEntryId,
    ) ?? false;

  const upsertNativeWebSearchEntry = (patch: Partial<AgentActivityToolEntry>) => {
    if (!currentAgentActivity || currentAgentActivity.status !== 'running') return;
    if (hasCanonicalWebSearchEntry()) return;
    const index = currentAgentActivity.entries.findIndex(
      (entry) => entry.id === nativeWebSearchEntryId,
    );
    const existing =
      index >= 0 ? (currentAgentActivity.entries[index] as AgentActivityToolEntry) : undefined;
    const merged: AgentActivityToolEntry = {
      kind: 'tool',
      id: nativeWebSearchEntryId,
      toolCallId: nativeToolCallId('web_search'),
      name: 'web_search',
      category: 'web-search',
      summary: 'Searching the web',
      status: 'running',
      startedAtMs: Date.now(),
      ...existing,
      ...patch,
    };
    const entries =
      index >= 0
        ? currentAgentActivity.entries.map((entry, i) => (i === index ? merged : entry))
        : [...currentAgentActivity.entries, merged];
    currentAgentActivity = { ...currentAgentActivity, entries, updatedAtMs: Date.now() };
    patchMessageMeta({ agentActivity: currentAgentActivity });
  };

  const reconcileNativeWebSearchEntry = () => {
    if (!currentAgentActivity || !hasCanonicalWebSearchEntry()) return;
    if (!currentAgentActivity.entries.some((entry) => entry.id === nativeWebSearchEntryId)) return;
    currentAgentActivity = {
      ...currentAgentActivity,
      entries: currentAgentActivity.entries.filter((entry) => entry.id !== nativeWebSearchEntryId),
    };
    patchMessageMeta({ agentActivity: currentAgentActivity });
  };

  let hasSyncedWritingResponse = false;
  const syncWritingResponseOnce = (delta: string) => {
    if (sawRealAgentEvent || hasSyncedWritingResponse) return;
    hasSyncedWritingResponse = true;
    applyLocalAgentEvent({ type: 'text-delta', delta });
  };

  // The stream ending is itself the terminal signal: a run that never emitted a
  // stop envelope (deep research, server tools) would otherwise keep rendering
  // "Working…" under a finished answer.
  const settleAgentActivity = () => {
    if (!currentAgentActivity) return;
    if (currentAgentActivity.status !== 'running') return;
    if (suspended) return;
    if (streamErrorInfo) {
      currentAgentActivity = finishAgentActivityLocally(currentAgentActivity, {
        status: 'failed',
        completedAtMs: Date.now(),
        error: streamErrorInfo.message,
      });
      patchMessageMeta({ agentActivity: currentAgentActivity });
      return;
    }
    currentAgentActivity = {
      ...currentAgentActivity,
      entries: withoutGenerationProgress(currentAgentActivity.entries).map((entry) =>
        entry.kind === 'progress' && entry.progressId === 'local-starting'
          ? { ...entry, summary: 'Response ready' }
          : entry,
      ),
    };
    currentAgentActivity = finishAgentActivityLocally(currentAgentActivity, {
      status: 'completed',
      completedAtMs: Date.now(),
    });
    patchMessageMeta({ agentActivity: currentAgentActivity });
  };

  if (currentCloudAgentRun) {
    patchMessageMeta({ cloudAgentRun: { ...currentCloudAgentRun } });
  }

  const publishCloudRunReference = (patch: Partial<ManagedCloudAgentRunReference> = {}): void => {
    if (!currentCloudAgentRun) return;
    currentCloudAgentRun = {
      ...currentCloudAgentRun,
      ...patch,
      lastSequence: Math.max(
        currentCloudAgentRun.lastSequence,
        currentAgentActivity?.lastSequence ?? -1,
        patch.lastSequence ?? -1,
      ),
    };
    patchMessageMeta({ cloudAgentRun: { ...currentCloudAgentRun } });
  };

  const CLOUD_RUN_TERMINAL_STATES: AgentTaskState[] = [
    'ready_for_review',
    'completed',
    'failed',
    'cancelled',
    'archived',
  ];
  const finalCloudRunState = (fallback: AgentTaskState): AgentTaskState => {
    const observed = currentAgentActivity?.taskState;
    return observed && CLOUD_RUN_TERMINAL_STATES.includes(observed) ? observed : fallback;
  };

  let thinkingContent = seedMetadata?.thinkingContent ?? '';
  let thinkingStartedAt: string | undefined = seedMetadata?.thinkingStartedAt;
  let thinkingCompletedAt: string | undefined = seedMetadata?.thinkingCompletedAt;
  const seededThinkingDurationSeconds = seedMetadata?.thinkingDurationSeconds;

  const thinkingSegments: NonNullable<MessageMetadata['thinkingSegments']> =
    seedMetadata?.thinkingSegments?.map((segment) => ({ ...segment })) ?? [];

  const publishThinkingSegments = () => {
    if (thinkingSegments.length < 2) return;
    patchMessageMeta({ thinkingSegments: thinkingSegments.map((s) => ({ ...s })) });
  };

  let thinkingActivityOpen = false;
  const openThinkingSegment = () => {
    coalescedAppends.flush();
    const startedAt = new Date().toISOString();
    thinkingStartedAt = startedAt;
    thinkingSegments.push({
      id: `${assistantMessageId}-think-${thinkingSegments.length}`,
      content: '',
      isStreaming: true,
      startedAt,
      completedAt: null,
    });
    patchMessageMeta({ isThinkingStreaming: true, thinkingStartedAt: startedAt });
    publishThinkingSegments();
    thinkingActivityOpen = true;
    applyLocalAgentEvent({
      type: 'progress-update',
      progressId: 'thinking',
      summary: deriveAgentActivityLabel({ kind: 'thinking' }),
      status: 'running',
    });
  };

  const appendThinkingText = (text: string) => {
    thinkingContent += text;
    coalescedAppends.append('thinking', assistantMessageId, text);
    const seg = thinkingSegments[thinkingSegments.length - 1];
    if (seg) {
      seg.content += text;
      publishThinkingSegments();
    }
  };

  const closeThinkingSegment = () => {
    coalescedAppends.flush();
    const completedAt = new Date().toISOString();
    thinkingCompletedAt = completedAt;
    const seg = thinkingSegments[thinkingSegments.length - 1];
    if (seg && seg.isStreaming) {
      seg.isStreaming = false;
      seg.completedAt = completedAt;
      seg.durationSeconds = Math.max(
        0,
        Math.round((Date.parse(completedAt) - Date.parse(seg.startedAt)) / 1000),
      );
    }
    patchMessageMeta({ isThinkingStreaming: false, thinkingCompletedAt: completedAt });
    publishThinkingSegments();
    if (thinkingActivityOpen) {
      thinkingActivityOpen = false;
      applyLocalAgentEvent({
        type: 'progress-update',
        progressId: 'thinking',
        summary: deriveAgentActivityLabel({ kind: 'thinking' }),
        status: 'completed',
      });
    }
  };

  const publishToolTimeline = () => {
    if (toolTimeline.length === 0) return;
    setToolTimeline(
      assistantMessageId,
      toolTimeline.map((tool) => ({ ...tool })),
      conversationId,
    );
  };

  const findLastToolIndex = (name: string, statuses?: MessageToolEntry['status'][]) => {
    for (let index = toolTimeline.length - 1; index >= 0; index -= 1) {
      const tool = toolTimeline[index];
      if (!tool || tool.name !== name) continue;
      if (!statuses || statuses.includes(tool.status)) return index;
    }
    return -1;
  };

  const createToolId = (name: string) =>
    `${assistantMessageId}-${name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}-${
      toolTimeline.length + 1
    }`;

  const normalizeToolName = (name: unknown) =>
    typeof name === 'string' && name.trim() ? name.trim() : 'server_tool';

  const startTool = (
    rawName: unknown,
    args?: string,
    statusPhrase?: string,
    parameters?: Record<string, unknown>,
  ) => {
    const name = normalizeToolName(rawName);
    const existingIndex = findLastToolIndex(name, ['pending', 'running']);
    if (existingIndex >= 0) {
      const existing = toolTimeline[existingIndex];
      if (existing) {
        existing.status = 'running';
        existing.args = args ?? existing.args;
        if (statusPhrase) existing.statusPhrase = statusPhrase;
        if (parameters && Object.keys(parameters).length > 0) existing.parameters = parameters;
      }
      publishToolTimeline();
      return;
    }

    const id = createToolId(name);
    toolStartTimes.set(id, Date.now());
    toolTimeline.push({
      id,
      name,
      status: 'running',
      args,
      statusPhrase,
      parameters,
    });
    publishToolTimeline();
  };

  const finishTool = (
    rawName: unknown,
    status: Extract<MessageToolEntry['status'], 'completed' | 'failed'>,
    error?: string,
  ) => {
    const name = normalizeToolName(rawName);
    let index = findLastToolIndex(name, ['pending', 'running']);
    if (index < 0) {
      const id = createToolId(name);
      toolStartTimes.set(id, Date.now());
      toolTimeline.push({ id, name, status: 'running' });
      index = toolTimeline.length - 1;
    }

    const tool = toolTimeline[index];
    if (!tool) return;
    const startedAt = tool.id ? toolStartTimes.get(tool.id) : undefined;
    tool.status = status;
    tool.durationMs = startedAt ? Date.now() - startedAt : tool.durationMs;
    tool.error = error;
    publishToolTimeline();
  };

  const finishRunningTools = (
    status: Extract<MessageToolEntry['status'], 'completed' | 'failed'> = 'completed',
    error?: string,
  ) => {
    for (const tool of toolTimeline) {
      if (tool.status !== 'pending' && tool.status !== 'running') continue;
      const startedAt = tool.id ? toolStartTimes.get(tool.id) : undefined;
      tool.status = status;
      tool.durationMs = startedAt ? Date.now() - startedAt : tool.durationMs;
      tool.error = error;
    }
    publishToolTimeline();
  };

  const buildAssistantMetadata = (): MessageMetadata | undefined => {
    const metadata: MessageMetadata = {};
    if (toolTimeline.length > 0) {
      metadata.tools = toolTimeline.map((tool) => ({ ...tool }));
    }
    if (currentAgentActivity) {
      metadata.agentActivity = currentAgentActivity;
    }
    if (currentCloudAgentRun) {
      metadata.cloudAgentRun = { ...currentCloudAgentRun };
      const approvalCalls = toolTimeline
        .filter(
          (tool) =>
            tool.requiresApproval === true &&
            typeof tool.toolCallId === 'string' &&
            tool.toolCallId.length > 0,
        )
        .map((tool) => {
          const input = stringifyApprovalInput(tool.parameters ?? tool.rawArgs);
          return {
            toolCallId: tool.toolCallId as string,
            name: tool.name,
            ...(input ? { input } : {}),
            ...(typeof tool.approved === 'boolean'
              ? { approvalDecision: tool.approved ? ('approved' as const) : ('rejected' as const) }
              : {}),
          };
        });
      metadata.cloudApproval =
        approvalCalls.length > 0
          ? CloudToolApprovalProjectionSchema.parse({
              schemaVersion: 1,
              runId: currentCloudAgentRun.runId,
              calls: approvalCalls,
            })
          : null;
    }
    if (hasWebSearchSources(currentSearchResults)) {
      metadata.searchResults = currentSearchResults;
    }
    if (citationsInModelMarkerOrder.length > 0) {
      metadata.citations = citationsInModelMarkerOrder;
    }
    if (webSearchRequestedForTurn) {
      metadata.webSearchRequested = true;
    }
    if (currentCodeExecutionResult) {
      metadata.codeExecutionResult = currentCodeExecutionResult;
    }
    if (currentGeneratedFiles && currentGeneratedFiles.length > 0) {
      metadata.generatedFiles = currentGeneratedFiles.map((f) => ({ ...f }));
    }
    if (currentResearch) {
      metadata.research = { ...currentResearch };
    }
    if (currentAgiWorkPlan) {
      metadata.agiWorkPlan = currentAgiWorkPlan.map((step) => ({ ...step }));
    }
    if (interactiveCards.size > 0) {
      metadata.interactiveCards = [...interactiveCards.values()];
    }
    if (interactiveCardsResumed) {
      metadata.interactiveCardsResumed = true;
    }
    if (finishReason) {
      metadata.finishReason = finishReason;
    }
    if (streamErrorInfo) {
      metadata.streamError = streamErrorInfo;
    }
    if (thinkingSegments.length >= 2) {
      metadata.thinkingSegments = thinkingSegments.map((s) => ({ ...s, isStreaming: false }));
    }
    if (thinkingContent.trim().length > 0) {
      metadata.thinkingContent = thinkingContent;
      metadata.isThinkingStreaming = false;
      if (thinkingStartedAt) metadata.thinkingStartedAt = thinkingStartedAt;
      if (thinkingCompletedAt) {
        metadata.thinkingCompletedAt = thinkingCompletedAt;
      }
      const duration =
        seededThinkingDurationSeconds ??
        (thinkingStartedAt && thinkingCompletedAt
          ? Math.max(
              0,
              Math.round((Date.parse(thinkingCompletedAt) - Date.parse(thinkingStartedAt)) / 1000),
            )
          : undefined);
      if (duration !== undefined) metadata.thinkingDurationSeconds = duration;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  const persistAssistant = (fullContent: string) => {
    const metadata = buildAssistantMetadata();
    if (metadata) {
      updateMessage(assistantMessageId, { metadata }, conversationId);
    }
    if (isTemporaryConversation) return;
    const hasMeaningfulMetadata = Boolean(
      metadata &&
      ((metadata.tools?.length ?? 0) > 0 ||
        metadata.agentActivity ||
        (metadata.generatedFiles?.length ?? 0) > 0 ||
        metadata.searchResults ||
        metadata.codeExecutionResult ||
        metadata.research ||
        (metadata.interactiveCards?.length ?? 0) > 0 ||
        metadata.cloudAgentRun ||
        metadata.cloudApproval ||
        metadata.thinkingContent ||
        (metadata.thinkingSegments?.length ?? 0) > 0 ||
        metadata.streamError),
    );
    if (!fullContent && !hasMeaningfulMetadata) return;
    saveMessageToDb(
      conversationId,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: fullContent || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
        model,
        metadata,
        ...(ctx.assistantParentId ? { parentId: ctx.assistantParentId } : {}),
      },
      getAuthToken,
    )
      .then((saved) => {
        if (saved?.id && saved.id !== assistantMessageId) {
          updateMessage(assistantMessageId, { id: saved.id }, conversationId);
        }
      })
      .catch((err) => notifyPersistenceFailure('assistant', err));
  };

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullAssistantContent = ctx.seedContent ?? '';
  let inThinkingBlock = false;
  let contentBuffer = '';
  let unacknowledgedPublicText = '';

  let firstStreamActivitySeen = false;
  const reasoningFallbackTimer = getModelReasoning(model).capable
    ? setTimeout(() => {
        if (firstStreamActivitySeen) return;
        applyLocalAgentEvent({
          type: 'progress-update',
          progressId: 'thinking',
          summary: deriveAgentActivityLabel({ kind: 'thinking' }),
          status: 'running',
        });
      }, REASONING_ACTIVITY_FALLBACK_THRESHOLD_MS)
    : undefined;
  const markFirstStreamActivitySeen = () => {
    if (firstStreamActivitySeen) return;
    firstStreamActivitySeen = true;
    if (reasoningFallbackTimer !== undefined) clearTimeout(reasoningFallbackTimer);
  };

  const HOLD_BACK = 11;

  const seamSeed = ctx.seedContent ?? '';
  let seamPending = seamSeed.length > 0;
  let seamBuffer = '';

  const emitPublicText = (text: string, isFinal: boolean): void => {
    if (seamPending) {
      seamBuffer += text;
      if (!isFinal && seamBuffer.length < SEAM_INSPECTION_WINDOW) return;
      const repaired = repairContinuationSeam(seamSeed, seamBuffer);
      seamPending = false;
      seamBuffer = '';
      if (!repaired) return;
      fullAssistantContent += repaired;
      unacknowledgedPublicText += repaired;
      coalescedAppends.append('content', assistantMessageId, repaired);
      return;
    }

    if (!text) return;
    fullAssistantContent += text;
    unacknowledgedPublicText += text;
    coalescedAppends.append('content', assistantMessageId, text);
  };

  const flushContentBuffer = (isFinal = false) => {
    while (true) {
      const openIdx = contentBuffer.indexOf('<thinking>');
      const closeIdx = contentBuffer.indexOf('</thinking>');

      if (!inThinkingBlock && openIdx !== -1) {
        const before = contentBuffer.slice(0, openIdx);
        emitPublicText(before, isFinal);
        inThinkingBlock = true;
        openThinkingSegment();
        contentBuffer = contentBuffer.slice(openIdx + '<thinking>'.length);
        continue;
      }

      if (inThinkingBlock && closeIdx !== -1) {
        const thinkingPart = contentBuffer.slice(0, closeIdx);
        if (thinkingPart) {
          appendThinkingText(thinkingPart);
        }
        inThinkingBlock = false;
        closeThinkingSegment();
        contentBuffer = contentBuffer.slice(closeIdx + '</thinking>'.length);
        continue;
      }

      if (isFinal) {
        if (contentBuffer) {
          if (inThinkingBlock) {
            appendThinkingText(contentBuffer);
          } else {
            emitPublicText(contentBuffer, true);
          }
          contentBuffer = '';
        }
      } else if (contentBuffer.length > HOLD_BACK) {
        const safe = contentBuffer.slice(0, contentBuffer.length - HOLD_BACK);
        if (inThinkingBlock) {
          appendThinkingText(safe);
        } else {
          emitPublicText(safe, false);
        }
        contentBuffer = contentBuffer.slice(contentBuffer.length - HOLD_BACK);
      }
      if (isFinal && seamPending && seamBuffer) emitPublicText('', true);
      break;
    }
    if (isFinal) coalescedAppends.flush();
  };

  if (toolTimeline.length > 0) publishToolTimeline();

  const replayDurableRun = async (): Promise<StreamOutcome> => {
    if (!runHandle) throw new Error('Managed Cloud run handle is unavailable');

    flushContentBuffer(true);
    if (inThinkingBlock) {
      closeThinkingSegment();
      inThinkingBlock = false;
    }

    const client = createManagedCloudAgentRunClient({
      getAuthToken,
    });
    const afterSequence = Math.max(
      currentCloudAgentRun?.lastSequence ?? -1,
      currentAgentActivity?.lastSequence ?? -1,
    );
    const terminalFollowAbort = new AbortController();
    let sawTerminalAgentEvent = false;

    let runState: AgentTaskState;
    let lastKnownSequence = afterSequence;
    let cancellationRequestedAt: string | null | undefined;

    try {
      const followed = await client.followRun(runHandle.runId, {
        afterSequence,
        pollIntervalMs: DURABLE_RUN_POLL_INTERVAL_MS,
        signal: terminalFollowAbort.signal,
        onEvent: (envelope) => {
          if (envelope.event.type === 'text-delta' && envelope.event.delta) {
            const reconciled = reconcileManagedCloudPublicText(
              unacknowledgedPublicText,
              envelope.event.delta,
            );
            unacknowledgedPublicText = reconciled.pending;
            if (reconciled.unmatchedIncoming) {
              fullAssistantContent += reconciled.unmatchedIncoming;
              coalescedAppends.append('content', assistantMessageId, reconciled.unmatchedIncoming);
            }
          }
          if (envelope.event.type === 'error' && !streamErrorInfo) {
            streamErrorInfo = {
              message: envelope.event.message,
              ...(envelope.event.code ? { code: envelope.event.code } : {}),
              ...(envelope.event.retryable !== undefined
                ? { retryable: envelope.event.retryable }
                : {}),
            };
          }
          if (envelope.event.type === 'stop') {
            finishReason =
              envelope.event.reason === 'max-tokens'
                ? 'length'
                : envelope.event.reason === 'cancelled'
                  ? 'stopped'
                  : envelope.event.reason === 'error'
                    ? 'error'
                    : 'stop';
          }
          sawRealAgentEvent = true;
          applySourceListEvent(envelope.event);
          currentAgentActivity = collapseDuplicateAgentActivityErrors(
            applyAgentActivityEvent(currentAgentActivity, humanizeAgentEventEnvelope(envelope)),
          );
          patchMessageMeta({ agentActivity: currentAgentActivity });
          reconcileNativeWebSearchEntry();
          publishCloudRunReference({ lastSequence: envelope.sequence });
          if (isTerminalAgentEventEnvelope(envelope)) {
            sawTerminalAgentEvent = true;
            terminalFollowAbort.abort();
          }
        },
        onSnapshot: (snapshot) => {
          publishCloudRunReference({
            lastSequence: snapshot.nextAfterSequence,
            state: snapshot.run.state,
            cancellationRequestedAt: snapshot.run.cancellationRequestedAt,
          });
        },
      });
      lastKnownSequence = followed.lastSequence;
      runState = followed.run.state;
      cancellationRequestedAt = followed.run.cancellationRequestedAt;
    } catch (error) {
      const isAbortError =
        typeof error === 'object' &&
        error !== null &&
        (error as { name?: unknown }).name === 'AbortError';
      if (!sawTerminalAgentEvent || !isAbortError) throw error;
      lastKnownSequence = currentAgentActivity?.lastSequence ?? afterSequence;
      runState = 'failed';
    }

    coalescedAppends.flush();
    publishCloudRunReference({
      lastSequence: lastKnownSequence,
      state: runState,
      ...(cancellationRequestedAt !== undefined ? { cancellationRequestedAt } : {}),
    });
    if (runState === 'failed') {
      finishRunningTools('failed', 'The managed agent run failed.');
    } else if (runState !== 'awaiting_input' && runState !== 'paused') {
      finishRunningTools();
    }
    setSearching(assistantMessageId, false, conversationId);
    setExecutingCode(assistantMessageId, false, conversationId);
    if (finishReason) patchMessageMeta({ finishReason });
    if (runState !== 'awaiting_input' && runState !== 'paused') {
      settleAgentActivity();
    }
    persistAssistant(fullAssistantContent);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return { suspended, pendingCalls, runHandle };
  };

  const collectEventPayloads = (rawEvent: string): string[] => {
    const dataLines: string[] = [];
    for (const rawLine of rawEvent.split('\n')) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) continue;
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    if (dataLines.length <= 1) return dataLines;
    const joined = dataLines.join('\n');
    try {
      JSON.parse(joined);
      return [joined];
    } catch {
      return dataLines;
    }
  };

  const drainEventPayloads = (flushAll: boolean): string[] => {
    buffer = buffer.replace(/\r\n|\r/g, '\n');
    const payloads: string[] = [];
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      payloads.push(...collectEventPayloads(rawEvent));
      boundary = buffer.indexOf('\n\n');
    }
    if (flushAll && buffer.trim()) {
      payloads.push(...collectEventPayloads(buffer));
    }
    if (flushAll) buffer = '';
    return payloads;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      markFirstStreamActivitySeen();

      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

      for (const data of drainEventPayloads(done)) {
        if (data === '[DONE]') {
          flushContentBuffer(true);
          if (inThinkingBlock) {
            closeThinkingSegment();
            inThinkingBlock = false;
          }
          finishRunningTools();
          setSearching(assistantMessageId, false, conversationId);
          setExecutingCode(assistantMessageId, false, conversationId);
          if (finishReason) {
            patchMessageMeta({ finishReason });
          }
          if (streamErrorInfo) {
            patchMessageMeta({ streamError: streamErrorInfo });
          }
          settleAgentActivity();
          publishCloudRunReference({
            state: finalCloudRunState(streamErrorInfo ? 'failed' : 'ready_for_review'),
          });
          persistAssistant(fullAssistantContent);
          stopStreaming(conversationId);
          setLoading(false, conversationId);
          return { suspended, pendingCalls, runHandle };
        }

        try {
          const parsed = JSON.parse(data);

          const agentEnvelope = parseAgentEventDelta(parsed.choices?.[0]?.delta?.x_agent_event);
          if (agentEnvelope) sawRealAgentEvent = true;
          const duplicateAgentEnvelope = Boolean(
            agentEnvelope &&
            currentAgentActivity?.sessionId === agentEnvelope.sessionId &&
            currentAgentActivity.turnId === agentEnvelope.turnId &&
            agentEnvelope.sequence <= currentAgentActivity.lastSequence,
          );
          if (agentEnvelope && !duplicateAgentEnvelope) {
            if (agentEnvelope.event.type === 'text-delta') {
              unacknowledgedPublicText = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                agentEnvelope.event.delta,
              ).pending;
            }
            if (agentEnvelope.event.type === 'error' && !streamErrorInfo) {
              streamErrorInfo = {
                message: agentEnvelope.event.message,
                ...(agentEnvelope.event.code ? { code: agentEnvelope.event.code } : {}),
                ...(agentEnvelope.event.retryable !== undefined
                  ? { retryable: agentEnvelope.event.retryable }
                  : {}),
              };
            }
            if (agentEnvelope.event.type === 'stop') {
              finishReason =
                agentEnvelope.event.reason === 'max-tokens'
                  ? 'length'
                  : agentEnvelope.event.reason === 'cancelled'
                    ? 'stopped'
                    : agentEnvelope.event.reason === 'error'
                      ? 'error'
                      : 'stop';
            }
            applySourceListEvent(agentEnvelope.event);
            currentAgentActivity = collapseDuplicateAgentActivityErrors(
              applyAgentActivityEvent(
                currentAgentActivity,
                humanizeAgentEventEnvelope(agentEnvelope),
              ),
            );
            patchMessageMeta({ agentActivity: currentAgentActivity });
            reconcileNativeWebSearchEntry();
            publishCloudRunReference({ lastSequence: agentEnvelope.sequence });
          }

          let chunk: string | null = null;
          const deltaContent = parsed.choices?.[0]?.delta?.content;
          if (!duplicateAgentEnvelope && typeof deltaContent === 'string') {
            chunk = deltaContent;
          } else if (!duplicateAgentEnvelope && deltaContent != null) {
            logger.warn('[useChatStream] Ignoring non-string delta.content', {
              type: typeof deltaContent,
              isArray: Array.isArray(deltaContent),
            });
          } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            chunk = parsed.delta.text;
          }

          if (chunk !== null) {
            contentBuffer += chunk;
            flushContentBuffer(false);
            syncWritingResponseOnce(chunk);
          }

          const researchStatus = parsed.choices?.[0]?.delta?.x_research_status;
          if (researchStatus && typeof researchStatus === 'object') {
            const phase = researchStatus.phase;
            if (
              phase === 'planning' ||
              phase === 'awaiting_approval' ||
              phase === 'searching' ||
              phase === 'synthesizing' ||
              phase === 'complete' ||
              phase === 'error'
            ) {
              currentResearch = {
                phase,
                label: typeof researchStatus.label === 'string' ? researchStatus.label : undefined,
                iteration:
                  typeof researchStatus.iteration === 'number'
                    ? researchStatus.iteration
                    : currentResearch?.iteration,
                maxIterations:
                  typeof researchStatus.max_iterations === 'number'
                    ? researchStatus.max_iterations
                    : currentResearch?.maxIterations,
                searches:
                  typeof researchStatus.searches === 'number'
                    ? researchStatus.searches
                    : currentResearch?.searches,
                maxSearches:
                  typeof researchStatus.max_searches === 'number'
                    ? researchStatus.max_searches
                    : currentResearch?.maxSearches,
                sources:
                  typeof researchStatus.sources === 'number'
                    ? researchStatus.sources
                    : currentResearch?.sources,
                elapsedMs:
                  typeof researchStatus.elapsed_ms === 'number'
                    ? researchStatus.elapsed_ms
                    : currentResearch?.elapsedMs,
                startedAt: currentResearch?.startedAt ?? new Date().toISOString(),
                error:
                  phase === 'error'
                    ? typeof researchStatus.label === 'string'
                      ? researchStatus.label
                      : 'Research run failed'
                    : undefined,
                steps: currentResearch?.steps,
                sourcesForRetry: currentResearch?.sourcesForRetry,
              };
              setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
            }
          }

          const researchPlan = parsed.choices?.[0]?.delta?.x_research_plan;
          if (researchPlan) {
            const planSteps = parseResearchPlanEvent(researchPlan);
            if (planSteps) {
              if (!currentResearch) {
                applyLocalAgentEvent({
                  type: 'progress-update',
                  progressId: 'planning',
                  summary: deriveAgentActivityLabel({ kind: 'planning' }),
                  status: 'running',
                });
              }
              currentResearch = {
                ...(currentResearch ?? {
                  phase: 'planning',
                  startedAt: new Date().toISOString(),
                }),
                steps: planSteps,
              };
              setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
            }
          }

          const agiWorkPlan = parsed.choices?.[0]?.delta?.x_agiwork_plan;
          if (agiWorkPlan) {
            const planSteps = parseAgiWorkPlanEvent(agiWorkPlan);
            if (planSteps) {
              currentAgiWorkPlan = planSteps;
              setAgiWorkPlan(assistantMessageId, planSteps, conversationId);
            }
          }

          const toolStatus = parsed.choices?.[0]?.delta?.x_tool_status;
          if (toolStatus?.type === 'server_tool_use') {
            startTool(toolStatus.name, undefined, toolStatus.status_phrase);
            const name = typeof toolStatus.name === 'string' ? toolStatus.name : 'server_tool';
            const category = nativeToolCategory(name);
            const phrase =
              typeof toolStatus.status_phrase === 'string'
                ? toolStatus.status_phrase
                : deriveAgentActivityLabel({
                    kind: 'tool',
                    name,
                    category,
                    argument: extractToolActivityArgument(toolStatus.args),
                  });
            if (name === 'web_search' || name === 'gemini_grounding') {
              upsertNativeWebSearchEntry({ summary: phrase, status: 'running' });
            } else {
              applyLocalAgentEvent({
                type: 'tool-execution-start',
                toolCallId: nativeToolCallId(name),
                name,
                category,
                summary: phrase,
                input: null,
              });
            }
          }
          if (toolStatus?.type === 'mcp_tool_use') {
            if (toolStatus.status === 'running') {
              const phrase =
                typeof toolStatus.status_phrase === 'string' ? toolStatus.status_phrase : undefined;
              const parameters =
                toolStatus.args != null &&
                typeof toolStatus.args === 'object' &&
                !Array.isArray(toolStatus.args)
                  ? (toolStatus.args as Record<string, unknown>)
                  : undefined;
              startTool(toolStatus.name, undefined, phrase, parameters);
            } else if (toolStatus.status === 'completed' || toolStatus.status === 'failed') {
              finishTool(toolStatus.name, toolStatus.status);
            }
          }
          if (toolStatus?.status === 'searching' || toolStatus?.status === 'fetching') {
            setSearching(assistantMessageId, true, conversationId);
          } else if (toolStatus?.status === 'executing') {
            setExecutingCode(assistantMessageId, true, conversationId);
          }

          const streamErrorDelta = parsed.choices?.[0]?.delta?.x_stream_error;
          if (!streamErrorInfo) {
            if (
              streamErrorDelta &&
              typeof streamErrorDelta === 'object' &&
              typeof streamErrorDelta.message === 'string' &&
              streamErrorDelta.message
            ) {
              streamErrorInfo = {
                message: streamErrorDelta.message,
                ...(typeof streamErrorDelta.code === 'string'
                  ? { code: streamErrorDelta.code }
                  : {}),
                ...(typeof streamErrorDelta.retryable === 'boolean'
                  ? { retryable: streamErrorDelta.retryable }
                  : {}),
              };
            } else if (typeof streamErrorDelta === 'string' && streamErrorDelta) {
              streamErrorInfo = { message: streamErrorDelta };
            }
          }

          const approvalReq = parsed.choices?.[0]?.delta?.x_tool_approval_request;
          if (approvalReq && typeof approvalReq === 'object') {
            const tcId = (approvalReq as Record<string, unknown>)['tool_call_id'];
            const name = (approvalReq as Record<string, unknown>)['name'];
            const rawArgs = (approvalReq as Record<string, unknown>)['args'];
            if (typeof tcId === 'string' && tcId && typeof name === 'string' && name) {
              const args =
                rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
                  ? (rawArgs as Record<string, unknown>)
                  : {};
              suspended = true;
              pendingCalls.push({ toolCallId: tcId, name, args });
              const id = createToolId(name);
              toolTimeline.push({
                id,
                name,
                status: 'awaiting_approval',
                requiresApproval: true,
                toolCallId: tcId,
                parameters: Object.keys(args).length > 0 ? args : undefined,
              });
              publishToolTimeline();
            }
          }

          const cardDelta = parsed.choices?.[0]?.delta?.[INTERACTIVE_CARD_DELTA_KEY];
          if (cardDelta) {
            const card = parseInteractiveCardDelta(cardDelta);
            if (
              card &&
              (interactiveCards.has(card.cardId) ||
                interactiveCards.size < INTERACTIVE_CARDS_MAX_PER_MESSAGE)
            ) {
              interactiveCards.set(card.cardId, card);
              patchMessageMeta({ interactiveCards: [...interactiveCards.values()] });
            }
          }

          const codeResultBlock = parsed.choices?.[0]?.delta?.x_code_result;
          if (codeResultBlock) {
            const result = codeResultBlock.content as Record<string, unknown> | undefined;
            if (result?.['type'] === 'code_execution_tool_result_error') {
              const errorCode = (result['error_code'] as string | undefined) || 'unknown_error';
              finishTool('code_execution', 'failed', `Code execution failed: ${errorCode}`);
            } else {
              const stdout =
                typeof result?.['stdout'] === 'string' ? (result['stdout'] as string) : '';
              const stderr =
                typeof result?.['stderr'] === 'string' ? (result['stderr'] as string) : '';
              const returnCode =
                typeof result?.['return_code'] === 'number' ? (result['return_code'] as number) : 0;
              currentCodeExecutionResult = { stdout, stderr, returnCode };
              setCodeExecutionResult(
                assistantMessageId,
                currentCodeExecutionResult,
                conversationId,
              );
              finishTool('code_execution', 'completed');
            }
          }

          const citationBlock = parsed.choices?.[0]?.delta?.[WEB_SEARCH_CITATION_DELTA_KEY] as
            | Partial<WebSearchCitationDeltaWire>
            | undefined;
          if (typeof citationBlock?.url === 'string' && typeof citationBlock.title === 'string') {
            appendMarkerOrderedCitation(citationBlock.url, citationBlock.title);
          }

          const searchResultsBlock = parsed.choices?.[0]?.delta?.x_search_results;
          if (searchResultsBlock?.content && Array.isArray(searchResultsBlock.content)) {
            const results = (searchResultsBlock.content as Record<string, unknown>[])
              .filter((r) => r['type'] === 'web_search_result' && r['url'])
              .map((r) => ({
                url: r['url'] as string,
                title: (r['title'] as string) || (r['url'] as string),
                snippet: (r['encrypted_content'] as string) || '',
              }));
            if (results.length > 0) {
              const merged = mergeSearchResults(results);
              if (merged && currentResearch) {
                currentResearch = { ...currentResearch, sourcesForRetry: merged };
                setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
              }
              if (searchResultsBlock.tool !== 'url_fetch') {
                upsertNativeWebSearchEntry({ sources: results, status: 'running' });
              }
            }
            if (searchResultsBlock.tool !== 'url_fetch') {
              finishTool('web_search', 'completed');
            }
          } else if (
            searchResultsBlock?.content &&
            typeof searchResultsBlock.content === 'object' &&
            !Array.isArray(searchResultsBlock.content) &&
            (searchResultsBlock.content as Record<string, unknown>)['type'] ===
              'web_search_tool_result_error'
          ) {
            const errorCode =
              ((searchResultsBlock.content as Record<string, unknown>)['error_code'] as
                | string
                | undefined) || 'unknown_error';
            finishTool('web_search', 'failed', `Web search failed: ${errorCode}`);
            upsertNativeWebSearchEntry({
              status: 'failed',
              error: `Web search failed: ${errorCode}`,
              completedAtMs: Date.now(),
            });
          }

          const toolResultBlock = parsed.choices?.[0]?.delta?.x_tool_result;
          if (toolResultBlock) {
            const { name, content, is_error } = toolResultBlock as {
              tool_call_id?: string;
              name?: string;
              content?: unknown;
              is_error?: boolean;
            };
            if (name) {
              let idx = findLastToolIndex(name, [
                'running',
                'completed',
                'awaiting_approval',
                'failed',
              ]);
              if (idx < 0) {
                const id = createToolId(name);
                toolStartTimes.set(id, Date.now());
                toolTimeline.push({ id, name, status: 'running' });
                idx = toolTimeline.length - 1;
              }
              const entry = toolTimeline[idx];
              if (entry) {
                const resultText =
                  typeof content === 'string'
                    ? content
                    : Array.isArray(content)
                      ? (content as Record<string, unknown>[])
                          .filter((c) => c['type'] === 'text')
                          .map((c) => c['text'] as string)
                          .join('\n')
                      : content != null
                        ? String(content)
                        : '';
                entry.result = resultText;
                entry.status = is_error ? 'failed' : 'completed';
                entry.error = is_error ? resultText : entry.error;
              }
              publishToolTimeline();
            }
          }

          {
            const incoming = parseGeneratedFilesDelta(
              parsed.choices?.[0]?.delta?.x_generated_files,
            ).map((f) => ({
              id: f.id,
              fileName: f.file_name,
              mimeType: f.mime_type,
              uri: f.uri,
              byteCount: f.byte_count,
              kind: f.kind,
              ...(f.checksum_sha256 ? { checksumSha256: f.checksum_sha256 } : {}),
              surface: f.surface,
              previewable: f.previewable,
            }));
            if (incoming.length > 0) {
              const merged = [...(currentGeneratedFiles ?? [])];
              for (const file of incoming) {
                const existing = merged.findIndex((m) => m.fileName === file.fileName);
                if (existing >= 0) merged[existing] = file;
                else merged.push(file);
              }
              currentGeneratedFiles = merged;
              patchMessageMeta({ generatedFiles: merged.map((f) => ({ ...f })) });
            }
          }

          if (parsed.choices?.[0]?.finish_reason || parsed.type === 'message_stop') {
            const reason = parsed.choices?.[0]?.finish_reason;
            if (typeof reason === 'string' && reason) {
              finishReason = reason;
            }
            coalescedAppends.flush();
            updateMessage(assistantMessageId, { isStreaming: false }, conversationId);
          }
        } catch {
          // Ignore parse errors for incomplete chunks.
        }
      }

      if (done) break;
    }

    flushContentBuffer(true);
    if (inThinkingBlock) {
      closeThinkingSegment();
      inThinkingBlock = false;
    }
    finishRunningTools();
    if (finishReason) {
      patchMessageMeta({ finishReason });
    }
    if (streamErrorInfo) {
      patchMessageMeta({ streamError: streamErrorInfo });
    }
    settleAgentActivity();
    publishCloudRunReference({
      state: finalCloudRunState(streamErrorInfo ? 'failed' : 'ready_for_review'),
    });
    persistAssistant(fullAssistantContent);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return { suspended, pendingCalls, runHandle };
  } catch (error) {
    const isAbort =
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'AbortError';
    let terminalError = error;

    if (!isAbort && runHandle) {
      try {
        return await replayDurableRun();
      } catch (replayError) {
        terminalError = replayError;
      }
    }

    if (currentAgentActivity) {
      const completedAtMs = Date.now();
      currentAgentActivity = finishAgentActivityLocally(currentAgentActivity, {
        status: isAbort ? 'cancelled' : 'failed',
        completedAtMs,
        ...(!isAbort ? { error: getVisibleErrorMessage(terminalError) } : {}),
      });
      patchMessageMeta({ agentActivity: currentAgentActivity });
    }

    if (isAbort) {
      flushContentBuffer(true);
    }

    const researchActive = currentResearch && currentResearch.phase !== 'complete';

    if (isAbort && !researchActive) {
      // The user stopped this turn, so the turn is stopped - whether or not
      // this particular request had produced any text yet. Gating the stamp on
      // new content meant a continuation stopped early kept no stopped marker,
      // so the message announced "Response complete" over partial text and lost
      // its Continue action, leaving only Regenerate.
      finishReason = 'stopped';
      patchMessageMeta({ finishReason });
      publishCloudRunReference({ state: 'cancelled' });
      if (fullAssistantContent || currentAgentActivity) {
        persistAssistant(fullAssistantContent);
      }
    }

    if (researchActive && isAbort) {
      currentResearch = { ...currentResearch!, phase: 'interrupted' };
      setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
      finishRunningTools();
      persistAssistant(fullAssistantContent);
    } else if (researchActive && !isAbort) {
      const errorMessage = getVisibleErrorMessage(terminalError);
      currentResearch = { ...currentResearch!, phase: 'error', error: errorMessage };
      setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
      finishRunningTools('failed', errorMessage);
      if (fullAssistantContent) {
        flushContentBuffer(true);
        const partialContent = `${fullAssistantContent}\n\n${buildAssistantErrorContent(errorMessage)}`;
        updateMessage(
          assistantMessageId,
          { isStreaming: false, content: partialContent, error: true },
          conversationId,
        );
        persistAssistant(partialContent);
        useChatStore.getState().setError(errorMessage, conversationId);
        stopStreaming(conversationId);
        setLoading(false, conversationId);
        return { suspended, pendingCalls, runHandle };
      }
    }
    flushContentBuffer(true);
    if (inThinkingBlock) {
      closeThinkingSegment();
      inThinkingBlock = false;
    }
    throw terminalError;
  } finally {
    markFirstStreamActivitySeen();
    coalescedAppends.flush();
    await reader.cancel().catch(() => undefined);
  }
}

export function useChatStream(): UseChatStreamReturn {
  const { getToken } = useAuth();
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const activeRunsRef = useRef<
    Map<string, ManagedCloudAgentRunHandle & { assistantMessageId: string }>
  >(new Map());

  // streamingConversationIds only flips after the auth-token await below, so it
  // cannot stop a second click that arrives inside that gap. Claim the
  // conversation synchronously instead, or a double-click bills two runs.
  const continuationClaimsRef = useRef<Set<string>>(new Set());

  const abortConversation = useCallback((conversationId: string): void => {
    const controller = abortControllersRef.current.get(conversationId);
    if (!controller) return;
    abortControllersRef.current.delete(conversationId);
    controller.abort();
  }, []);

  const beginConversationRequest = useCallback(
    (conversationId: string): AbortController => {
      abortConversation(conversationId);
      const controller = new AbortController();
      abortControllersRef.current.set(conversationId, controller);
      return controller;
    },
    [abortConversation],
  );

  const endConversationRequest = useCallback(
    (conversationId: string, controller: AbortController): void => {
      if (abortControllersRef.current.get(conversationId) === controller) {
        abortControllersRef.current.delete(conversationId);
      }
    },
    [],
  );

  const addMessage = useChatStore((state) => state.addMessage);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const startStreaming = useChatStore((state) => state.startStreaming);
  const stopStreaming = useChatStore((state) => state.stopStreaming);
  const setLoading = useChatStore((state) => state.setLoading);
  const setError = useChatStore((state) => state.setError);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const isStreaming = useChatStore(selectIsActiveConversationStreaming);

  useEffect(() => {
    return () => {
      // intentionally empty: preserve controller across unmount
    };
  }, []);

  const resolveToolApproval = useResolveToolApproval(abortControllersRef);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}): Promise<boolean> => {
      if (!content.trim() && !options.attachments?.length) return false;

      let conversationId = options.conversationId || useChatStore.getState().activeConversationId;
      if (!conversationId) {
        console.error('[useChatStream] No conversation ID available');
        setError('No active conversation. Please create a new conversation first.');
        return false;
      }

      const model = options.model || selectedModel;
      const sendReplay = createSendReplayMetadata({
        webSearchEnabled: options.webSearch,
        thinkingEnabled: options.thinkingEnabled,
        codeExecutionEnabled: options.codeExecution,
        officeCreationEnabled: options.officeCreation,
        workMode: options.workMode,
        styleMode: options.styleMode,
        hasSkillInstruction: Boolean(options.skillName),
        ...(options.skillName ? { skillName: options.skillName } : {}),
      });
      const persistedAttachments = durableAttachmentDescriptors(options.attachments);
      const userMetadata: MessageMetadata | undefined =
        sendReplay || persistedAttachments
          ? {
              ...(sendReplay ? { sendReplay } : {}),
              ...(persistedAttachments ? { attachments: persistedAttachments } : {}),
            }
          : undefined;
      const getAuthToken: AuthTokenProvider = async () => {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        return token;
      };
      void getCsrfToken().catch(() => undefined);

      // Regenerate answers a user message that is already here, so this send
      // creates no user message at all: the new answer becomes a sibling of the
      // old one under the same question.
      const regenerateParentId = options.regenerateParentMessageId;
      // Stamping local parents is what gives the row about to be written
      // something to branch FROM, so it has to run before that row exists and
      // only when this write really does branch. An edit always does, the root
      // included; a regenerate only when the question already has an answer.
      const branchesFromSibling = regenerateParentId
        ? regenerateCreatesSibling(conversationId, regenerateParentId)
        : options.userMessageParentId !== undefined;
      if (branchesFromSibling) {
        useChatStore.getState().ensureLocalThreadParents(conversationId);
      }
      // Where the visible path has to go back to if this turn never commits.
      const restoreLeafId = readActiveLeaf(conversationId);

      const userMessageId = regenerateParentId ?? resolveClientMessageId(options.userMessageId);
      // The row the answer hangs off. It is the user message id until the server
      // hands back a different one, and a tree that kept naming the old id would
      // orphan the answer from the question it belongs to.
      let turnAnchorId = userMessageId;
      const userMessageParentId = regenerateParentId
        ? undefined
        : resolveUserMessageParentId(conversationId, options.userMessageParentId);
      const threadsThisWrite = !regenerateParentId && userMessageParentId !== undefined;

      const isTemporaryConversation = Boolean(
        useChatStore
          .getState()
          .conversations.find((conversation) => conversation.id === conversationId)?.isTemporary,
      );
      const reportTurnCommitted = () => {
        try {
          options.onTurnCommitted?.();
        } catch (callbackError) {
          logger.warn('[useChatStream] onTurnCommitted callback threw', {
            error: getVisibleErrorMessage(callbackError),
          });
        }
      };

      // Everything below is synchronous: the user bubble and the assistant
      // placeholder both paint before the first await, so the turn is on
      // screen in the same frame as the click. Persistence is reconciled
      // once the network catches up.
      // A conversation later stamped into a tree chains rows by (createdAt, id)
      // (stampLinearParents), and this pair is built synchronously in the same
      // tick: two Date.now() calls a few statements apart can land on the same
      // millisecond, at which point the id tiebreak is a coin flip and can chain
      // the parent onto its own child. userMessageStartedAtMs floors the
      // assistant placeholder's timestamp one millisecond past its question's.
      const userMessageStartedAtMs = Date.now();
      if (!regenerateParentId) {
        const userMessage: Message = {
          id: userMessageId,
          role: 'user',
          content: content.trim(),
          createdAt: new Date(userMessageStartedAtMs).toISOString(),
          attachments: options.attachments,
          metadata: userMetadata,
          ...(threadsThisWrite ? { parentId: userMessageParentId } : {}),
        };
        addMessage(userMessage, conversationId);
        if (threadsThisWrite) {
          useChatStore.getState().setActiveLeaf(conversationId, userMessageId);
        }
      }

      const abortController = beginConversationRequest(conversationId);

      const assistantMessageId = resolveClientMessageId(options.assistantMessageId);
      let assistantParentId = resolveAssistantParentId(conversationId, turnAnchorId);
      const assistantStartedAtMs = regenerateParentId
        ? Date.now()
        : Math.max(Date.now(), userMessageStartedAtMs + 1);
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date(assistantStartedAtMs).toISOString(),
        model,
        isStreaming: true,
        ...(assistantParentId ? { parentId: assistantParentId } : {}),
        metadata: {
          ...(options.webSearch ? { webSearchRequested: true } : {}),
          agentActivity: startAgentActivityLocally({
            sessionId: conversationId,
            turnId: assistantMessageId,
            summary:
              options.workMode === 'agiwork'
                ? 'Starting AGI Work'
                : deriveAgentActivityLabel({
                    kind: 'idle',
                    modelName: getModelMetadataById(model)?.name,
                  }),
            startedAtMs: assistantStartedAtMs,
          }),
        },
      };
      addMessage(assistantMessage, conversationId);
      // The placeholder is the end of the path now, or a regenerated answer
      // would stream into a row the transcript is not showing.
      if (assistantParentId) {
        useChatStore.getState().setActiveLeaf(conversationId, assistantMessageId);
      }
      startStreaming(assistantMessageId, conversationId);
      setLoading(true, conversationId);
      setError(null, conversationId);

      const turnConversationId = conversationId;
      const abandonTurn = () => {
        stopStreaming(turnConversationId);
        setLoading(false, turnConversationId);
        deleteMessage(assistantMessageId, turnConversationId);
        useChatStore
          .getState()
          .setActiveLeaf(turnConversationId, regenerateParentId ? restoreLeafId : userMessageId);
        endConversationRequest(turnConversationId, abortController);
      };

      if (options.ensureConversationId) {
        let realConversationId: string | null = null;
        try {
          realConversationId = await options.ensureConversationId();
        } catch {
          realConversationId = null;
        }
        if (!realConversationId) {
          abandonTurn();
          setError('Could not start the conversation.', conversationId);
          return false;
        }
        if (realConversationId !== conversationId) {
          if (abortControllersRef.current.get(conversationId) === abortController) {
            abortControllersRef.current.delete(conversationId);
            abortControllersRef.current.set(realConversationId, abortController);
          }
          useChatStore.getState().renameConversationId(conversationId, realConversationId);
          conversationId = realConversationId;
        }
      }

      try {
        await getAuthToken();
      } catch {
        abandonTurn();
        setError('Your session has expired. Please sign in again.', conversationId);
        return false;
      }

      if (regenerateParentId) {
        reportTurnCommitted();
      } else if (!isTemporaryConversation) {
        try {
          const saved = await saveMessageToDb(
            conversationId,
            {
              id: userMessageId,
              role: 'user',
              content: content.trim(),
              metadata: userMetadata,
              ...(threadsThisWrite ? { parentId: userMessageParentId } : {}),
            },
            getAuthToken,
          );
          if (saved.id !== userMessageId) {
            updateMessage(userMessageId, { id: saved.id }, conversationId);
            turnAnchorId = saved.id;
            if (threadsThisWrite) {
              useChatStore.getState().setActiveLeaf(conversationId, saved.id);
            }
            if (assistantParentId) {
              assistantParentId = saved.id;
              updateMessage(assistantMessageId, { parentId: saved.id }, conversationId);
            }
          }
          reportTurnCommitted();
        } catch (error) {
          notifyPersistenceFailure('user', error);
          abandonTurn();
          setError('Your message was not saved, so no model was called.', conversationId);
          return false;
        }
      } else {
        reportTurnCommitted();
      }

      let retriedEmptyTurn = false;
      try {
        for (;;) {
          const currentMessages = readConversationMessages(conversationId);

          const apiMessages: ApiMessage[] = currentMessages
            .filter((m) => m.id !== assistantMessageId)
            .flatMap((m) => {
              const turn: ApiMessage = { role: m.role, content: buildApiMessageContent(m) };
              const settled = settledInteractiveCardTurn(m);
              return settled ? [turn, settled] : [turn];
            });

          if (options.styleInstruction) {
            apiMessages.unshift({ role: 'system', content: options.styleInstruction });
          } else if (options.styleMode && options.styleMode !== 'normal') {
            const styleInstruction = STYLE_SYSTEM_INSTRUCTIONS[options.styleMode];
            if (styleInstruction) {
              apiMessages.unshift({ role: 'system', content: styleInstruction });
            }
          }

          const headers = await addCsrfHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getAuthToken()}`,
            'X-AGI-Surface': 'web',
            'Idempotency-Key': createManagedChatIdempotencyKey({
              surface: 'web',
              purpose: 'send',
              operationId: retriedEmptyTurn ? `${assistantMessageId}-retry` : assistantMessageId,
            }),
          });
          const thinkingState = useThinkingStore.getState();
          const requestedThinking = options.thinkingEnabled ?? thinkingState.enabled;
          const selectedModelMetadata = getModelMetadataById(model);
          const modelCanThink = selectedModelMetadata?.capabilities.thinking ?? true;
          const thinkingEnabled = modelCanThink ? requestedThinking : undefined;
          const thinkingEffort = options.thinkingEffort ?? thinkingState.effort;
          const reasoningRequest = selectedModelMetadata?.reasoning?.request;
          const supportsEffort = selectedModelMetadata
            ? Boolean(reasoningRequest?.effortPath || reasoningRequest?.responsesEffortPath)
            : true;
          const resolvedEffort = selectedModelMetadata
            ? resolveModelEffort(model, thinkingEffort)
            : thinkingEffort;
          const sendsEffortWithoutThinking =
            selectedModelMetadata?.reasoning?.control === 'effort_levels';
          const response = await fetch('/api/llm/v1/chat/completions', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              messages: apiMessages,
              conversation_id: conversationId,
              assistant_message_id: assistantMessageId,
              stream: true,
              [INTERACTIVE_CARD_REQUEST_KEY]: WEB_INTERACTIVE_CARD_CAPABILITY,
              temperature: options.temperature,
              max_tokens: options.maxTokens,
              web_search: options.webSearch || options.research || undefined,
              web_fetch: options.webFetch || undefined,
              research: options.research || undefined,
              research_resume:
                options.research && options.researchResume
                  ? {
                      sources: options.researchResume.sources,
                      steps: options.researchResume.steps,
                      ...(options.researchResume.approvedSteps?.length
                        ? { approved_steps: options.researchResume.approvedSteps }
                        : {}),
                    }
                  : undefined,
              code_execution: options.codeExecution || undefined,
              office_creation: options.officeCreation || undefined,
              skill_name: options.skillName,
              disabled_connector_ids: options.disabledConnectorIds?.length
                ? options.disabledConnectorIds
                : undefined,
              memory_enabled: options.memoryEnabled === false ? false : undefined,
              mcp_context: options.mcpContext
                ? {
                    ...(options.mcpContext.prompt ? { prompt: options.mcpContext.prompt } : {}),
                    ...(options.mcpContext.resources
                      ? {
                          resources: options.mcpContext.resources.map(({ connectorId, uri }) => ({
                            connectorId,
                            uri,
                          })),
                        }
                      : {}),
                  }
                : undefined,
              work_mode: options.workMode,
              agi_work_goal: options.workMode === 'agiwork' ? options.agiWorkGoal : undefined,
              thinking_mode: thinkingEnabled,
              effort:
                supportsEffort && resolvedEffort && (thinkingEnabled || sendsEffortWithoutThinking)
                  ? resolvedEffort
                  : undefined,
              client_timezone: getBrowserTimeZone(),
              use_prompt_cache: true,
            }),
            signal: abortController.signal,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const { message, code, recovery, retryAt } = readChatApiErrorPayload(
              errorData,
              `Request failed: ${response.status}`,
            );
            throw new ChatApiError(message, {
              code,
              status: response.status,
              resetAt: readErrorResetAt(errorData, response),
              ...(recovery ? { recovery } : {}),
              ...(retryAt ? { retryAt } : {}),
            });
          }

          const resolvedModel = response.headers.get('X-AGI-Resolved-Model')?.trim() || model;
          if (resolvedModel !== model) {
            updateMessage(assistantMessageId, { model: resolvedModel }, conversationId);
          }

          const outcome = await consumeAssistantStream({
            response,
            assistantMessageId,
            model: resolvedModel,
            conversationId,
            isTemporaryConversation,
            getAuthToken,
            ...(assistantParentId ? { assistantParentId } : {}),
            onRunHandle: (handle) => {
              if (handle) {
                activeRunsRef.current.set(conversationId, { ...handle, assistantMessageId });
              } else {
                activeRunsRef.current.delete(conversationId);
              }
            },
          });

          if (outcome.suspended && outcome.pendingCalls.length > 0) {
            if (!outcome.runHandle) {
              throw new Error('The managed agent did not return a durable run handle.');
            }
            pendingTurns.set(assistantMessageId, {
              runId: outcome.runHandle.runId,
              model,
              conversationId,
              isTemporaryConversation,
              calls: outcome.pendingCalls,
              decisions: new Map(),
              resolving: false,
            });
            autoResolvePendingApprovals(
              assistantMessageId,
              outcome.pendingCalls,
              resolveToolApproval,
            );
            break;
          }

          // ChatGPT parity: a turn that ends with no content, no tool call and
          // no error gets one silent retry (same request, same conversation, no
          // duplicate user message) before the reader ever sees the "model
          // finished without returning a response" card.
          if (
            !retriedEmptyTurn &&
            isEmptyAssistantTurn(findConversationMessage(conversationId, assistantMessageId), model)
          ) {
            retriedEmptyTurn = true;
            beginEmptyTurnRetry(
              conversationId,
              assistantMessageId,
              findConversationMessage(conversationId, assistantMessageId)?.metadata,
              updateMessage,
            );
            startStreaming(assistantMessageId, conversationId);
            setLoading(true, conversationId);
            continue;
          }

          break;
        }
      } catch (error) {
        // CAP-040: a turn interrupted by an expired session was unrecoverable.
        // The composer clears on send, so by the time the 401 came back the
        // user's text survived only as a failed turn in the transcript, sign
        // back in and you retype it.
        if (isSessionExpiredError(error)) {
          parkUnsentDraft(conversationId, content);
        }
        await handleStreamError(error, {
          assistantMessageId,
          model,
          conversationId,
          isTemporaryConversation,
          getAuthToken,
          setError,
          stopStreaming,
          setLoading,
          updateMessage,
          ...(assistantParentId ? { variantRestore: { previousLeafId: restoreLeafId } } : {}),
        });
      } finally {
        if (activeRunsRef.current.get(conversationId)?.assistantMessageId === assistantMessageId) {
          activeRunsRef.current.delete(conversationId);
        }
        endConversationRequest(conversationId, abortController);
      }
      return true;
    },
    [
      selectedModel,
      addMessage,
      deleteMessage,
      updateMessage,
      startStreaming,
      stopStreaming,
      setLoading,
      setError,
      getToken,
      resolveToolApproval,
      beginConversationRequest,
      endConversationRequest,
    ],
  );

  const continueGeneration = useCallback(
    async (assistantMessageId: string) => {
      const store = useChatStore.getState();
      const conversationId = store.activeConversationId;
      if (conversationId && store.streamingConversationIds.includes(conversationId)) return;
      if (conversationId && continuationClaimsRef.current.has(conversationId)) return;
      const conversationMessages = conversationId
        ? readConversationMessages(conversationId)
        : store.messages;
      const messageIndex = conversationMessages.findIndex((m) => m.id === assistantMessageId);
      const message = messageIndex >= 0 ? conversationMessages[messageIndex] : undefined;
      const resumingCard = hasResumableInteractiveCard(message);
      if (!message || (!isMessageContinuable(message) && !resumingCard)) return;

      if (!conversationId) {
        setError('No active conversation. Please create a new conversation first.');
        return;
      }
      continuationClaimsRef.current.add(conversationId);
      try {
        const isTemporaryConversation = Boolean(
          store.conversations.find((conversation) => conversation.id === conversationId)
            ?.isTemporary,
        );
        const model = message.model || selectedModel;

        const getAuthToken: AuthTokenProvider = async () => {
          const token = await getToken();
          if (!token) throw new Error('Not authenticated');
          return token;
        };
        let authToken: string;
        try {
          authToken = await getAuthToken();
        } catch {
          setError('Not authenticated', conversationId);
          return;
        }

        const abortController = beginConversationRequest(conversationId);

        const apiMessages: ApiMessage[] = conversationMessages
          .slice(0, messageIndex + 1)
          .flatMap((m) => {
            const turn: ApiMessage = { role: m.role, content: m.content as MessageContent };
            const settled = settledInteractiveCardTurn(m);
            return settled ? [turn, settled] : [turn];
          });
        if (!resumingCard) {
          apiMessages.push({ role: 'user', content: CONTINUE_GENERATION_INSTRUCTION });
        }

        const seedContent = message.content;
        const seedTools = message.metadata?.tools?.map((t) => ({ ...t }));
        const priorMetadata = message.metadata;

        updateMessage(
          assistantMessageId,
          { isStreaming: true, metadata: { ...priorMetadata, finishReason: undefined } },
          conversationId,
        );
        startStreaming(assistantMessageId, conversationId);
        setLoading(true, conversationId);
        setError(null, conversationId);

        try {
          const continuationOperationId = crypto.randomUUID();
          const headers = await addCsrfHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            'X-AGI-Surface': 'web',
            'Idempotency-Key': createManagedChatIdempotencyKey({
              surface: 'web',
              purpose: 'continue',
              operationId: continuationOperationId,
            }),
          });
          const response = await fetch('/api/llm/v1/chat/completions', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              messages: apiMessages,
              conversation_id: conversationId,
              assistant_message_id: assistantMessageId,
              stream: true,
              use_prompt_cache: true,
            }),
            signal: abortController.signal,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const {
              message: errMessage,
              code,
              recovery,
              retryAt,
            } = readChatApiErrorPayload(errorData, `Request failed: ${response.status}`);
            throw new ChatApiError(errMessage, {
              code,
              status: response.status,
              resetAt: readErrorResetAt(errorData, response),
              ...(recovery ? { recovery } : {}),
              ...(retryAt ? { retryAt } : {}),
            });
          }

          await consumeAssistantStream({
            response,
            assistantMessageId,
            model: response.headers.get('X-AGI-Resolved-Model')?.trim() || model,
            conversationId,
            isTemporaryConversation,
            getAuthToken,
            seedContent,
            seedTools,
            onRunHandle: (handle) => {
              if (handle) {
                activeRunsRef.current.set(conversationId, { ...handle, assistantMessageId });
              } else {
                activeRunsRef.current.delete(conversationId);
              }
            },
          });
        } catch (error) {
          const isAbort =
            typeof error === 'object' &&
            error !== null &&
            (error as { name?: unknown }).name === 'AbortError';
          if (isAbort) {
            updateMessage(assistantMessageId, { isStreaming: false }, conversationId);
            stopStreaming(conversationId);
            setLoading(false, conversationId);
            return;
          }

          const errorMessage = getVisibleErrorMessage(error);
          const errorCode = error instanceof ChatApiError ? error.code : undefined;

          if (isFreeTrialErrorCode(errorCode)) {
            if (errorCode === 'free_trial_token_budget_reached') {
              useFreeTrialStore.getState().markLimitReached();
            }
            updateMessage(
              assistantMessageId,
              { isStreaming: false, metadata: priorMetadata },
              conversationId,
            );
            setError(errorMessage, conversationId);
            stopStreaming(conversationId);
            setLoading(false, conversationId);
            return;
          }

          const streamedSoFar =
            findConversationMessage(conversationId, assistantMessageId)?.content ?? seedContent;
          const mergedContent = `${streamedSoFar}\n\n${buildAssistantErrorContent(errorMessage)}`;
          updateMessage(
            assistantMessageId,
            { isStreaming: false, content: mergedContent, error: true },
            conversationId,
          );
          setError(errorMessage, conversationId);
          if (!isTemporaryConversation) {
            saveMessageToDb(
              conversationId,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: mergedContent,
                model,
                metadata: { ...priorMetadata, finishReason: undefined },
              },
              getAuthToken,
            ).catch((err) => notifyPersistenceFailure('assistant', err));
          }
          stopStreaming(conversationId);
          setLoading(false, conversationId);
        } finally {
          if (
            activeRunsRef.current.get(conversationId)?.assistantMessageId === assistantMessageId
          ) {
            activeRunsRef.current.delete(conversationId);
          }
          endConversationRequest(conversationId, abortController);
        }
      } finally {
        continuationClaimsRef.current.delete(conversationId);
      }
    },
    [
      selectedModel,
      updateMessage,
      startStreaming,
      stopStreaming,
      setLoading,
      setError,
      getToken,
      beginConversationRequest,
      endConversationRequest,
    ],
  );

  const resumeInteractiveCardTurn = useCallback(
    async (assistantMessageId: string, options: { force?: boolean } = {}): Promise<void> => {
      const store = useChatStore.getState();
      const conversationId = store.activeConversationId;
      if (!conversationId) return;
      const message = findConversationMessage(conversationId, assistantMessageId);
      if (!message || !hasResumableInteractiveCard(message)) return;
      if (message.metadata?.interactiveCardsResumed && !options.force) return;

      const nextMetadata: MessageMetadata = { ...message.metadata, interactiveCardsResumed: true };
      updateMessage(assistantMessageId, { metadata: nextMetadata }, conversationId);

      const isTemporaryConversation = Boolean(
        store.conversations.find((conversation) => conversation.id === conversationId)?.isTemporary,
      );
      if (!isTemporaryConversation) {
        try {
          const token = await getToken();
          if (token) {
            await saveMessageToDb(
              conversationId,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: message.content || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
                model: message.model,
                metadata: nextMetadata,
              },
              async () => token,
            );
          }
        } catch (error) {
          notifyPersistenceFailure('assistant', error);
        }
      }

      await continueGeneration(assistantMessageId);
    },
    [continueGeneration, updateMessage, getToken],
  );

  const stopGeneration = useCallback(
    (conversationId?: string) => {
      const targetConversationId = conversationId ?? useChatStore.getState().activeConversationId;
      if (!targetConversationId) return;

      const activeRun = activeRunsRef.current.get(targetConversationId);
      activeRunsRef.current.delete(targetConversationId);
      abortConversation(targetConversationId);

      if (activeRun) {
        const client = createManagedCloudAgentRunClient({
          getAuthToken: getToken,
          decorateMutationHeaders: addCsrfHeaders,
        });
        void client.cancelRun(activeRun.runId).catch(() => {
          toast.error('Could not stop the Cloud task. Check its activity before retrying.');
        });
      }
      stopStreaming(targetConversationId);
      setLoading(false, targetConversationId);
    },
    [getToken, stopStreaming, setLoading, abortConversation],
  );

  return {
    sendMessage,
    stopGeneration,
    continueGeneration,
    resumeInteractiveCardTurn,
    resolveToolApproval,
    isStreaming,
  };
}

export function useResolveToolApproval(
  sharedAbortControllers: MutableRefObject<Map<string, AbortController>>,
): UseChatStreamReturn['resolveToolApproval'] {
  const { getToken } = useAuth();
  const abortControllers = sharedAbortControllers;

  return useCallback(
    async function resolveToolApproval(
      assistantMessageId: string,
      toolCallId: string,
      decision: ToolApprovalDecision,
      guidance?: string,
    ): Promise<void> {
      const store = useChatStore.getState();
      const {
        startStreaming,
        stopStreaming,
        setLoading,
        setError,
        updateMessage,
        updateToolEntry,
      } = store;

      const turn = pendingTurns.get(assistantMessageId) ?? restorePendingTurn(assistantMessageId);
      if (!turn || turn.resolving) return;
      if (!turn.calls.some((c) => c.toolCallId === toolCallId)) return;

      turn.decisions.set(toolCallId, decision);
      const trimmedGuidance = guidance?.trim();
      if (trimmedGuidance) {
        turn.guidance = turn.guidance ? `${turn.guidance}\n\n${trimmedGuidance}` : trimmedGuidance;
      }

      updateToolEntry(
        assistantMessageId,
        toolCallId,
        { approved: decision === 'approved', requiresApproval: true },
        turn.conversationId,
      );

      const selectedMessage = findConversationMessage(turn.conversationId, assistantMessageId);
      const selectedMetadata: MessageMetadata = {
        ...selectedMessage?.metadata,
        cloudApproval: projectPendingTurn(turn),
      };
      updateMessage(assistantMessageId, { metadata: selectedMetadata }, turn.conversationId);

      const getAuthToken: AuthTokenProvider = async () => {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        return token;
      };
      if (!turn.isTemporaryConversation && selectedMessage) {
        await saveMessageToDb(
          turn.conversationId,
          {
            id: assistantMessageId,
            role: selectedMessage.role,
            content: selectedMessage.content || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
            model: selectedMessage.model ?? turn.model,
            metadata: selectedMetadata,
          },
          getAuthToken,
        ).catch((error) => notifyPersistenceFailure('assistant', error));
      }

      if (turn.decisions.size < turn.calls.length) return;
      if (turn.resolving) return;
      turn.resolving = true;

      for (const call of turn.calls) {
        const callDecision = turn.decisions.get(call.toolCallId) ?? 'rejected';
        updateToolEntry(
          assistantMessageId,
          call.toolCallId,
          {
            approved: callDecision === 'approved',
            status: callDecision === 'approved' ? 'running' : 'failed',
            requiresApproval: false,
            ...(callDecision === 'rejected'
              ? {
                  error: 'You denied this tool.',
                  result: 'The user denied permission to run this tool.',
                }
              : {}),
          },
          turn.conversationId,
        );
      }

      let authToken: string;
      try {
        authToken = await getAuthToken();
      } catch {
        turn.resolving = false;
        for (const call of turn.calls) {
          updateToolEntry(
            assistantMessageId,
            call.toolCallId,
            {
              approved: turn.decisions.get(call.toolCallId) === 'approved',
              status: 'awaiting_approval',
              requiresApproval: true,
              error: undefined,
              result: undefined,
            },
            turn.conversationId,
          );
        }
        setError('Not authenticated', turn.conversationId);
        return;
      }

      const previousController = abortControllers.current.get(turn.conversationId);
      if (previousController) {
        abortControllers.current.delete(turn.conversationId);
        previousController.abort();
      }
      const abortController = new AbortController();
      abortControllers.current.set(turn.conversationId, abortController);

      const assistantContent =
        findConversationMessage(turn.conversationId, assistantMessageId)?.content ?? '';
      const toolApprovals = turn.calls.map((c) => ({
        tool_call_id: c.toolCallId,
        decision: turn.decisions.get(c.toolCallId) ?? 'rejected',
      }));

      const seedTools = findConversationMessage(turn.conversationId, assistantMessageId)?.metadata
        ?.tools;

      startStreaming(assistantMessageId, turn.conversationId);
      setLoading(true, turn.conversationId);
      setError(null, turn.conversationId);

      try {
        const resumeOperationId = crypto.randomUUID();
        const headers = await addCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'X-AGI-Surface': 'web',
          'Idempotency-Key': createManagedChatIdempotencyKey({
            surface: 'web',
            purpose: 'tool-resume',
            operationId: resumeOperationId,
          }),
        });
        const response = await fetch(TOOL_APPROVAL_RESUME_PATH, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            run_id: turn.runId,
            tool_approvals: toolApprovals,
            ...(turn.guidance ? { guidance: turn.guidance } : {}),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const { message, code, recovery, retryAt } = readChatApiErrorPayload(
            errorData,
            `Resume failed: ${response.status}`,
          );
          throw new ChatApiError(message, {
            code,
            status: response.status,
            resetAt: readErrorResetAt(errorData, response),
            ...(recovery ? { recovery } : {}),
            ...(retryAt ? { retryAt } : {}),
          });
        }

        const outcome = await consumeAssistantStream({
          response,
          assistantMessageId,
          model: response.headers.get('X-AGI-Resolved-Model')?.trim() || turn.model,
          conversationId: turn.conversationId,
          isTemporaryConversation: turn.isTemporaryConversation,
          getAuthToken,
          seedContent: assistantContent,
          seedTools: seedTools ? seedTools.map((t) => ({ ...t })) : undefined,
        });

        if (outcome.suspended && outcome.pendingCalls.length > 0) {
          if (!outcome.runHandle) {
            throw new Error('The managed agent continuation lost its durable run handle.');
          }
          pendingTurns.set(assistantMessageId, {
            runId: outcome.runHandle.runId,
            model: turn.model,
            conversationId: turn.conversationId,
            isTemporaryConversation: turn.isTemporaryConversation,
            calls: outcome.pendingCalls,
            decisions: new Map(),
            resolving: false,
          });
          autoResolvePendingApprovals(
            assistantMessageId,
            outcome.pendingCalls,
            resolveToolApproval,
          );
        } else {
          pendingTurns.delete(assistantMessageId);
        }
      } catch (error) {
        if (error instanceof ChatApiError) {
          turn.resolving = false;
          for (const call of turn.calls) {
            const callDecision = turn.decisions.get(call.toolCallId);
            updateToolEntry(
              assistantMessageId,
              call.toolCallId,
              {
                approved: callDecision === undefined ? undefined : callDecision === 'approved',
                status: 'awaiting_approval',
                requiresApproval: true,
                error: undefined,
                result: undefined,
              },
              turn.conversationId,
            );
          }
          updateMessage(assistantMessageId, { isStreaming: false }, turn.conversationId);
          setError(getVisibleErrorMessage(error), turn.conversationId);
          stopStreaming(turn.conversationId);
          setLoading(false, turn.conversationId);
          return;
        }
        pendingTurns.delete(assistantMessageId);
        await handleStreamError(error, {
          assistantMessageId,
          model: turn.model,
          conversationId: turn.conversationId,
          isTemporaryConversation: turn.isTemporaryConversation,
          getAuthToken,
          setError,
          stopStreaming,
          setLoading,
          updateMessage,
        });
      } finally {
        if (abortControllers.current.get(turn.conversationId) === abortController) {
          abortControllers.current.delete(turn.conversationId);
        }
      }
    },
    [abortControllers, getToken],
  );
}

interface StreamErrorContext {
  assistantMessageId: string;
  model: string;
  conversationId: string;
  isTemporaryConversation: boolean;
  getAuthToken: AuthTokenProvider;
  setError: (message: string | null, conversationId?: string) => void;
  stopStreaming: (conversationId?: string) => void;
  setLoading: (loading: boolean, conversationId?: string) => void;
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string) => void;
  /**
   * Present only for a turn that created a sibling. A variant that produced
   * nothing has no reason to exist: the answer it was going to sit beside is
   * still there, so the placeholder goes and the path returns to the leaf named
   * here rather than leaving "Error: …" behind a pager. Partial content is kept
   *, a half-written variant is still something the reader can page back to.
   */
  variantRestore?: { previousLeafId: string | null };
}

async function handleStreamError(error: unknown, ctx: StreamErrorContext): Promise<void> {
  const {
    assistantMessageId,
    model,
    conversationId,
    isTemporaryConversation,
    getAuthToken,
    setError,
    stopStreaming,
    setLoading,
    updateMessage,
  } = ctx;

  const isAbort =
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError';
  const currentMessage = findConversationMessage(conversationId, assistantMessageId);
  const currentActivity = currentMessage?.metadata?.agentActivity;
  if (isAbort) {
    const cancelledMetadata: MessageMetadata = {
      ...currentMessage?.metadata,
      finishReason: 'stopped',
      ...(currentActivity
        ? {
            agentActivity: finishAgentActivityLocally(currentActivity, {
              status: 'cancelled',
              completedAtMs: Date.now(),
            }),
          }
        : {}),
    };
    updateMessage(
      assistantMessageId,
      { isStreaming: false, metadata: cancelledMetadata },
      conversationId,
    );
    if (!isTemporaryConversation && currentMessage) {
      await saveMessageToDb(
        conversationId,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: currentMessage.content || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
          model: currentMessage.model ?? model,
          metadata: cancelledMetadata,
        },
        getAuthToken,
      ).catch((err) => notifyPersistenceFailure('assistant', err));
    }
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return;
  }

  const errorMessage = getVisibleErrorMessage(error);

  // Nothing streamed, so consumeAssistantStream persisted nothing and the row
  // only exists on screen. Dropping it here keeps both sides agreeing that the
  // variant was never created.
  if (ctx.variantRestore && !currentMessage?.content) {
    const store = useChatStore.getState();
    store.deleteMessage(assistantMessageId, conversationId);
    store.setActiveLeaf(conversationId, ctx.variantRestore.previousLeafId);
    setError(errorMessage, conversationId);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return;
  }

  const failing = findConversationMessage(conversationId, assistantMessageId)?.metadata?.tools;
  if (failing && failing.some((t) => t.status === 'pending' || t.status === 'running')) {
    useChatStore.getState().setToolTimeline(
      assistantMessageId,
      failing.map((t) =>
        t.status === 'pending' || t.status === 'running'
          ? { ...t, status: 'failed' as const, error: errorMessage }
          : { ...t },
      ),
      conversationId,
    );
  }

  const errorCode = error instanceof ChatApiError ? error.code : undefined;

  const subscription = useBillingStore.getState().subscription;
  const paywall = resolveQuotaPaywallSlot({
    code: errorCode,
    message: errorMessage,
    planTier: subscription?.tier,
    subscriptionSource: subscription?.subscription_source,
    ...(error instanceof ChatApiError && error.recovery.length > 0
      ? { recovery: error.recovery }
      : {}),
    ...(error instanceof ChatApiError && error.resetAt ? { resetAt: error.resetAt } : {}),
    ...(error instanceof ChatApiError && error.retryAt ? { retryAt: error.retryAt } : {}),
  });
  if (paywall) {
    if (errorCode === 'free_trial_token_budget_reached') {
      useFreeTrialStore.getState().markLimitReached();
    }
    updateMessage(
      assistantMessageId,
      { isStreaming: false, content: '', error: false, metadata: { paywall } },
      conversationId,
    );
    setError(errorMessage, conversationId);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return;
  }

  const priorContent = currentMessage?.content;
  const errorContent = priorContent
    ? `${priorContent}\n\n${buildAssistantErrorContent(errorMessage)}`
    : buildAssistantErrorContent(errorMessage);
  const freshMetadata = findConversationMessage(conversationId, assistantMessageId)?.metadata;
  updateMessage(
    assistantMessageId,
    {
      isStreaming: false,
      content: errorContent,
      error: true,
      metadata: {
        ...freshMetadata,
        isExecutingCode: false,
        isSearching: false,
        ...(errorCode ? { errorCode } : {}),
        ...(currentActivity
          ? {
              agentActivity: finishAgentActivityLocally(currentActivity, {
                status: 'failed',
                completedAtMs: Date.now(),
                error: errorMessage,
              }),
            }
          : {}),
      },
    },
    conversationId,
  );
  setError(errorMessage, conversationId);

  if (!isTemporaryConversation) {
    const metadata = findConversationMessage(conversationId, assistantMessageId)?.metadata;
    saveMessageToDb(
      conversationId,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: errorContent,
        model,
        metadata,
      },
      getAuthToken,
    )
      .then((saved) => {
        if (saved?.id && saved.id !== assistantMessageId) {
          updateMessage(assistantMessageId, { id: saved.id }, conversationId);
        }
      })
      .catch((err) => notifyPersistenceFailure('assistant', err));
  }

  stopStreaming(conversationId);
  setLoading(false, conversationId);
}
