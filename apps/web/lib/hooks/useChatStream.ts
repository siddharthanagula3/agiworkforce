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
import {
  INTERACTIVE_CARD_RESPONSE_PATH,
  RESPONDABLE_INTERACTIVE_CARD_KIND,
  type InteractiveCardResponseRequest,
} from '@/app/api/interactive-cards/response-contract';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { FALLBACK_REASON_HEADER } from '@/lib/chat-fallback-reason';
import { getBrowserTimeZone } from '@/lib/client/browser-timezone';
import { isFreeTrialErrorCode, useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import type { ResearchStep } from '@agiworkforce/types';
import { parseResearchPlanEvent } from '@/features/chat/utils/research-plan';
import { parseAgiWorkPlanEvent, type AgiWorkGoalInput } from '@/features/chat/utils/agiwork-plan';
import {
  resolveQuotaPaywallSlot,
  type ServerQuotaRecovery,
} from '@/features/chat/lib/quotaPaywallSlot';
import { useBillingStore } from '@shared/stores/web-auth-store';
import {
  createSendReplayMetadata,
  hasWebSearchSources,
} from '@/features/chat/types/message-metadata';
import {
  CONTINUE_GENERATION_INSTRUCTION,
  isMessageContinuable,
} from '@/features/chat/lib/continue-generation';
import { repairContinuationSeam, SEAM_INSPECTION_WINDOW } from '@agiworkforce/unified-chat';
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
  resolveToolApproval: (
    assistantMessageId: string,
    toolCallId: string,
    decision: ToolApprovalDecision,
    guidance?: string,
  ) => Promise<void>;
  isStreaming: boolean;
}

class ChatApiError extends Error {
  code: string | undefined;
  status: number | undefined;
  resetAt: string | undefined;
  recovery: ServerQuotaRecovery | undefined;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      resetAt?: string;
      recovery?: ServerQuotaRecovery;
    } = {},
  ) {
    super(message);
    this.name = 'ChatApiError';
    this.code = options.code;
    this.status = options.status;
    this.resetAt = options.resetAt;
    this.recovery = options.recovery;
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

function readServerQuotaRecovery(value: unknown): ServerQuotaRecovery | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const action = readString((value as Record<string, unknown>)['action']);
  const href = readString((value as Record<string, unknown>)['href']);
  return action && href ? { action, href } : undefined;
}

/**
 * True only for an expired or missing session. A 403 is a permission answer and
 * a 429 is a quota answer — neither means "sign in and try that again", so
 * neither should repopulate the composer.
 */
function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof ChatApiError) return error.status === 401;
  return false;
}

