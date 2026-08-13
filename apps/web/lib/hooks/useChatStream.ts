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
} from '@agiworkforce/types';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
import {
  useChatStore,
  selectIsActiveConversationStreaming,
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
  resolveModelEffort,
  type CloudWorkMode,
  type Effort,
} from '@agiworkforce/types';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import {
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
  type AgentActivityState,
} from '@agiworkforce/client-runtime';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { getBrowserTimeZone } from '@/lib/client/browser-timezone';
import { isFreeTrialErrorCode, useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import type { ResearchStep } from '@agiworkforce/types';
import { parseResearchPlanEvent } from '@/features/chat/utils/research-plan';
import { parseAgiWorkPlanEvent, type AgiWorkGoalInput } from '@/features/chat/utils/agiwork-plan';
// GOV-20: one classifier for every managed quota refusal, free or paid.
import { classifyManagedQuotaErrorCode, getNextUpgradeTier } from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';
import {
  createSendReplayMetadata,
  hasWebSearchSources,
} from '@/features/chat/types/message-metadata';
import {
  CONTINUE_GENERATION_INSTRUCTION,
  isMessageContinuable,
} from '@/features/chat/lib/continue-generation';
import { parseQualifiedMcpToolName } from '@/features/connectors/lib/mcp-tool-name';
import { useToolPermissionsStore } from '@/features/connectors/stores/tool-permissions-store';
import {
  buildApiMessageContent,
  durableAttachmentDescriptors,
} from '@/features/chat/lib/persisted-attachments';

interface SendMessageOptions {
  model?: string;
  /** Stable client ids used by navigation handoffs and server idempotency. */
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
  /** Output style hint. When set and not 'normal', a system message is prepended. */
  styleMode?: string;
  /** Resolved Response-Style instruction (StyleSelector). Takes precedence over styleMode. */
  styleInstruction?: string;
  /** Exact server-catalog skill name. The browser never loads or sends its body. */
  skillName?: string;
  /** Deep Research mode: forces web_search and injects a research system prompt. */
  research?: boolean;
  /**
   * Material carried forward when retrying a research run that errored or was
   * interrupted: sources already gathered (their citation numbers stay stable)
   * and the plan steps that already completed (never re-run). Ignored unless
   * `research` is true.
   */
  researchResume?: {
    sources: Array<{ url: string; title?: string; snippet?: string }>;
    steps: ResearchStep[];
  };
  /** Validated product mode; AGI Work exposes the paid server-owned tool harness. */
  workMode?: CloudWorkMode;
  /**
   * CAP-048: the structured AGI Work goal (objective + optional scope /
   * deliverable). Sent as `agi_work_goal`; the server validates it, stores it on
   * the run journal, and threads it into the planning turn. Ignored by the
   * server unless `workMode === 'agiwork'`.
   */
  agiWorkGoal?: AgiWorkGoalInput;
  /**
   * AUDIT-FIX STR-22: invoked once the new USER turn is durable -- its row has
   * been written (or the conversation is temporary, so there is nothing to
   * write). This is the commit point `sendMessage`'s return value documents,
   * reported as soon as it happens instead of only when the whole stream ends.
   *
   * The edit/regenerate replace flow uses it to delete the REPLACED turn's
   * server rows at exactly that moment: any earlier and a failed save would
   * destroy the original; any later (the previous behaviour -- stream end) and a
   * reload mid-regeneration shows a duplicated user message next to the stale
   * answer. Errors thrown by the callback are swallowed: it is a notification,
   * never part of the send's success path.
   */
  onTurnCommitted?: () => void;
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

/** Decision the user made on a single pending tool call. */
export type ToolApprovalDecision = 'approved' | 'rejected';

export interface UseChatStreamReturn {
  /**
   * Send a user message and stream the reply. Resolves to `true` once the new user
   * turn has been committed to the transcript (added locally + persisting), or `false`
   * if it bailed before commit (empty content, no conversation, expired session). A
   * mid-stream failure still resolves `true` — the turn is committed and retryable.
   * Callers replacing a prior turn (edit/regenerate) use this to delete the old turn's
   * durable rows ONLY after the new one commits (see sendReplacingMessages).
   */
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<boolean>;
  /**
   * AUDIT-FIX STR-3: stop exactly ONE conversation's turn. Omitting the id
   * targets the active conversation (a bare user click on the visible Stop
   * button); a host that can render a Stop control for a conversation other
   * than the active one MUST pass that conversation's id.
   */
  stopGeneration: (conversationId?: string) => void;
  /**
   * Continue Generation (ChatGPT/Claude parity): resume a truncated or
   * user-stopped assistant turn. New tokens APPEND to the same assistant
   * message (never a new bubble) and the merged full text is persisted.
   * No-op unless the message is continuable (see isMessageContinuable).
   */
  continueGeneration: (assistantMessageId: string) => Promise<void>;
  /**
   * Resolve one pending tool-approval card (see the manual-approval flow). Records
   * the per-tool_call decision; once EVERY pending tool call in the suspended turn
   * is decided, POSTs only the durable run id + decisions to the approval
   * endpoint and streams the continuation into the same assistant message.
   */
  resolveToolApproval: (
    assistantMessageId: string,
    toolCallId: string,
    decision: ToolApprovalDecision,
  ) => Promise<void>;
  isStreaming: boolean;
}

class ChatApiError extends Error {
  code: string | undefined;
  status: number | undefined;
  /**
   * GOV-20 — ISO instant the exhausted window refills, when the response
   * carried one. Undefined otherwise; the paywall card renders a reset time
   * only when this is present, so it can never invent one.
   */
  resetAt: string | undefined;

  constructor(message: string, options: { code?: string; status?: number; resetAt?: string } = {}) {
    super(message);
    this.name = 'ChatApiError';
    this.code = options.code;
    this.status = options.status;
    this.resetAt = options.resetAt;
  }
}

/**
 * GOV-20 — read a reset instant out of an error response, or undefined.
 *
 * Accepts the two shapes the managed surface can send: an explicit
 * `error.reset_at` ISO instant, or a standard `Retry-After` delta in seconds.
 * Never guesses.
 */
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

function readChatApiErrorPayload(
  payload: unknown,
  fallbackMessage: string,
): { message: string; code?: string } {
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
    return {
      message: nestedMessage ?? topLevelMessage ?? fallbackMessage,
      code: nestedCode ?? topLevelCode,
    };
  }

  return { message: topLevelMessage ?? fallbackMessage, code: topLevelCode };
}

function getVisibleErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'An unknown error occurred';
}

function buildAssistantErrorContent(message: string): string {
  return `Error: ${message}\n\nTry again, or start a new chat if this response is stuck.`;
}

/**
 * A tool-only assistant turn (e.g. a connector call or file write with no
 * closing remark) can finish with an empty `fullContent`. `CreateMessageSchema`
 * (lib/validations/chat.ts) rejects empty and whitespace-only content, so an
 * empty string can never reach the DB — but the turn's tool timeline and
 * generated-file metadata still need to persist. U+200B is not stripped by
 * `String.prototype.trim()` (it is not in the Unicode `White_Space` set used
 * by ECMAScript trim semantics, unlike a plain space), so it satisfies the
 * schema's non-whitespace check while rendering as nothing.
 */
const EMPTY_ASSISTANT_CONTENT_PLACEHOLDER = String.fromCharCode(0x200b);

/**
 * Provider that yields a CURRENTLY-valid Clerk session token. Clerk JWTs are
 * short-lived (~60s default), so a token captured when a request STARTS is
 * expired by the time a long web-search / deep-research / long-generation
 * stream finishes — persisting the assistant turn with that stale Bearer then
 * fails (401 on the save route, plus 403 CSRF_VALIDATION_FAILED because an
 * expired Bearer no longer qualifies for the Bearer CSRF-bypass and the
 * cookie-derived session no longer matches the userId-bound CSRF token). The
 * save path therefore takes a PROVIDER, not a captured string, and calls it at
 * save time (and on every retry) so `getToken()` hands back a fresh token.
 */
