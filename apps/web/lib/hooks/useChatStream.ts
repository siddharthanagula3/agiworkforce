'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useEffect,
  type MutableRefObject,
} from 'react';
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
import { getModelMetadataById, type CloudWorkMode, type Effort } from '@agiworkforce/types';
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
  type ManagedCloudAgentRunHandle,
  type ManagedCloudAgentRunReference,
  type ManagedCloudSaveMessageOptions,
} from '@agiworkforce/cloud-contracts';
import {
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  type AgentActivityState,
} from '@agiworkforce/client-runtime';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  buildFreeTrialPaywallSlot,
  isFreeTrialErrorCode,
  useFreeTrialStore,
} from '@/features/chat/stores/freeTrialStore';
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

interface SendMessageOptions {
  model?: string;
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
  /** Validated product mode; AGI Work exposes the paid server-owned tool harness. */
  workMode?: CloudWorkMode;
}

const STYLE_SYSTEM_INSTRUCTIONS: Record<string, string> = {
  concise: 'Be concise. Give short, direct answers without unnecessary detail.',
  formal: 'Use formal, professional language. Be precise and structured.',
  explanatory: 'Be thorough and educational. Explain concepts in detail with examples.',
};

/** Decision the user made on a single pending tool call. */
export type ToolApprovalDecision = 'approved' | 'rejected';

interface UseChatStreamReturn {
  /**
   * Send a user message and stream the reply. Resolves to `true` once the new user
   * turn has been committed to the transcript (added locally + persisting), or `false`
   * if it bailed before commit (empty content, no conversation, expired session). A
   * mid-stream failure still resolves `true` — the turn is committed and retryable.
   * Callers replacing a prior turn (edit/regenerate) use this to delete the old turn's
   * durable rows ONLY after the new one commits (see sendReplacingMessages).
   */
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<boolean>;
  stopGeneration: () => void;
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

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = 'ChatApiError';
    this.code = options.code;
    this.status = options.status;
  }
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
          message.id &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            message.id,
          )
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

// ─── Shared SSE-stream types + module-level approval registry ───────────────