function readChatApiErrorPayload(
  payload: unknown,
  fallbackMessage: string,
): { message: string; code?: string; recovery?: ServerQuotaRecovery } {
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
    const recovery = readServerQuotaRecovery(errorBody['recovery']);
    return {
      message: nestedMessage ?? topLevelMessage ?? fallbackMessage,
      code: nestedCode ?? topLevelCode,
      ...(recovery ? { recovery } : {}),
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

function readConversationMessages(conversationId: string): Message[] {
  const state = useChatStore.getState();
  const bucket = state.messagesByConversation[conversationId];
  if (bucket) return bucket;
  return state.activeConversationId === conversationId ? state.messages : [];
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

export interface InteractiveCardResponseBinding {
  conversationId: string;
  messageId: string;
  cardId: string;
}

export const WEB_INTERACTIVE_CARD_KINDS = [
  'clarify.v1',
  'map-search.v1',
  'mcp-app.v1',
] as const satisfies readonly KnownInteractiveCardKind[];

export type WebInteractiveCardKind = (typeof WEB_INTERACTIVE_CARD_KINDS)[number];

const WEB_INTERACTIVE_CARD_CAPABILITY: InteractiveCardClientCapability = {
  supported: [...WEB_INTERACTIVE_CARD_KINDS],
  canRespond: WEB_INTERACTIVE_CARD_KINDS.includes(RESPONDABLE_INTERACTIVE_CARD_KIND),
};

const INTERACTIVE_CARD_RESPONSE_FAILURE_MESSAGE =
  "Couldn't send that answer — the questions are still waiting for you.";

const CLARIFY_ANSWERED_PREAMBLE = 'The user answered the clarifying questions:';
const CLARIFY_DISMISSED_PREAMBLE = 'The user declined the clarifying questions and said instead:';
const CLARIFY_DISMISSED_SILENTLY = 'The user declined the clarifying questions without answering.';

/**
 * The client default is one poll per second — 60 requests a minute against a
 * per-minute limiter, which leaves no headroom for a second surface following
 * the same run and buys nothing: the journal is written in coalesced batches,
 * so a faster poll returns the same rows more often.
 */
const DURABLE_RUN_POLL_INTERVAL_MS = 2_500;

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

const inFlightCardResponses = new Set<string>();

export async function respondToInteractiveCard(
  binding: InteractiveCardResponseBinding,
  payload: InteractiveCardResponsePayload,
): Promise<void> {
  const inFlightKey = `${binding.conversationId}:${binding.messageId}:${binding.cardId}`;
  if (inFlightCardResponses.has(inFlightKey)) return;
  inFlightCardResponses.add(inFlightKey);
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
  onRunHandle?: (handle: ManagedCloudAgentRunHandle | null) => void;
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

  // The stream ending is itself the terminal signal: a run that never emitted a
  // stop envelope (deep research, server tools) would otherwise keep rendering
  // "Working…" under a finished answer.
  const settleAgentActivity = () => {
    if (!currentAgentActivity) return;
    if (currentAgentActivity.status !== 'running') return;
    if (suspended) return;
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

  const openThinkingSegment = () => {
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
  };

  const appendThinkingText = (text: string) => {
    thinkingContent += text;
    appendToThinking(assistantMessageId, text, conversationId);
    const seg = thinkingSegments[thinkingSegments.length - 1];
    if (seg) {
      seg.content += text;
      publishThinkingSegments();
    }
  };

  const closeThinkingSegment = () => {
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
      appendToMessage(assistantMessageId, repaired, conversationId);
      return;
    }

    if (!text) return;
    fullAssistantContent += text;
    unacknowledgedPublicText += text;
    appendToMessage(assistantMessageId, text, conversationId);
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
    const followed = await client.followRun(runHandle.runId, {
      afterSequence,
      pollIntervalMs: DURABLE_RUN_POLL_INTERVAL_MS,
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
    if (followed.run.state !== 'awaiting_input' && followed.run.state !== 'paused') {
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
          persistAssistant(fullAssistantContent);
          stopStreaming(conversationId);
          setLoading(false, conversationId);
          return { suspended, pendingCalls, runHandle };
        }

        try {
          const parsed = JSON.parse(data);

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
              if (currentResearch) {
                currentResearch = { ...currentResearch, sourcesForRetry: results };
                setResearchState(assistantMessageId, { ...currentResearch }, conversationId);
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
    throw terminalError;
  } finally {
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
      addMessage(userMessage, conversationId);

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
      if (!isTemporaryConversation) {
        try {
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
      setLoading(true, conversationId);
      setError(null, conversationId);

      try {
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
          const { message, code, recovery } = readChatApiErrorPayload(
            errorData,
            `Request failed: ${response.status}`,
          );
          throw new ChatApiError(message, {
            code,
            status: response.status,
            resetAt: readErrorResetAt(errorData, response),
            ...(recovery ? { recovery } : {}),
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
        }
      } catch (error) {
        // CAP-040: a turn interrupted by an expired session was unrecoverable.
        // The composer clears on send, so by the time the 401 came back the
        // user's text survived only as a failed turn in the transcript — sign
        // back in and you retype it. Parking it as this conversation's draft
        // repopulates the composer with exactly what they wrote. An existing
        // draft wins: whatever they have typed since is newer than this.
        if (isSessionExpiredError(error) && content.trim()) {
          const store = useChatStore.getState();
          // The store keys drafts by conversation id (web-chat-store.ts
          // conversationKey), so a non-null id indexes directly.
          if (!store.draftsByConversation?.[conversationId]) {
            store.setDraftContent(content, conversationId);
          }
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
      if (!message || !isMessageContinuable(message)) return;

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
        apiMessages.push({ role: 'user', content: CONTINUE_GENERATION_INSTRUCTION });

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
            } = readChatApiErrorPayload(errorData, `Request failed: ${response.status}`);
            throw new ChatApiError(errMessage, {
              code,
              status: response.status,
              resetAt: readErrorResetAt(errorData, response),
              ...(recovery ? { recovery } : {}),
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
          const { message, code, recovery } = readChatApiErrorPayload(
            errorData,
            `Resume failed: ${response.status}`,
          );
          throw new ChatApiError(message, {
            code,
            status: response.status,
            resetAt: readErrorResetAt(errorData, response),
            ...(recovery ? { recovery } : {}),
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
    ...(error instanceof ChatApiError && error.recovery ? { recovery: error.recovery } : {}),
    ...(error instanceof ChatApiError && error.resetAt ? { resetAt: error.resetAt } : {}),
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