type AuthTokenProvider = () => Promise<string>;

type SaveRetryOptions = ManagedCloudSaveMessageOptions;

/**
 * Persist a chat message to the database, returning the saved row id.
 *
 * Durability contract (P1 silent-data-loss fix): the previous implementation
 * swallowed every non-OK response and returned null, so a transient 500 /
 * network blip silently lost the assistant (and sometimes the paired user)
 * turn on reload — the store does not persist messages. This version:
 *   - retries transient failures (5xx / network) with backoff, since most
 *     persistence blips self-heal on a second attempt;
 *   - THROWS on a hard, non-recoverable failure (any non-retryable 4xx
 *     INCLUDING 429, or 5xx / network after exhausting retries) so the caller
 *     surfaces it to the user instead of dropping the turn silently. A 429 here
 *     means the persist write was rate-limited and the turn is NOT saved — there
 *     is no automatic re-save, so it is surfaced like any other failure rather
 *     than swallowed. (Retrying a 429 in-request is futile: the rate-limit
 *     window outlasts the request, so 429 is not retried, only surfaced.)
 * The POST route is idempotent on the client-supplied id (ON CONFLICT), so a
 * retry of an already-committed message cannot create a duplicate.
 */
async function saveMessageToDb(
  conversationId: string,
  message: {
    id?: string;
    role: string;
    content: string;
    model?: string;
    metadata?: MessageMetadata;
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

/**
 * Surface a message-persistence failure to the user instead of dropping the
 * turn silently. Called from the save callers' catch handlers (a quiet 429
 * returns null and never reaches here).
 */
function notifyPersistenceFailure(kind: 'user' | 'assistant', error: unknown): void {
  console.error(`[useChatStream] Failed to save ${kind} message:`, error);
  toast.error(
    kind === 'assistant'
      ? "Couldn't save this response — it may not appear after you reload."
      : "Couldn't save your message — it may not appear after you reload.",
    { duration: 6000 },
  );
}

export { saveMessageToDb, notifyPersistenceFailure, EMPTY_ASSISTANT_CONTENT_PLACEHOLDER };

/**
 * AUDIT-FIX ROOT-CAUSE: read ONE conversation's transcript. Every read in this
 * module used to go through `useChatStore.getState().messages`, i.e. whatever
 * conversation happened to be on screen -- so a turn that outlived the user's
 * navigation read (and then persisted) a different chat's state. Falls back to
 * the derived mirror when the bucket has not been created yet, matching the
 * store's own compatibility fallback so a direct `setState({ messages })` seed
 * behaves identically.
 */
function readConversationMessages(conversationId: string): Message[] {
  const state = useChatStore.getState();
  const bucket = state.messagesByConversation[conversationId];
  if (bucket) return bucket;
  return state.activeConversationId === conversationId ? state.messages : [];
}

/** One message inside one conversation's transcript. */
function findConversationMessage(conversationId: string, messageId: string): Message | undefined {
  return readConversationMessages(conversationId).find((message) => message.id === messageId);
}

// ─── Shared SSE-stream types + module-level approval registry ───────────────

type MessageContent = ReturnType<typeof buildApiMessageContent>;
type ApiMessage = {
  role: string;
  content: MessageContent;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

/** One tool call the server suspended for user approval (from x_tool_approval_request). */
interface PendingApprovalCall {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Client projection of a server-owned approval checkpoint. The browser keeps
 * only the durable run identity, visible tool calls, and local decisions; the
 * authoritative transcript and executable arguments never round-trip through
 * the client. Keyed by assistantMessageId so any message card can resolve it.
 */
interface PendingTurn {
  runId: string;
  model: string;
  conversationId: string;
  isTemporaryConversation: boolean;
  calls: PendingApprovalCall[];
  decisions: Map<string, ToolApprovalDecision>;
  /** Set once the resume request has been dispatched, to prevent double-submit. */
  resolving: boolean;
}

const pendingTurns = new Map<string, PendingTurn>();

/** TEST-ONLY: clear the module-level pending-approval registry between tests. */
export function __resetPendingTurnsForTests(): void {
  pendingTurns.clear();
}

/** Whether a persisted approval card can be reconstructed from its run handle. */
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

/**
 * Context carrying the tool-approval resolver down to per-message components
 * (MessageBubble) WITHOUT prop-drilling through the memoized message-list layers.
 * The provider is mounted by the chat page (which owns the Clerk-authenticated
 * resolver); `useToolApprovalResolver()` returns `null` when no provider is
 * present, so a standalone/provider-less render (e.g. unit tests) simply leaves
 * the approve/reject affordances unwired instead of calling useAuth and throwing.
 */
type ResolveToolApprovalFn = UseChatStreamReturn['resolveToolApproval'];
const ToolApprovalContext = createContext<ResolveToolApprovalFn | null>(null);
export const ToolApprovalProvider = ToolApprovalContext.Provider;
export function useToolApprovalResolver(): ResolveToolApprovalFn | null {
  return useContext(ToolApprovalContext);
}

/**
 * Client-side convenience only: consult the user's saved per-(connector,
 * tool) decision (tool-permissions-store.ts, set from the ToolTimeline
 * approval card's "Remember" picker) and auto-resolve any pending call that
 * already has an 'allow'/'deny' verdict, through the SAME resolveToolApproval
 * path a manual click uses — so the resume/decision bookkeeping (turn.decisions,
 * the "wait for every call" gate) stays in one place. 'ask' (the default) is a
 * no-op: the card is left for a manual decision, exactly like today.
 *
 * The server re-validates every approval on resume regardless of what the
 * client sends — this only saves the user a repeat click, it grants nothing.
 * Non-MCP tool names (parseQualifiedMcpToolName returns null) are untouched;
 * the permission store is connector-scoped only.
 */
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
  /** True when the turn suspended on a tool-approval request (no final answer yet). */
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
  /** Seed the accumulated assistant text (for the resume continuation). */
  seedContent?: string;
  /** Seed the tool timeline (for the resume continuation, so prior cards persist). */
  seedTools?: MessageToolEntry[];
  /** Keep the owning hook pointed at the server job while this stream is live. */
  onRunHandle?: (handle: ManagedCloudAgentRunHandle | null) => void;
}

/**
 * Consume an OpenAI-compatible SSE stream into the given assistant message.
 * Owns the thinking-marker holdback, tool-timeline bookkeeping, x_tool_* event
 * handling, and the terminal persistence + streaming teardown. Shared by
 * `sendMessage` (initial request) and `resolveToolApproval` (resume
 * continuation) so both drive IDENTICAL rendering + persistence.
 *
 * Returns a StreamOutcome describing whether the turn suspended on a
 * tool-approval request and, if so, which tool calls are pending.
 */
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
  const appendToMessage = store.appendToMessage;
  const appendToThinking = store.appendToThinking;
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
  // For a continuation/resume (seedContent set), start from the metadata the
  // turn already accumulated so the terminal persist (which REPLACES the
  // metadata jsonb wholesale) does not drop earlier search results, code
  // output, generated files, or research state.
  const liveMessageMetadata = findConversationMessage(
    conversationId,
    ctx.assistantMessageId,
  )?.metadata;
  const seedMetadata = ctx.seedContent !== undefined ? liveMessageMetadata : undefined;
  let currentSearchResults: MessageMetadata['searchResults'] = seedMetadata?.searchResults;
  let currentCodeExecutionResult: MessageMetadata['codeExecutionResult'] =
    seedMetadata?.codeExecutionResult;
  let currentResearch: MessageResearchState | undefined = seedMetadata?.research
    ? { ...seedMetadata.research }
    : undefined;
  // CAP-048: the AGI Work plan queue is tracked as a local like `currentResearch`
  // so the terminal `buildAssistantMetadata` rebuild re-includes it instead of
  // dropping the mid-stream write when it replaces the metadata bag.
  let currentAgiWorkPlan: MessageMetadata['agiWorkPlan'] = seedMetadata?.agiWorkPlan;
  let currentGeneratedFiles: MessageMetadata['generatedFiles'] = seedMetadata?.generatedFiles;
  let currentAgentActivity: AgentActivityState | undefined = liveMessageMetadata?.agentActivity;
  let currentCloudAgentRun: ManagedCloudAgentRunReference | undefined = runHandle
    ? {
        ...runHandle,
        lastSequence: seedMetadata?.agentActivity?.lastSequence ?? -1,
      }
    : seedMetadata?.cloudAgentRun;
  /**
   * How this turn ended, from the OpenAI-wire `finish_reason` (last one seen —
   * server tool loops emit intermediate 'tool_calls' before the final reason).
   * 'length' / 'max_tokens' → truncated at the token cap (continuable);
   * user abort with partial text sets the client-only marker 'stopped'.
   * Recorded on the message metadata + persisted so the Continue affordance
   * is honest and survives reload.
   */
  let finishReason: string | undefined;
  /**
   * Classified payload from an additive `x_stream_error` delta: the provider
   * failed mid-stream (after the response had already committed a 200), so
   * this turn's [DONE] still arrives normally with no other visible signal —
   * see `hasStreamError` in packages/ui/unified-chat/src/lib/continue-generation.ts
   * for why `finish_reason` alone cannot carry this. Sticky (once set, never
   * cleared) so an isolated retry of the SAME turn can't un-set it before the
   * terminal persist reads it. `code`/`retryable` ride along when the
   * provider adapter supplied them.
   */
  let streamErrorInfo: { message: string; code?: string; retryable?: boolean } | undefined =
    seedMetadata?.streamError;
  /**
   * Interactive cards seen this turn, keyed by cardId so a re-emitted card
   * (the server re-sends one when its state changes from pending to answered)
   * replaces rather than duplicates. Seeded from the live metadata so a resumed
   * continuation does not drop the card the user just answered.
   */
  const interactiveCards = new Map<string, InteractiveCard>(
    (seedMetadata?.interactiveCards ?? [])
      .slice(0, INTERACTIVE_CARDS_MAX_PER_MESSAGE)
      .map((card) => [card.cardId, card]),
  );

  // ── Reasoning (thinking) accumulation ──────────────────────────────────────
  // updateMessage REPLACES metadata wholesale, so a bare `{ metadata: {...} }`
  // update wipes everything else already on the bag (thinkingContent, tools,
  // searchResults). This merge-safe patch reads the current bag and spreads it —
  // without it, closing a `<thinking>` block erased the accumulated reasoning and
  // the block vanished on completion (and never persisted).
  const patchMessageMeta = (patch: Partial<MessageMetadata>) => {
    // AUDIT-FIX ROOT-CAUSE: read AND write this turn's own conversation, never
    // the globally-active one.
    const current = findConversationMessage(conversationId, assistantMessageId)?.metadata;
    updateMessage(assistantMessageId, { metadata: { ...current, ...patch } }, conversationId);
  };

  const completeLocalStartingActivity = () => {
    if (!currentAgentActivity || currentAgentActivity.lastSequence !== -1) return;
    currentAgentActivity = {
      ...currentAgentActivity,
      entries: currentAgentActivity.entries.map((entry) =>
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

  // AUDIT-FIX STR-9: reasoning is accumulated LOCALLY, exactly like tools,
  // generatedFiles, searchResults and research. `buildAssistantMetadata` used to
  // read thinkingContent/thinkingSegments back off the store instead, so when
  // the message was not in the visible `state.messages` (a background
  // conversation's turn) the reasoning was silently dropped from the persisted
  // row. These locals are the source of truth for the terminal persist; the
  // store writes below remain, but only to drive the live render.
  let thinkingContent = seedMetadata?.thinkingContent ?? '';
  let thinkingStartedAt: string | undefined = seedMetadata?.thinkingStartedAt;
  let thinkingCompletedAt: string | undefined = seedMetadata?.thinkingCompletedAt;
  const seededThinkingDurationSeconds = seedMetadata?.thinkingDurationSeconds;

  // Local ledger of reasoning segments. Published to the store only once a turn
  // has >= 2 blocks (interleaved thinking around tool calls), so single-block
  // turns keep their proven single-`thinkingContent` render + persist path and
  // this stays a no-op for the common case. Seeded from the resume/continuation
  // metadata (AUDIT-FIX STR-9) so a continuation cannot drop the segments the
  // first half of the turn already produced.
  const thinkingSegments: NonNullable<MessageMetadata['thinkingSegments']> =
    seedMetadata?.thinkingSegments?.map((segment) => ({ ...segment })) ?? [];

  const publishThinkingSegments = () => {
    if (thinkingSegments.length < 2) return;
    patchMessageMeta({ thinkingSegments: thinkingSegments.map((s) => ({ ...s })) });
  };

  const openThinkingSegment = () => {
    const startedAt = new Date().toISOString();
    thinkingStartedAt = startedAt; // AUDIT-FIX STR-9
    thinkingSegments.push({
      id: `${assistantMessageId}-think-${thinkingSegments.length}`,
      content: '',
      isStreaming: true,
      startedAt,
      completedAt: null,
    });
    patchMessageMeta({ isThinkingStreaming: true, thinkingStartedAt: startedAt });
    publishThinkingSegments();
  };

  const appendThinkingText = (text: string) => {
    thinkingContent += text; // AUDIT-FIX STR-9: local accumulator is authoritative
    appendToThinking(assistantMessageId, text, conversationId);
    const seg = thinkingSegments[thinkingSegments.length - 1];
    if (seg) {
      seg.content += text;
      publishThinkingSegments();
    }
  };

  const closeThinkingSegment = () => {
    const completedAt = new Date().toISOString();
    thinkingCompletedAt = completedAt; // AUDIT-FIX STR-9
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
      // Leave awaiting_approval cards untouched — a suspended turn must not be
      // force-completed by the trailing flush; it is resolved by the user.
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
    if (finishReason) {
      metadata.finishReason = finishReason;
    }
    if (streamErrorInfo) {
      metadata.streamError = streamErrorInfo;
    }
    // Persist reasoning so it survives reload (previously dropped — only the answer
    // was saved). AUDIT-FIX STR-9: read the accumulated thinking off the LOCAL
    // accumulators (symmetric with tools / generatedFiles / searchResults /
    // research above) instead of reading it back off the store's visible message
    // list — that read returned undefined whenever this turn's conversation was
    // not the one on screen, silently dropping the reasoning from the saved row.
    // Always persist isThinkingStreaming:false and a stable duration so a
    // reloaded turn renders the collapsed "Thought for Ns" summary, never a
    // stuck live timer.
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
      // Temporary chats skip the database write but still need the exact same
      // terminal in-memory state, including clearing a resolved approval.
      updateMessage(assistantMessageId, { metadata }, conversationId);
    }
    if (isTemporaryConversation) return;
    // A tool-only turn (connector call, generated file, code execution) can
    // finish with no visible closing text — fullContent is then ''. Bailing
    // out unconditionally here used to drop the tool timeline and generated
    // file cards on reload along with the (rightfully) skipped empty text.
    // Persist whenever there is either real content or metadata worth
    // keeping; see EMPTY_ASSISTANT_CONTENT_PLACEHOLDER for why a metadata-only
    // turn cannot be saved with content: ''.
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
        // A provider failure on the very first token (zero content streamed)
        // must still persist — otherwise the x_stream_error signal is
        // silently dropped and the turn looks like it never happened at all
        // on reload, worse than rendering a clean-looking empty completion.
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

  const HOLD_BACK = 11;

  const flushContentBuffer = (isFinal = false) => {
    while (true) {
      const openIdx = contentBuffer.indexOf('<thinking>');
      const closeIdx = contentBuffer.indexOf('</thinking>');

      if (!inThinkingBlock && openIdx !== -1) {
        const before = contentBuffer.slice(0, openIdx);
        if (before) {
          fullAssistantContent += before;
          unacknowledgedPublicText += before;
          appendToMessage(assistantMessageId, before, conversationId);
        }
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
            fullAssistantContent += contentBuffer;
            unacknowledgedPublicText += contentBuffer;
            appendToMessage(assistantMessageId, contentBuffer, conversationId);
          }
          contentBuffer = '';
        }
      } else if (contentBuffer.length > HOLD_BACK) {
        const safe = contentBuffer.slice(0, contentBuffer.length - HOLD_BACK);
        if (inThinkingBlock) {
          appendThinkingText(safe);
        } else {
          fullAssistantContent += safe;
          unacknowledgedPublicText += safe;
          appendToMessage(assistantMessageId, safe, conversationId);
        }
        contentBuffer = contentBuffer.slice(contentBuffer.length - HOLD_BACK);
      }
      break;
    }
  };

  // Seed the store with any prior tool cards so the resume continuation renders
  // them alongside new events.
  if (toolTimeline.length > 0) publishToolTimeline();

  /**
   * The completion request is only one transport for a server-owned run. If
   * that SSE connection disappears unexpectedly, follow the journal from the
   * last canonical sequence instead of replacing real partial work with a
   * generic network error. Text deltas in the journal are explicitly public
   * answer text; reasoning deltas remain excluded from the transcript.
   */
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
    const followed = await client.followRun(runHandle.runId, {
      afterSequence,
      onEvent: (envelope) => {
        if (envelope.event.type === 'text-delta' && envelope.event.delta) {
          const reconciled = reconcileManagedCloudPublicText(
            unacknowledgedPublicText,
            envelope.event.delta,
          );
          unacknowledgedPublicText = reconciled.pending;
          if (reconciled.unmatchedIncoming) {
            fullAssistantContent += reconciled.unmatchedIncoming;
            appendToMessage(assistantMessageId, reconciled.unmatchedIncoming, conversationId);
          }
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
        currentAgentActivity = applyAgentActivityEvent(currentAgentActivity, envelope);
        patchMessageMeta({ agentActivity: currentAgentActivity });
        publishCloudRunReference({ lastSequence: envelope.sequence });
      },
      onSnapshot: (snapshot) => {
        publishCloudRunReference({
          lastSequence: snapshot.nextAfterSequence,
          state: snapshot.run.state,
          cancellationRequestedAt: snapshot.run.cancellationRequestedAt,
        });
      },
    });

    publishCloudRunReference({
      lastSequence: followed.lastSequence,
      state: followed.run.state,
      cancellationRequestedAt: followed.run.cancellationRequestedAt,
    });
    if (followed.run.state === 'failed') {
      finishRunningTools('failed', 'The managed agent run failed.');
    } else if (followed.run.state !== 'awaiting_input' && followed.run.state !== 'paused') {
      finishRunningTools();
    }
    setSearching(assistantMessageId, false, conversationId);
    setExecutingCode(assistantMessageId, false, conversationId);
    if (finishReason) patchMessageMeta({ finishReason });
    completeLocalStartingActivity();
    persistAssistant(fullAssistantContent);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return { suspended, pendingCalls, runHandle };
  };

  // AUDIT-FIX BUG-4: SSE makes the space after `data:` OPTIONAL, so matching
  // 'data: ' (and slicing a hardcoded 6) silently dropped every frame from a
  // provider that emits `data:{...}`. Strip the field name, then at most one
  // leading space.
  const collectEventPayloads = (rawEvent: string): string[] => {
    const dataLines: string[] = [];
    for (const rawLine of rawEvent.split('\n')) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) continue;
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    if (dataLines.length <= 1) return dataLines;
    // AUDIT-FIX BUG-3: multiple `data:` fields in one event belong to a SINGLE
    // payload joined with '\n' per spec. Our own server
    // (app/api/llm/v1/chat/completions/lib/stream-transform.ts) instead packs
    // several independently-valid JSON objects as separate `data:` lines in one
    // event, which the joined form cannot parse. Try the spec-conformant
    // payload first, then fall back to per-line payloads, so both framings work.
    const joined = dataLines.join('\n');
    try {
      JSON.parse(joined);
      return [joined];
    } catch {
      return dataLines;
    }
  };

  // AUDIT-FIX BUG-5/BUG-6: events are delimited by a BLANK line, and any of
  // '\n', '\r\n' or a bare '\r' terminates a line. The previous line-only split
  // on '\n' never advanced against a bare-'\r' server (buffer grew unbounded,
  // nothing parsed). `flushAll` is set once the reader reports done so a final
  // frame that was never terminated by a blank line is still processed instead
  // of being discarded with the buffer.
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

      // AUDIT-FIX BUG-6: flush the decoder on `done` so a multi-byte character
      // straddling the last chunk boundary is emitted rather than swallowed.
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
            // Publish before persisting so the Continue affordance (finish_reason
            // 'length'/'max_tokens') renders immediately, not only after reload.
            patchMessageMeta({ finishReason });
          }
          if (streamErrorInfo) {
            // Same "publish before persist" treatment as finishReason above,
            // so the incomplete-response notice + regenerate affordance
            // (hasStreamError) renders immediately, not only after reload.
            patchMessageMeta({ streamError: streamErrorInfo });
          }
          completeLocalStartingActivity();
          persistAssistant(fullAssistantContent);
          stopStreaming(conversationId);
          setLoading(false, conversationId);
          return { suspended, pendingCalls, runHandle };
        }

        try {
          const parsed = JSON.parse(data);

          // Canonical Cloud activity stream. Runtime validation happens before
          // projection, and the reducer enforces per-turn monotonic sequence so
          // retries/reordered chunks cannot duplicate or rewrite visible work.
          // Legacy x_tool_* parsing below remains during the emitter migration,
          // but the message renderer prefers this canonical state when present.
          const agentEnvelope = parseAgentEventDelta(parsed.choices?.[0]?.delta?.x_agent_event);
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
            currentAgentActivity = applyAgentActivityEvent(currentAgentActivity, agentEnvelope);
            patchMessageMeta({ agentActivity: currentAgentActivity });
            publishCloudRunReference({ lastSequence: agentEnvelope.sequence });
          }

          let chunk: string | null = null;
          const deltaContent = parsed.choices?.[0]?.delta?.content;
          if (!duplicateAgentEnvelope && typeof deltaContent === 'string') {
            chunk = deltaContent;
          } else if (!duplicateAgentEnvelope && deltaContent != null) {
            // AUDIT-FIX BUG-11: some OpenAI-compatible providers send a
            // non-string delta.content (e.g. `[]` for an empty delta). It used
            // to be concatenated straight into the answer, rendering AND
            // persisting '[object Object]' without throwing, so the surrounding
            // catch never saw it. Drop it, but log so it stays observable.
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
          }

          // Deep Research run status (additive x_research_status event).
          const researchStatus = parsed.choices?.[0]?.delta?.x_research_status;
          if (researchStatus && typeof researchStatus === 'object') {
            const phase = researchStatus.phase;
            if (
              phase === 'planning' ||
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
                // The plan and retry material live on their own events; carry
                // them across status updates instead of dropping them.
                steps: currentResearch?.steps,
                sourcesForRetry: currentResearch?.sourcesForRetry,
              };
              setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
            }
          }

          // Deep Research plan queue (additive x_research_plan event). Whole
          // plan, last-write-wins. A client that ignored this event before
          // behaved exactly as it does now minus the plan list.
          const researchPlan = parsed.choices?.[0]?.delta?.x_research_plan;
          if (researchPlan) {
            const planSteps = parseResearchPlanEvent(researchPlan);
            if (planSteps) {
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

          // AGI Work plan queue (additive x_agiwork_plan event, CAP-048). Whole
          // plan, last-write-wins — same additive contract as x_research_plan, so
          // a client that ignores it is unchanged.
          const agiWorkPlan = parsed.choices?.[0]?.delta?.x_agiwork_plan;
          if (agiWorkPlan) {
            const planSteps = parseAgiWorkPlanEvent(agiWorkPlan);
            if (planSteps) {
              currentAgiWorkPlan = planSteps;
              setAgiWorkPlan(assistantMessageId, planSteps, conversationId);
            }
          }

          // Tool status indicators.
          const toolStatus = parsed.choices?.[0]?.delta?.x_tool_status;
          if (toolStatus?.type === 'server_tool_use') {
            startTool(toolStatus.name, toolStatus.status);
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

          // Mid-stream provider failure (additive marker — see the
          // streamErrorInfo declaration above for why this can't ride on
          // finish_reason alone). Sticky: keep the FIRST payload seen, not
          // the last, since it identifies the actual failure. Accepts the
          // current object shape defensively (a stray bare-string sender
          // would still be classified, though the wire only sends objects).
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

          // Manual-approval request: surface an awaiting_approval card and record
          // the pending call so the caller can build the resume request.
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

          /*
           * Interactive card.
           *
           * `parseInteractiveCardDelta` NEVER throws and never drops a card it
           * cannot understand: an unknown kind, a newer schemaVersion, or a body
           * that fails validation all come back `recognized: false` still
           * carrying the server-authored `fallback`. So this branch has no
           * error path of its own — a null return means the payload was not an
           * envelope at all, which is the only case where there is nothing to
           * show.
           */
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

          // Code execution result.
          const codeResultBlock = parsed.choices?.[0]?.delta?.x_code_result;
          if (codeResultBlock) {
            const content = Array.isArray(codeResultBlock.content)
              ? (codeResultBlock.content as Record<string, unknown>[])
              : [];
            const textItem = content.find((c) => c['type'] === 'text');
            const rawText = (textItem?.['text'] as string) || '';
            const images = content
              .filter((c) => c['type'] === 'image')
              .map((c) => {
                const src = c['source'] as Record<string, unknown> | undefined;
                return {
                  mediaType: (src?.['media_type'] as string) || 'image/png',
                  data: (src?.['data'] as string) || '',
                };
              })
              .filter((img) => img.data);

            const stdout = rawText.match(/<stdout>([\s\S]*?)<\/stdout>/)?.[1] ?? rawText;
            const stderr = rawText.match(/<stderr>([\s\S]*?)<\/stderr>/)?.[1] ?? '';
            const returnCode = parseInt(
              rawText.match(/<return_code>(\d+)<\/return_code>/)?.[1] ?? '0',
              10,
            );
            currentCodeExecutionResult = {
              stdout,
              stderr,
              returnCode,
              images: images.length > 0 ? images : undefined,
            };
            setCodeExecutionResult(assistantMessageId, currentCodeExecutionResult, conversationId);
            finishTool('code_execution', 'completed');
          }

          // Web search results.
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
              currentSearchResults = results;
              setSearchResults(assistantMessageId, results, conversationId);
              // CAP-045 slice 4: a research run keeps its cumulative sources on
              // the research state so a Retry can carry them forward and skip
              // work that already succeeded.
              if (currentResearch) {
                currentResearch = { ...currentResearch, sourcesForRetry: results };
                setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
              }
            }
            // url_fetch sources carry tool:'url_fetch' — their timeline entry is
            // driven by mcp_tool_use status events, so don't synthesize a
            // web_search entry for them.
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
          }

          // Platform-executed tool results (MCP / E2B sandbox).
          const toolResultBlock = parsed.choices?.[0]?.delta?.x_tool_result;
          if (toolResultBlock) {
            const { name, content, is_error } = toolResultBlock as {
              tool_call_id?: string;
              name?: string;
              content?: unknown;
              is_error?: boolean;
            };
            if (name) {
              // Include 'failed' so a denial result event (server emits one for a
              // rejected tool, isError:false) lands on the card the client already
              // flipped to 'failed' on reject, instead of creating a duplicate.
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

          // Generated files (tool/provider runs that produced real bytes).
          // Emitted once by the server before [DONE] with same-origin
          // /api/files/{id} uris. UPSERT by file name so a re-harvested file
          // replaces its earlier descriptor instead of duplicating. Parsed
          // with the shared cloud contract (desktop WebRuntime and mobile use
          // the same parseGeneratedFilesDelta) instead of hand-rolled field
          // coercion, so all surfaces agree on what counts as a valid
          // descriptor and salvage per-file the same way.
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
              // Server-derived classification (file-creation parity Wave A).
              // Always present — the contract defaults pre-classification
              // payloads to 'file' / not-previewable.
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
              // Keep the LAST reason seen: server tool loops emit intermediate
              // 'tool_calls' chunks before the final 'stop'/'length'.
              finishReason = reason;
            }
            updateMessage(assistantMessageId, { isStreaming: false }, conversationId);
          }
        } catch {
          // Ignore parse errors for incomplete chunks.
        }
      }

      // AUDIT-FIX BUG-6: break AFTER draining, so the residual frame the old
      // `if (done) break;` threw away is still delivered.
      if (done) break;
    }

    // Stream ended without an explicit [DONE].
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
    completeLocalStartingActivity();
    persistAssistant(fullAssistantContent);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return { suspended, pendingCalls, runHandle };
  } catch (error) {
    // Browsers reject an aborted fetch read with a DOMException named
    // 'AbortError' -- DOMException is NOT instanceof Error, so a plain
    // `instanceof Error` check misclassifies user cancellation as a failure.
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

    // Flush the held-back content tail so an interrupted turn keeps (and
    // persists) exactly what streamed, not up-to-11 chars less.
    if (isAbort) {
      flushContentBuffer(true);
    }

    const researchActive = currentResearch && currentResearch.phase !== 'complete';

    if (isAbort && !researchActive) {
      // User stopped mid-generation with partial text already streamed: record
      // the client-only 'stopped' marker (drives the Continue affordance) and
      // persist the partial so it survives reload. Teardown (isStreaming
      // false, stopStreaming, setLoading) happens in the caller's abort
      // handling — rethrow below as before.
      if (fullAssistantContent) {
        finishReason = 'stopped';
        patchMessageMeta({ finishReason });
      }
      // A tool-only cancelled run still carries meaningful canonical metadata
      // and must survive reload even when no answer token arrived.
      if (fullAssistantContent || currentAgentActivity) {
        persistAssistant(fullAssistantContent);
      }
    }

    if (researchActive && isAbort) {
      // Deep Research cancelled mid-run: record the interruption honestly and
      // persist the partial report/sources so the run survives reload.
      currentResearch = { ...currentResearch!, phase: 'interrupted' };
      setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
      finishRunningTools();
      persistAssistant(fullAssistantContent);
    } else if (researchActive && !isAbort) {
      // Deep Research failed mid-run with a partial report already streamed:
      // keep the partial content, append an honest error note, record the
      // failure on the research state, persist, and tear down here (rethrowing
      // would let handleStreamError overwrite the partial with a bare error).
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
    throw terminalError;
  } finally {
    // AUDIT-FIX BUG-2: cancel the body on EVERY exit path. The research-error
    // `return` above and the `throw terminalError` both used to leave the
    // response body locked and the connection open, so the server's
    // ReadableStream.cancel() -- which settles billing and journals the run as
    // cancelled -- never fired. releaseLock() is NOT a substitute: it unlocks
    // the stream while the body stays un-cancelled.
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Hook for handling SSE streaming chat with the LLM API
 */
export function useChatStream(): UseChatStreamReturn {
  const { getToken } = useAuth();
  /**
   * AUDIT-FIX STR-2/BUG-16: ONE controller per conversation, not one for the
   * whole app. Previously a single slot was aborted unconditionally at the top
   * of every `sendMessage`, with no check that it belonged to the conversation
   * being sent to — so sending in chat B silently truncated chat A's response
   * and persisted it as `finishReason:'stopped'`.
   */
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  /**
   * AUDIT-FIX STR-2/BUG-16: same, for the durable Cloud run handle. A single
   * slot meant a second send orphaned the earlier run: it kept executing (and
   * billing) server-side with no client able to cancel it, because the handle
   * needed to call `cancelRun` had already been overwritten.
   */
  const activeRunsRef = useRef<
    Map<string, ManagedCloudAgentRunHandle & { assistantMessageId: string }>
  >(new Map());

  /** Abort (and forget) only the in-flight turn belonging to `conversationId`. */
  const abortConversation = useCallback((conversationId: string): void => {
    const controller = abortControllersRef.current.get(conversationId);
    if (!controller) return;
    abortControllersRef.current.delete(conversationId);
    controller.abort();
  }, []);

  /** Install a fresh controller for `conversationId`, aborting only its own predecessor. */
  const beginConversationRequest = useCallback(
    (conversationId: string): AbortController => {
      abortConversation(conversationId);
      const controller = new AbortController();
      abortControllersRef.current.set(conversationId, controller);
      return controller;
    },
    [abortConversation],
  );

  /** Drop `conversationId`'s controller iff it is still the one we installed. */
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
  // Scoped to the ACTIVE conversation, not the raw global flag -- a
  // background stream for a conversation the user has switched away from
  // must not show this conversation as generating (see
  // streamingConversationIds's doc comment in the store).
  const isStreaming = useChatStore(selectIsActiveConversationStreaming);

  // On unmount, do NOT abort the in-flight stream and do NOT null the ref.
  // The chatStore is a global singleton, so streamed tokens continue updating
  // the message list even after the originating component unmounts (e.g.
  // navigation from /chat to /chat/[id] on the first message).
  useEffect(() => {
    return () => {
      // intentionally empty: preserve controller across unmount
    };
  }, []);

  // Declared before sendMessage (which auto-resolves connector approvals
  // through this SAME function — see autoResolvePendingApprovals) rather than
  // after, so it is in scope for sendMessage's closure. Shares the
  // per-conversation controller map with sendMessage/continueGeneration/
  // stopGeneration (Finding 4) so Stop cancels a resume exactly like any other
  // in-flight turn — and, since AUDIT-FIX STR-2, only for ITS conversation.
  const resolveToolApproval = useResolveToolApproval(abortControllersRef);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}): Promise<boolean> => {
      if (!content.trim() && !options.attachments?.length) return false;

      const conversationId = options.conversationId || useChatStore.getState().activeConversationId;
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
      });
      const persistedAttachments = durableAttachmentDescriptors(options.attachments);
      const userMetadata: MessageMetadata | undefined =
        sendReplay || persistedAttachments
          ? {
              ...(sendReplay ? { sendReplay } : {}),
              ...(persistedAttachments ? { attachments: persistedAttachments } : {}),
            }
          : undefined;
      // Provider (not a captured string): every save fetches a fresh token at
      // call time so a long stream cannot outlive it. See AuthTokenProvider.
      const getAuthToken: AuthTokenProvider = async () => {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        return token;
      };
      // Pre-flight the token BEFORE adding any message. Previously this threw
      // uncaught (getToken() null on an expired/revoked session), and since the
      // composer has already cleared the input, the user's message vanished with
      // no error shown. Mirror continueGeneration: surface the error and stop
      // cleanly before mutating the transcript.
      let authToken: string;
      try {
        authToken = await getAuthToken();
      } catch {
        setError('Your session has expired. Please sign in again.', conversationId);
        return false;
      }

      const userMessageId = resolveClientMessageId(options.userMessageId);
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
        attachments: options.attachments,
        metadata: userMetadata,
      };
      // AUDIT-FIX ROOT-CAUSE: append to the TARGET conversation's transcript,
      // not to whatever is on screen when this resolves.
      addMessage(userMessage, conversationId);

      const isTemporaryConversation = Boolean(
        useChatStore
          .getState()
          .conversations.find((conversation) => conversation.id === conversationId)?.isTemporary,
      );
      // AUDIT-FIX STR-22: report the commit point. For a temporary conversation
      // there is no durable row to wait on, so the turn is committed the moment
      // it is in the transcript.
      const reportTurnCommitted = () => {
        try {
          options.onTurnCommitted?.();
        } catch (callbackError) {
          logger.warn('[useChatStream] onTurnCommitted callback threw', {
            error: getVisibleErrorMessage(callbackError),
          });
        }
      };
      if (!isTemporaryConversation) {
        try {
          // The user row is the paid-turn admission fence. Await it before
          // creating the assistant placeholder or starting provider egress;
          // otherwise a slow/failed save can race a successful provider call
          // and a retry buys the same turn twice with no durable prompt.
          const saved = await saveMessageToDb(
            conversationId,
            {
              id: userMessageId,
              role: 'user',
              content: content.trim(),
              metadata: userMetadata,
            },
            getAuthToken,
          );
          if (saved.id !== userMessageId) {
            updateMessage(userMessageId, { id: saved.id }, conversationId);
          }
          reportTurnCommitted();
        } catch (error) {
          notifyPersistenceFailure('user', error);
          deleteMessage(userMessageId, conversationId);
          setError('Your message was not saved, so no model was called.', conversationId);
          return false;
        }
      } else {
        reportTurnCommitted();
      }

      // AUDIT-FIX STR-2/BUG-16: abort ONLY this conversation's own previous
      // turn. Install the controller after the durable admission fence so a
      // pre-egress persistence failure cannot leave a phantom active request.
      const abortController = beginConversationRequest(conversationId);

      const assistantMessageId = resolveClientMessageId(options.assistantMessageId);
      const assistantStartedAtMs = Date.now();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date(assistantStartedAtMs).toISOString(),
        model,
        isStreaming: true,
        metadata: {
          agentActivity: startAgentActivityLocally({
            sessionId: conversationId,
            turnId: assistantMessageId,
            summary: options.workMode === 'agiwork' ? 'Starting AGI Work' : 'Generating response',
            startedAtMs: assistantStartedAtMs,
          }),
        },
      };
      addMessage(assistantMessage, conversationId);
      startStreaming(assistantMessageId, conversationId);
      // AUDIT-FIX STR-7/BUG-12: scope the `true` write exactly like every
      // `false` write. Unscoped, a background turn left `isLoading` stuck true
      // and disabled the composer in every other conversation.
      setLoading(true, conversationId);
      setError(null, conversationId);

      try {
        // AUDIT-FIX BUG-13: build the provider history from the TARGET
        // conversation. This used to read the globally-active transcript, so a
        // send explicitly addressed to conversation A was billed against A
        // while carrying conversation B's messages.
        const currentMessages = readConversationMessages(conversationId);

        const apiMessages: ApiMessage[] = [
          ...currentMessages
            .filter((m) => m.id !== assistantMessageId)
            .map((m) => ({
              role: m.role,
              content: buildApiMessageContent(m),
            })),
        ];

        // StyleSelector's resolved instruction (preset or custom) is
        // authoritative; keep the legacy styleMode hint only for older callers.
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
          Authorization: `Bearer ${authToken}`,
          'X-AGI-Surface': 'web',
          'Idempotency-Key': createManagedChatIdempotencyKey({
            surface: 'web',
            purpose: 'send',
            operationId: assistantMessageId,
          }),
        });
        const thinkingState = useThinkingStore.getState();
        const requestedThinking = options.thinkingEnabled ?? thinkingState.enabled;
        const selectedModelMetadata = getModelMetadataById(model);
        // Unknown/BYOK models preserve the caller's explicit request. Known catalog
        // models are capability-clamped so a stale persisted preference can never
        // make an otherwise valid chat fail before provider execution.
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
            // AUDIT-FIX BUG-10/STR-5: send the client-minted assistant message id so
            // the server can persist the turn under the SAME row the client will
            // upsert at [DONE]. Without a shared key the two writes cannot collapse
            // (the messages route upserts `on conflict (id)`), so a server-side
            // persist would duplicate every assistant message instead of covering
            // the tab-close case it exists for.
            assistant_message_id: assistantMessageId,
            stream: true,
            [INTERACTIVE_CARD_REQUEST_KEY]: {
              supported: ['map-search.v1'],
              canRespond: false,
            },
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            web_search: options.webSearch || options.research || undefined,
            web_fetch: options.webFetch || undefined,
            research: options.research || undefined,
            // CAP-045 slice 4: retry material for a research run that errored
            // or was stopped. Sent only alongside research:true; the server
            // drops it otherwise. This is the NORMAL send path, so the retry
            // reserves and meters exactly like a first attempt.
            research_resume:
              options.research && options.researchResume ? options.researchResume : undefined,
            code_execution: options.codeExecution || undefined,
            office_creation: options.officeCreation || undefined,
            skill_name: options.skillName,
            work_mode: options.workMode,
            // CAP-048: only meaningful in AGI Work mode; the server drops it
            // otherwise. Sent on the normal billed path so the planning turn it
            // drives meters exactly like the rest of the run.
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
          const { message, code } = readChatApiErrorPayload(
            errorData,
            `Request failed: ${response.status}`,
          );
          throw new ChatApiError(message, {
            code,
            status: response.status,
            // GOV-20
            resetAt: readErrorResetAt(errorData, response),
          });
        }

        /**
         * Label the turn with the model that ACTUALLY answered.
         *
         * `model` here is what we asked for. Under Auto routing that is the
         * literal `auto`, which is not a catalog id, so the transcript footer
         * fell through to "Unavailable model" on every reply. A credit-driven
         * fallback has the same problem in reverse: the footer would name a
         * model that never ran. The server reports the routed id in
         * `X-AGI-Resolved-Model`; trust it when present and keep the requested
         * value as the fallback for older deployments.
         */
        const resolvedModel = response.headers.get('X-AGI-Resolved-Model')?.trim() || model;
        // The in-memory message was created BEFORE the fetch, stamped with the
        // requested model, and it is that object the transcript renders. Patch
        // it now or the footer keeps showing the pre-routing value no matter
        // what we persist.
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
          onRunHandle: (handle) => {
            // AUDIT-FIX STR-2/BUG-16: keyed by conversation so a concurrent
            // send elsewhere cannot orphan this run's cancel handle.
            if (handle) {
              activeRunsRef.current.set(conversationId, { ...handle, assistantMessageId });
            } else {
              activeRunsRef.current.delete(conversationId);
            }
          },
        });

        // Register the suspended turn so its approval cards can drive a resume.
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
        }
      } catch (error) {
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
        });
      } finally {
        if (activeRunsRef.current.get(conversationId)?.assistantMessageId === assistantMessageId) {
          activeRunsRef.current.delete(conversationId);
        }
        endConversationRequest(conversationId, abortController);
      }
      // Committed: the new user turn was added (and is persisting) before the stream
      // started, so a mid-stream failure never loses it. The caller may now safely
      // delete any turn this send replaced (see sendReplacingMessages).
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

  /**
   * Continue a truncated (finish_reason 'length'/'max_tokens') or user-stopped
   * ('stopped') assistant turn. Reuses the normal completions route: the
   * request history ends with the partial assistant message followed by an
   * ephemeral user instruction to continue in place (never stored/rendered).
   * consumeAssistantStream is seeded with the existing content + tool timeline
   * so new tokens APPEND to the same bubble and the terminal persist saves the
   * merged full text. Shares the per-conversation abort-controller map with
   * sendMessage so stopGeneration cancels a continuation too -- and, since
   * AUDIT-FIX STR-2, cancels only the conversation it was asked to stop.
   */
  const continueGeneration = useCallback(
    async (assistantMessageId: string) => {
      const store = useChatStore.getState();
      const conversationId = store.activeConversationId;
      // Scoped to this conversation, not the raw global isStreaming -- a
      // background stream for a DIFFERENT conversation must not block
      // continuing generation on the one actually displayed.
      if (conversationId && store.streamingConversationIds.includes(conversationId)) return;
      // AUDIT-FIX ROOT-CAUSE: read this conversation's own transcript.
      const conversationMessages = conversationId
        ? readConversationMessages(conversationId)
        : store.messages;
      const messageIndex = conversationMessages.findIndex((m) => m.id === assistantMessageId);
      const message = messageIndex >= 0 ? conversationMessages[messageIndex] : undefined;
      // No fake availability: only a truncated/stopped assistant turn with
      // non-empty partial content can continue.
      if (!message || !isMessageContinuable(message)) return;

      if (!conversationId) {
        setError('No active conversation. Please create a new conversation first.');
        return;
      }
      const isTemporaryConversation = Boolean(
        store.conversations.find((conversation) => conversation.id === conversationId)?.isTemporary,
      );
      // Continue with the model that produced the partial answer so the voice
      // and capabilities stay coherent; fall back to the current selection.
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

      // AUDIT-FIX STR-2/BUG-16: cancel only this conversation's own prior turn.
      const abortController = beginConversationRequest(conversationId);

      // Thread: everything up to AND INCLUDING the partial assistant turn,
      // then the ephemeral continue instruction (request-only, never stored).
      const apiMessages: ApiMessage[] = conversationMessages
        .slice(0, messageIndex + 1)
        .map((m) => ({ role: m.role, content: m.content as MessageContent }));
      apiMessages.push({ role: 'user', content: CONTINUE_GENERATION_INSTRUCTION });

      const seedContent = message.content;
      const seedTools = message.metadata?.tools?.map((t) => ({ ...t }));
      const priorMetadata = message.metadata;

      // Clear the continuable marker while the continuation streams; it is
      // re-recorded honestly at stream end (re-offered if truncated again).
      updateMessage(
        assistantMessageId,
        { isStreaming: true, metadata: { ...priorMetadata, finishReason: undefined } },
        conversationId,
      );
      startStreaming(assistantMessageId, conversationId);
      // AUDIT-FIX STR-7/BUG-12: scoped, matching every paired `false` write.
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
            // AUDIT-FIX BUG-10/STR-5: send the client-minted assistant message id so
            // the server can persist the turn under the SAME row the client will
            // upsert at [DONE]. Without a shared key the two writes cannot collapse
            // (the messages route upserts `on conflict (id)`), so a server-side
            // persist would duplicate every assistant message instead of covering
            // the tab-close case it exists for.
            assistant_message_id: assistantMessageId,
            stream: true,
            use_prompt_cache: true,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const { message: errMessage, code } = readChatApiErrorPayload(
            errorData,
            `Request failed: ${response.status}`,
          );
          throw new ChatApiError(errMessage, {
            code,
            status: response.status,
            // GOV-20
            resetAt: readErrorResetAt(errorData, response),
          });
        }

        await consumeAssistantStream({
          response,
          assistantMessageId,
          // See the send path: label with the model that ANSWERED, not the one
          // requested, so an Auto-routed turn is not stamped `auto`.
          model: response.headers.get('X-AGI-Resolved-Model')?.trim() || model,
          conversationId,
          isTemporaryConversation,
          getAuthToken,
          seedContent,
          seedTools,
          onRunHandle: (handle) => {
            // AUDIT-FIX STR-2/BUG-16: keyed by conversation (see sendMessage).
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
          // consumeAssistantStream already flushed + re-marked 'stopped' +
          // persisted the merged partial; just tear down here.
          updateMessage(assistantMessageId, { isStreaming: false }, conversationId);
          stopStreaming(conversationId);
          setLoading(false, conversationId);
          return;
        }

        const errorMessage = getVisibleErrorMessage(error);
        const errorCode = error instanceof ChatApiError ? error.code : undefined;
        if (isFreeTrialErrorCode(errorCode)) {
          // Nothing streamed; leave the partial turn exactly as it was
          // (marker restored so Continue re-offers once the gate clears).
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

        // Honest failure without destroying the partial answer: keep whatever
        // has streamed (original partial + any continuation tokens) and append
        // an error note, instead of handleStreamError's replace-with-error.
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
              // Drop the continuable marker: an errored turn must not re-offer
              // Continue after reload (Regenerate is the recovery path).
              metadata: { ...priorMetadata, finishReason: undefined },
            },
            getAuthToken,
          ).catch((err) => notifyPersistenceFailure('assistant', err));
        }
        stopStreaming(conversationId);
        setLoading(false, conversationId);
      } finally {
        if (activeRunsRef.current.get(conversationId)?.assistantMessageId === assistantMessageId) {
          activeRunsRef.current.delete(conversationId);
        }
        endConversationRequest(conversationId, abortController);
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

  /**
   * AUDIT-FIX STR-3: Stop now names its target. The old implementation had two
   * disagreeing targets — it aborted whatever fetch started most recently
   * (possibly a different conversation's) while `stopStreaming()` /
   * `setLoading(false)` resolved against `activeConversationId`. Callers pass
   * the conversation the Stop button belongs to; omitting it falls back to the
   * active conversation, which is what a bare user-initiated Stop means.
   */
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
    resolveToolApproval,
    isStreaming,
  };
}