type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
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
  const seedMetadata =
    ctx.seedContent !== undefined
      ? useChatStore.getState().messages.find((m) => m.id === ctx.assistantMessageId)?.metadata
      : undefined;
  let currentSearchResults: MessageMetadata['searchResults'] = seedMetadata?.searchResults;
  let currentCodeExecutionResult: MessageMetadata['codeExecutionResult'] =
    seedMetadata?.codeExecutionResult;
  let currentResearch: MessageResearchState | undefined = seedMetadata?.research
    ? { ...seedMetadata.research }
    : undefined;
  let currentGeneratedFiles: MessageMetadata['generatedFiles'] = seedMetadata?.generatedFiles;
  let currentAgentActivity: AgentActivityState | undefined = seedMetadata?.agentActivity;
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

  // ── Reasoning (thinking) accumulation ──────────────────────────────────────
  // updateMessage REPLACES metadata wholesale, so a bare `{ metadata: {...} }`
  // update wipes everything else already on the bag (thinkingContent, tools,
  // searchResults). This merge-safe patch reads the current bag and spreads it —
  // without it, closing a `<thinking>` block erased the accumulated reasoning and
  // the block vanished on completion (and never persisted).
  const patchMessageMeta = (patch: Partial<MessageMetadata>) => {
    const current = useChatStore
      .getState()
      .messages.find((m) => m.id === assistantMessageId)?.metadata;
    updateMessage(assistantMessageId, { metadata: { ...current, ...patch } });
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

  // Local ledger of reasoning segments. Published to the store only once a turn
  // has >= 2 blocks (interleaved thinking around tool calls), so single-block
  // turns keep their proven single-`thinkingContent` render + persist path and
  // this stays a no-op for the common case.
  const thinkingSegments: NonNullable<MessageMetadata['thinkingSegments']> = [];

  const publishThinkingSegments = () => {
    if (thinkingSegments.length < 2) return;
    patchMessageMeta({ thinkingSegments: thinkingSegments.map((s) => ({ ...s })) });
  };

  const openThinkingSegment = () => {
    const startedAt = new Date().toISOString();
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
    appendToThinking(assistantMessageId, text);
    const seg = thinkingSegments[thinkingSegments.length - 1];
    if (seg) {
      seg.content += text;
      publishThinkingSegments();
    }
  };

  const closeThinkingSegment = () => {
    const completedAt = new Date().toISOString();
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
    if (finishReason) {
      metadata.finishReason = finishReason;
    }
    if (streamErrorInfo) {
      metadata.streamError = streamErrorInfo;
    }
    // Persist reasoning so it survives reload (previously dropped — only the answer
    // was saved). Read the accumulated thinking off the store bag. Always persist
    // isThinkingStreaming:false and a stable duration so a reloaded turn renders the
    // collapsed "Thought for Ns" summary, never a stuck live timer.
    const persisted = useChatStore
      .getState()
      .messages.find((m) => m.id === assistantMessageId)?.metadata;
    if (persisted?.thinkingSegments && persisted.thinkingSegments.length > 0) {
      metadata.thinkingSegments = persisted.thinkingSegments.map((s) => ({
        ...s,
        isStreaming: false,
      }));
    }
    if (persisted?.thinkingContent && persisted.thinkingContent.trim().length > 0) {
      metadata.thinkingContent = persisted.thinkingContent;
      metadata.isThinkingStreaming = false;
      if (persisted.thinkingStartedAt) metadata.thinkingStartedAt = persisted.thinkingStartedAt;
      if (persisted.thinkingCompletedAt) {
        metadata.thinkingCompletedAt = persisted.thinkingCompletedAt;
      }
      const duration =
        persisted.thinkingDurationSeconds ??
        (persisted.thinkingStartedAt && persisted.thinkingCompletedAt
          ? Math.max(
              0,
              Math.round(
                (Date.parse(persisted.thinkingCompletedAt) -
                  Date.parse(persisted.thinkingStartedAt)) /
                  1000,
              ),
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
      updateMessage(assistantMessageId, { metadata });
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
          updateMessage(assistantMessageId, { id: saved.id });
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
          appendToMessage(assistantMessageId, before);
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
            appendToMessage(assistantMessageId, contentBuffer);
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
          appendToMessage(assistantMessageId, safe);
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
            appendToMessage(assistantMessageId, reconciled.unmatchedIncoming);
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
    setSearching(assistantMessageId, false);
    setExecutingCode(assistantMessageId, false);
    if (finishReason) patchMessageMeta({ finishReason });
    persistAssistant(fullAssistantContent);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return { suspended, pendingCalls, runHandle };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

        const data = trimmedLine.slice(6);
        if (data === '[DONE]') {
          flushContentBuffer(true);
          if (inThinkingBlock) {
            closeThinkingSegment();
            inThinkingBlock = false;
          }
          finishRunningTools();
          setSearching(assistantMessageId, false);
          setExecutingCode(assistantMessageId, false);
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
          if (!duplicateAgentEnvelope && parsed.choices?.[0]?.delta?.content != null) {
            chunk = parsed.choices[0].delta.content;
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
              };
              setResearchState(assistantMessageId, { ...currentResearch });
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
            setSearching(assistantMessageId, true);
          } else if (toolStatus?.status === 'executing') {
            setExecutingCode(assistantMessageId, true);
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
            setCodeExecutionResult(assistantMessageId, currentCodeExecutionResult);
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
              setSearchResults(assistantMessageId, results);
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
            updateMessage(assistantMessageId, { isStreaming: false });
          }
        } catch {
          // Ignore parse errors for incomplete chunks.
        }
      }
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
      setResearchState(assistantMessageId, { ...currentResearch });
      finishRunningTools();
      persistAssistant(fullAssistantContent);
    } else if (researchActive && !isAbort) {
      // Deep Research failed mid-run with a partial report already streamed:
      // keep the partial content, append an honest error note, record the
      // failure on the research state, persist, and tear down here (rethrowing
      // would let handleStreamError overwrite the partial with a bare error).
      const errorMessage = getVisibleErrorMessage(terminalError);
      currentResearch = { ...currentResearch!, phase: 'error', error: errorMessage };
      setResearchState(assistantMessageId, { ...currentResearch });
      finishRunningTools('failed', errorMessage);
      if (fullAssistantContent) {
        flushContentBuffer(true);
        const partialContent = `${fullAssistantContent}\n\n${buildAssistantErrorContent(errorMessage)}`;
        updateMessage(assistantMessageId, {
          isStreaming: false,
          content: partialContent,
          error: true,
        });
        persistAssistant(partialContent);
        useChatStore.getState().setError(errorMessage);
        stopStreaming(conversationId);
        setLoading(false, conversationId);
        return { suspended, pendingCalls, runHandle };
      }
    }
    throw terminalError;
  }
}

/**
 * Hook for handling SSE streaming chat with the LLM API
 */
export function useChatStream(): UseChatStreamReturn {
  const { getToken } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<(ManagedCloudAgentRunHandle & { assistantMessageId: string }) | null>(
    null,
  );

  const addMessage = useChatStore((state) => state.addMessage);
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
  // after, so it is in scope for sendMessage's closure. Shares
  // abortControllerRef with sendMessage/continueGeneration/stopGeneration
  // (Finding 4) so Stop cancels a resume exactly like any other in-flight turn.
  const resolveToolApproval = useResolveToolApproval(abortControllerRef);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}): Promise<boolean> => {
      if (!content.trim()) return false;

      const conversationId = options.conversationId || useChatStore.getState().activeConversationId;
      if (!conversationId) {
        console.error('[useChatStream] No conversation ID available');
        setError('No active conversation. Please create a new conversation first.');
        return false;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const model = options.model || selectedModel;
      const sendReplay = createSendReplayMetadata({
        webSearchEnabled: options.webSearch,
        thinkingEnabled: options.thinkingEnabled,
        codeExecutionEnabled: options.codeExecution,
        officeCreationEnabled: options.officeCreation,
        styleMode: options.styleMode,
        hasSkillInstruction: Boolean(options.skillName),
      });
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
        setError('Your session has expired. Please sign in again.');
        return false;
      }

      const userMessageId = crypto.randomUUID();
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
        attachments: options.attachments,
        metadata: sendReplay ? { sendReplay } : undefined,
      };
      addMessage(userMessage);

      const isTemporaryConversation = Boolean(
        useChatStore
          .getState()
          .conversations.find((conversation) => conversation.id === conversationId)?.isTemporary,
      );
      if (!isTemporaryConversation) {
        saveMessageToDb(
          conversationId,
          {
            id: userMessageId,
            role: 'user',
            content: content.trim(),
            metadata: sendReplay ? { sendReplay } : undefined,
          },
          getAuthToken,
        )
          .then((saved) => {
            if (saved?.id && saved.id !== userMessageId) {
              updateMessage(userMessageId, { id: saved.id });
            }
          })
          .catch((err) => notifyPersistenceFailure('user', err));
      }

      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        model,
        isStreaming: true,
      };
      addMessage(assistantMessage);
      startStreaming(assistantMessageId, conversationId);
      setLoading(true);
      setError(null);

      try {
        const currentMessages = useChatStore.getState().messages;

        const apiMessages: ApiMessage[] = [
          ...currentMessages
            .filter((m) => m.id !== assistantMessageId)
            .map((m) => ({
              role: m.role,
              content: m.content as MessageContent,
            })),
        ];

        // StyleSelector's resolved instruction (preset or custom) is
        // authoritative; fall back to the '+' menu styleMode hint otherwise.
        if (options.styleInstruction) {
          apiMessages.unshift({ role: 'system', content: options.styleInstruction });
        } else if (options.styleMode && options.styleMode !== 'normal') {
          const styleInstruction = STYLE_SYSTEM_INSTRUCTIONS[options.styleMode];
          if (styleInstruction) {
            apiMessages.unshift({ role: 'system', content: styleInstruction });
          }
        }

        if (options.attachments?.some((a) => a.type === 'image')) {
          const lastUserMsgIndex = apiMessages.length - 1;
          if (lastUserMsgIndex >= 0 && apiMessages[lastUserMsgIndex]?.role === 'user') {
            const formattedContent: MessageContent = [
              { type: 'text', text: content.trim() },
              ...options.attachments
                .filter((a) => a.type === 'image' && a.content)
                .map((a) => ({
                  type: 'image_url' as const,
                  image_url: { url: a.content! },
                })),
            ];
            apiMessages[lastUserMsgIndex]!.content = formattedContent;
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
        const thinkingEnabled =
          requestedThinking && (selectedModelMetadata?.capabilities.thinking ?? true);
        const thinkingEffort = options.thinkingEffort ?? thinkingState.effort;
        const response = await fetch('/api/llm/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: apiMessages,
            conversation_id: conversationId,
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            web_search: options.webSearch || options.research || undefined,
            web_fetch: options.webFetch || undefined,
            research: options.research || undefined,
            code_execution: options.codeExecution || undefined,
            office_creation: options.officeCreation || undefined,
            skill_name: options.skillName,
            work_mode: options.workMode,
            thinking_mode: thinkingEnabled || undefined,
            effort: thinkingEnabled ? thinkingEffort : undefined,
            use_prompt_cache: true,
          }),
          signal: abortControllerRef.current?.signal,
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
          });
        }

        const outcome = await consumeAssistantStream({
          response,
          assistantMessageId,
          model,
          conversationId,
          isTemporaryConversation,
          getAuthToken,
          onRunHandle: (handle) => {
            activeRunRef.current = handle ? { ...handle, assistantMessageId } : null;
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
        handleStreamError(error, {
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
        if (activeRunRef.current?.assistantMessageId === assistantMessageId) {
          activeRunRef.current = null;
        }
      }
      // Committed: the new user turn was added (and is persisting) before the stream
      // started, so a mid-stream failure never loses it. The caller may now safely
      // delete any turn this send replaced (see sendReplacingMessages).
      return true;
    },
    [
      selectedModel,
      addMessage,
      updateMessage,
      startStreaming,
      stopStreaming,
      setLoading,
      setError,
      getToken,
      resolveToolApproval,
    ],
  );

  /**
   * Continue a truncated (finish_reason 'length'/'max_tokens') or user-stopped
   * ('stopped') assistant turn. Reuses the normal completions route: the
   * request history ends with the partial assistant message followed by an
   * ephemeral user instruction to continue in place (never stored/rendered).
   * consumeAssistantStream is seeded with the existing content + tool timeline
   * so new tokens APPEND to the same bubble and the terminal persist saves the
   * merged full text. Shares abortControllerRef with sendMessage so
   * stopGeneration cancels a continuation too.
   */
  const continueGeneration = useCallback(
    async (assistantMessageId: string) => {
      const store = useChatStore.getState();
      const conversationId = store.activeConversationId;
      // Scoped to this conversation, not the raw global isStreaming -- a
      // background stream for a DIFFERENT conversation must not block
      // continuing generation on the one actually displayed.
      if (conversationId && store.streamingConversationIds.includes(conversationId)) return;
      const messageIndex = store.messages.findIndex((m) => m.id === assistantMessageId);
      const message = messageIndex >= 0 ? store.messages[messageIndex] : undefined;
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
        setError('Not authenticated');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Thread: everything up to AND INCLUDING the partial assistant turn,
      // then the ephemeral continue instruction (request-only, never stored).
      const apiMessages: ApiMessage[] = store.messages
        .slice(0, messageIndex + 1)
        .map((m) => ({ role: m.role, content: m.content as MessageContent }));
      apiMessages.push({ role: 'user', content: CONTINUE_GENERATION_INSTRUCTION });

      const seedContent = message.content;
      const seedTools = message.metadata?.tools?.map((t) => ({ ...t }));
      const priorMetadata = message.metadata;

      // Clear the continuable marker while the continuation streams; it is
      // re-recorded honestly at stream end (re-offered if truncated again).
      updateMessage(assistantMessageId, {
        isStreaming: true,
        metadata: { ...priorMetadata, finishReason: undefined },
      });
      startStreaming(assistantMessageId, conversationId);
      setLoading(true);
      setError(null);

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
            stream: true,
            use_prompt_cache: true,
          }),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const { message: errMessage, code } = readChatApiErrorPayload(
            errorData,
            `Request failed: ${response.status}`,
          );
          throw new ChatApiError(errMessage, { code, status: response.status });
        }

        await consumeAssistantStream({
          response,
          assistantMessageId,
          model,
          conversationId,
          isTemporaryConversation,
          getAuthToken,
          seedContent,
          seedTools,
          onRunHandle: (handle) => {
            activeRunRef.current = handle ? { ...handle, assistantMessageId } : null;
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
          updateMessage(assistantMessageId, { isStreaming: false });
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
          updateMessage(assistantMessageId, { isStreaming: false, metadata: priorMetadata });
          setError(errorMessage);
          stopStreaming(conversationId);
          setLoading(false, conversationId);
          return;
        }

        // Honest failure without destroying the partial answer: keep whatever
        // has streamed (original partial + any continuation tokens) and append
        // an error note, instead of handleStreamError's replace-with-error.
        const streamedSoFar =
          useChatStore.getState().messages.find((m) => m.id === assistantMessageId)?.content ??
          seedContent;
        const mergedContent = `${streamedSoFar}\n\n${buildAssistantErrorContent(errorMessage)}`;
        updateMessage(assistantMessageId, {
          isStreaming: false,
          content: mergedContent,
          error: true,
        });
        setError(errorMessage);
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
        if (activeRunRef.current?.assistantMessageId === assistantMessageId) {
          activeRunRef.current = null;
        }
      }
    },
    [selectedModel, updateMessage, startStreaming, stopStreaming, setLoading, setError, getToken],
  );

  const stopGeneration = useCallback(() => {
    const activeRun = activeRunRef.current;
    activeRunRef.current = null;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeRun) {
      const client = createManagedCloudAgentRunClient({
        getAuthToken: getToken,
        decorateMutationHeaders: addCsrfHeaders,
      });
      void client.cancelRun(activeRun.runId).catch(() => {
        toast.error('Could not stop the Cloud task. Check its activity before retrying.');
      });
    }
    stopStreaming();
    setLoading(false);
  }, [getToken, stopStreaming, setLoading]);

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
 * `sharedAbortControllerRef` is the SAME ref `sendMessage`/`continueGeneration`
 * use, passed in by the caller rather than owned here. A resume is just
 * another kind of in-flight turn on the conversation, so it must share one
 * abort target with the rest -- previously this hook kept a private
 * `abortRef` that `stopGeneration` never touched, so clicking Stop during a
 * tool-approval resume did nothing (Finding 4).
 */