/**
 * Lightweight hook exposing ONLY `resolveToolApproval`. It subscribes to no
 * reactive store slice (reads stable actions via getState()), so a component
 * that renders once per message (e.g. MessageBubble) can wire approve/reject
 * without incurring a re-render on every streaming toggle. useChatStream reuses
 * it so there is a single implementation of the resume flow.
 *
 * `sharedAbortControllers` is the SAME per-conversation map
 * `sendMessage`/`continueGeneration` use, passed in by the caller rather than
 * owned here. A resume is just another kind of in-flight turn on the
 * conversation, so it must share one abort target with the rest -- previously
 * this hook kept a private `abortRef` that `stopGeneration` never touched, so
 * clicking Stop during a tool-approval resume did nothing (Finding 4).
 *
 * AUDIT-FIX STR-2/BUG-16: the shared target is now keyed by conversation, so a
 * resume cancels (and is cancelled by) only its OWN conversation's turn.
 */
export function useResolveToolApproval(
  sharedAbortControllers: MutableRefObject<Map<string, AbortController>>,
): UseChatStreamReturn['resolveToolApproval'] {
  const { getToken } = useAuth();
  const abortControllers = sharedAbortControllers;

  return useCallback(
    // Named (not an anonymous arrow) so it can call itself below when a
    // resumed turn suspends AGAIN on a further connector call — auto-resolving
    // that next batch needs the exact same resolver, not a re-derived one.
    async function resolveToolApproval(
      assistantMessageId: string,
      toolCallId: string,
      decision: ToolApprovalDecision,
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

      // Persist the selection while the batch remains awaiting input. Keeping
      // requiresApproval=true makes a partially decided batch reconstructable
      // after reload; execution state changes only once every call is decided.
      updateToolEntry(
        assistantMessageId,
        toolCallId,
        { approved: decision === 'approved', requiresApproval: true },
        turn.conversationId,
      );

      // AUDIT-FIX ROOT-CAUSE: the suspended turn carries its own conversation
      // id; read and write THAT transcript, not the one currently displayed.
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

      // Wait until EVERY pending call in the turn is decided before resuming.
      if (turn.decisions.size < turn.calls.length) return;
      // Claim the resume atomically. Two decisions can be in flight at once — a rapid
      // double-click on one button, or the last two calls approved near-simultaneously —
      // and on a persisted conversation each parks at the `await saveMessageToDb` above
      // with `resolving` still false, so both re-pass the top guard and both reach here
      // after the batch is complete. This check-and-set has no await between the read and
      // the write, so it is atomic in JS's single-threaded model: exactly one caller
      // claims the resume and dispatches a single POST; the other returns here.
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

      // Provider so the terminal persist after a long resume continuation uses a
      // fresh token (see AuthTokenProvider), not one captured here.
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

      // AUDIT-FIX STR-2/BUG-16: abort only this conversation's own in-flight
      // turn before dispatching the resume.
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
      // AUDIT-FIX STR-7/BUG-12: scoped, matching every paired `false` write.
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
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const { message, code } = readChatApiErrorPayload(
            errorData,
            `Resume failed: ${response.status}`,
          );
          throw new ChatApiError(message, {
            code,
            status: response.status,
            // GOV-20
            resetAt: readErrorResetAt(errorData, response),
          });
        }

        const outcome = await consumeAssistantStream({
          response,
          assistantMessageId,
          // Resume path: the resumed leg may route differently from the
          // original, so prefer what this response reports.
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
        // A rejected resume never consumed the durable checkpoint: the server
        // released its lease, so keep the local decisions and return the cards
        // to a retryable awaiting state. Network/stream failures are handled by
        // the durable-run replay path (or terminal failure handling) instead.
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
        // AUDIT-FIX STR-2/BUG-16: release this conversation's slot iff it is
        // still the controller we installed, so a settled resume cannot leave a
        // dead controller behind for a later Stop to act on.
        if (abortControllers.current.get(turn.conversationId) === abortController) {
          abortControllers.current.delete(turn.conversationId);
        }
      }
    },
    [abortControllers, getToken],
  );
}