export function useResolveToolApproval(
  sharedAbortControllerRef: MutableRefObject<AbortController | null>,
): UseChatStreamReturn['resolveToolApproval'] {
  const { getToken } = useAuth();
  const abortRef = sharedAbortControllerRef;

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
      updateToolEntry(assistantMessageId, toolCallId, {
        approved: decision === 'approved',
        requiresApproval: true,
      });

      const selectedMessage = useChatStore
        .getState()
        .messages.find((message) => message.id === assistantMessageId);
      const selectedMetadata: MessageMetadata = {
        ...selectedMessage?.metadata,
        cloudApproval: projectPendingTurn(turn),
      };
      updateMessage(assistantMessageId, { metadata: selectedMetadata });

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
        updateToolEntry(assistantMessageId, call.toolCallId, {
          approved: callDecision === 'approved',
          status: callDecision === 'approved' ? 'running' : 'failed',
          requiresApproval: false,
          ...(callDecision === 'rejected'
            ? {
                error: 'You denied this tool.',
                result: 'The user denied permission to run this tool.',
              }
            : {}),
        });
      }

      // Provider so the terminal persist after a long resume continuation uses a
      // fresh token (see AuthTokenProvider), not one captured here.
      let authToken: string;
      try {
        authToken = await getAuthToken();
      } catch {
        turn.resolving = false;
        for (const call of turn.calls) {
          updateToolEntry(assistantMessageId, call.toolCallId, {
            approved: turn.decisions.get(call.toolCallId) === 'approved',
            status: 'awaiting_approval',
            requiresApproval: true,
            error: undefined,
            result: undefined,
          });
        }
        setError('Not authenticated');
        return;
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      const assistantContent =
        useChatStore.getState().messages.find((m) => m.id === assistantMessageId)?.content ?? '';
      const toolApprovals = turn.calls.map((c) => ({
        tool_call_id: c.toolCallId,
        decision: turn.decisions.get(c.toolCallId) ?? 'rejected',
      }));

      const seedTools = useChatStore.getState().messages.find((m) => m.id === assistantMessageId)
        ?.metadata?.tools;

      startStreaming(assistantMessageId, turn.conversationId);
      setLoading(true);
      setError(null);

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
        const response = await fetch('/api/llm/v1/chat/completions/approve', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            run_id: turn.runId,
            tool_approvals: toolApprovals,
          }),
          signal: abortRef.current?.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const { message, code } = readChatApiErrorPayload(
            errorData,
            `Resume failed: ${response.status}`,
          );
          throw new ChatApiError(message, { code, status: response.status });
        }

        const outcome = await consumeAssistantStream({
          response,
          assistantMessageId,
          model: turn.model,
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
            updateToolEntry(assistantMessageId, call.toolCallId, {
              approved: callDecision === undefined ? undefined : callDecision === 'approved',
              status: 'awaiting_approval',
              requiresApproval: true,
              error: undefined,
              result: undefined,
            });
          }
          updateMessage(assistantMessageId, { isStreaming: false });
          setError(getVisibleErrorMessage(error));
          stopStreaming(turn.conversationId);
          setLoading(false, turn.conversationId);
          return;
        }
        pendingTurns.delete(assistantMessageId);
        handleStreamError(error, {
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
      }
    },
    [abortRef, getToken],
  );
}

// ─── Error handling shared by sendMessage + resolveToolApproval ─────────────

interface StreamErrorContext {
  assistantMessageId: string;
  model: string;
  conversationId: string;
  isTemporaryConversation: boolean;
  getAuthToken: AuthTokenProvider;
  setError: (message: string | null) => void;
  stopStreaming: (conversationId?: string) => void;
  setLoading: (loading: boolean, conversationId?: string) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
}

function handleStreamError(error: unknown, ctx: StreamErrorContext): void {
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
  if (isAbort) {
    updateMessage(assistantMessageId, { isStreaming: false });
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return;
  }

  const errorMessage = getVisibleErrorMessage(error);

  // Mark any in-flight tool cards as failed (a mid-stream error leaves them
  // running otherwise). awaiting_approval cards are left as-is.
  const failing = useChatStore.getState().messages.find((m) => m.id === assistantMessageId)
    ?.metadata?.tools;
  if (failing && failing.some((t) => t.status === 'pending' || t.status === 'running')) {
    useChatStore.getState().setToolTimeline(
      assistantMessageId,
      failing.map((t) =>
        t.status === 'pending' || t.status === 'running'
          ? { ...t, status: 'failed' as const, error: errorMessage }
          : { ...t },
      ),
    );
  }

  const errorCode = error instanceof ChatApiError ? error.code : undefined;
  if (isFreeTrialErrorCode(errorCode)) {
    if (errorCode === 'free_trial_token_budget_reached') {
      useFreeTrialStore.getState().markLimitReached();
    }
    updateMessage(assistantMessageId, {
      isStreaming: false,
      content: '',
      error: false,
      metadata: {
        paywall: buildFreeTrialPaywallSlot(errorCode, errorMessage),
      },
    });
    setError(errorMessage);
    stopStreaming(conversationId);
    setLoading(false, conversationId);
    return;
  }

  const errorContent = buildAssistantErrorContent(errorMessage);
  updateMessage(assistantMessageId, {
    isStreaming: false,
    content: errorContent,
    error: true,
  });
  setError(errorMessage);

  if (!isTemporaryConversation) {
    const metadata = useChatStore
      .getState()
      .messages.find((message) => message.id === assistantMessageId)?.metadata;
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
          updateMessage(assistantMessageId, { id: saved.id });
        }
      })
      .catch((err) => notifyPersistenceFailure('assistant', err));
  }

  stopStreaming(conversationId);
  setLoading(false, conversationId);
}