// ─── Error handling shared by sendMessage + resolveToolApproval ─────────────

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

  // DOMException named 'AbortError' is what browsers reject an aborted fetch
  // with; it is NOT instanceof Error, so check the name shape instead.
  const isAbort =
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError';
  // AUDIT-FIX ROOT-CAUSE: read and write the FAILING turn's own conversation.
  const currentMessage = findConversationMessage(conversationId, assistantMessageId);
  const currentActivity = currentMessage?.metadata?.agentActivity;
  if (isAbort) {
    const cancelledMetadata: MessageMetadata | undefined = currentActivity
      ? {
          ...currentMessage?.metadata,
          agentActivity: finishAgentActivityLocally(currentActivity, {
            status: 'cancelled',
            completedAtMs: Date.now(),
          }),
        }
      : currentMessage?.metadata;
    updateMessage(
      assistantMessageId,
      {
        isStreaming: false,
        ...(cancelledMetadata ? { metadata: cancelledMetadata } : {}),
      },
      conversationId,
    );
    if (!isTemporaryConversation && currentMessage && cancelledMetadata) {
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

  // Mark any in-flight tool cards as failed (a mid-stream error leaves them
  // running otherwise). awaiting_approval cards are left as-is.
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

  // GOV-20: the inline paywall used to render for exactly three free-trial
  // literals. Every PAID ceiling — rolling 5-hour, rolling weekly, flagship
  // weekly, insufficient credits, billing period, rate limit — fell through to
  // a plain error banner with no upgrade path and no reset time, so the users
  // most likely to convert were the only ones shown no way forward. One
  // classifier now owns both, and the required tier is the caller's actual
  // NEXT tier rather than a hardcoded 'basic'.
  const quotaBlock = classifyManagedQuotaErrorCode(errorCode);
  if (quotaBlock) {
    if (errorCode === 'free_trial_token_budget_reached') {
      useFreeTrialStore.getState().markLimitReached();
    }
    const planTier = useBillingStore.getState().subscription?.tier;
    // Null on the top self-serve tier / a sales-assisted plan: there is no
    // self-serve upgrade to offer, so the CTA is suppressed rather than
    // pointing at a tier that does not exist.
    const nextTier = getNextUpgradeTier(planTier);
    const resetAt = error instanceof ChatApiError ? error.resetAt : undefined;
    updateMessage(
      assistantMessageId,
      {
        isStreaming: false,
        content: '',
        error: false,
        metadata: {
          paywall: {
            feature: quotaBlock.feature,
            requiredTier: nextTier ?? 'basic',
            reason: errorMessage || quotaBlock.reason,
            showUpgradeCta: quotaBlock.showUpgradeCta && nextTier !== null,
            showResetTime: quotaBlock.showResetTime,
            suggestStandardModel: quotaBlock.suggestStandardModel,
            ...(resetAt ? { resetAt } : {}),
          },
        },
      },
      conversationId,
    );
    setError(errorMessage, conversationId);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return;
  }

  const errorContent = buildAssistantErrorContent(errorMessage);
  updateMessage(
    assistantMessageId,
    {
      isStreaming: false,
      content: errorContent,
      error: true,
      ...(currentActivity
        ? {
            metadata: {
              ...currentMessage?.metadata,
              agentActivity: finishAgentActivityLocally(currentActivity, {
                status: 'failed',
                completedAtMs: Date.now(),
                error: errorMessage,
              }),
            },
          }
        : {}),
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
