import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { AbortError } from '@agiworkforce/utils/async';
import {
  SSE_DONE_DATA,
  ServerSentEventFrameLimitError,
  readServerSentEvents,
  splitJoinedServerSentEventData,
} from '@agiworkforce/client-runtime';
import {
  getModelMetadataById,
  getProviderOffering,
  messageKindForAgentEvent,
  MOVED_FROM_MODEL_HEADER,
  MOVED_REASON_HEADER,
  type CloudWorkMode,
  type Effort,
  type Provider,
  type ResearchStep,
  type RoutingProfileChoice,
  WEB_SEARCH_CITATION_DELTA_KEY,
  type WebSearchCitationDeltaWire,
} from '@agiworkforce/types';
import type { AgentEventEnvelope, AgentEventSource } from '@agiworkforce/types/protocol';
import { getAuthToken } from './authSession';
import {
  captureCloudAccountEpoch,
  assertCloudAccountEpochCurrent,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { guardedFetch } from '@/lib/egressGuard';
import { ApiPaywallError, recoverStreamSession, streamAuthRefusal } from './api';
import {
  ApiHttpError,
  CloudCredentialUnavailableError,
  httpErrorFrom,
  parseJsonBody,
  rateLimitErrorFrom,
} from './apiErrors';
import { ensureCloudSendConsent, ensureLlmGateOpen } from './llmGate';
import { StreamConnectionLostError, isIdempotencyReplayRefusal } from './streamConnectionLost';
import { surfaceTermsNotice } from './termsNotice';
import { assertRemoteChatAllowed } from './remoteChatGate';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useModelStore } from '@/src/features/model-picker/store';
import { isFreeQuotaTurnModelId } from '@/src/features/model-picker/service';
import { fastSpeedForModel } from '@/src/features/model-picker/fastMode';
import { useTermsAcceptanceStore } from '@/src/features/auth/store/termsAcceptanceStore';
import { createChatStreamDedupe } from '@/src/lib/chat-stream-dedupe';
import type {
  ManagedMemoryCitations,
  ProjectFileCitation,
  ResearchDeliverableSpec,
} from '@agiworkforce/types';
import { readMemoryCitationsHeader } from '@/src/features/memory/services/memoryCitations';
import {
  readPastChatCitationsHeader,
  readProjectFileCitationsHeader,
  type PastChatCitation,
} from '@/src/features/chat/utils/referenceCitations';
import {
  readModelSubstitution,
  type ModelSubstitution,
} from '@/src/features/chat/utils/fallbackNotice';
import { nativeCitationFromDelta } from '@/src/features/chat/utils/messageSources';
import {
  createManagedChatIdempotencyKey,
  type ManagedChatPurpose,
} from '@agiworkforce/utils/managed-chat-idempotency';
import {
  createManagedCloudAgentRunClient,
  parseToolStatusDelta,
  parseToolResultDelta,
  parseToolApprovalRequestDelta,
  ToolApprovalReviewWireSchema,
  type ToolApprovalDecisionValue,
  type ToolApprovalReviewWire,
  parseToolInputRequestDelta,
  parseAgentEventDelta,
  readManagedCloudAgentRunHandle,
  readAttachmentTruncationHeader,
  ATTACHMENTS_TRUNCATED_HEADER,
  TOOL_APPROVAL_RESUME_PATH,
  TOOL_INPUT_RESUME_PATH,
  DEVICE_STEP_RESUME_PATH,
  FREE_QUOTA_COMPLETIONS_PATH,
  ROUTE_LANE_HEADER,
  SECRET_REDACTION_COUNT_HEADER,
  readRouteLane,
  type ChatRouteLane,
  type DeviceStepResultWire,
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunReference,
  type FreeQuotaMessageContent,
} from '@agiworkforce/cloud-contracts';
import { getDeviceTimeZone } from '../src/platform/deviceTimeZone';
import { platformRequestHeaders } from '../src/platform/platformHeaders';
import { phoneDeviceHostHeaders } from '@/src/features/integrations/services/phoneDeviceHost';

export interface ChatWireMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface StreamToolCallFragment {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface StreamToolStatus {
  type?: string;
  name?: string;
  status?: string;
  status_phrase?: string;
  args?: unknown;
}

/** MCP tool result (`x_tool_result`), validated the same way as {@link StreamToolStatus}. */
export interface StreamToolResult {
  tool_call_id: string;
  name?: string;
  content?: unknown;
  is_error?: boolean;
}

/**
 * MCP/connector approval request (`x_tool_approval_request`), emitted in
 * manual mode when a tool call is suspended awaiting the user's decision.
 * Validated the same way as {@link StreamToolStatus}.
 */
export interface StreamToolApprovalRequest extends Partial<ToolApprovalReviewWire> {
  tool_call_id: string;
  name: string;
  args?: unknown;
}

export interface StreamToolInputRequest {
  tool_call_id: string;
  name: string;
  connector_id?: string;
  input_requests: Record<string, unknown>;
  round?: number;
}

export interface StreamGeneratedFile {
  id: string;
  file_name: string;
  mime_type: string;
  uri: string;
  byte_count: number;
  kind: string;
  checksum_sha256?: string;
}

export interface StreamDelta {
  content?: string;
  role?: string;
  finish_reason?: string | null;
  tool_calls?: StreamToolCallFragment[];
  x_tool_status?: StreamToolStatus;
  x_tool_result?: StreamToolResult;
  x_tool_approval_request?: StreamToolApprovalRequest;
  x_tool_input_request?: StreamToolInputRequest;
  x_agent_event?: AgentEventEnvelope;
  x_code_result?: unknown;
  x_search_results?: unknown;
  [WEB_SEARCH_CITATION_DELTA_KEY]?: WebSearchCitationDeltaWire;
  x_research_status?: unknown;
  x_research_plan?: unknown;
  x_generated_files?: { files?: StreamGeneratedFile[] };
  x_interactive_card?: unknown;
  x_agiwork_plan?: unknown;
  x_stream_error?: {
    message: string;
    code?: string;
    retryable?: boolean;
    retryAfterSeconds?: number;
    requestId?: string;
  };
  durableReplay?: true;
}

export interface StreamCallbacks {
  onDelta: (delta: StreamDelta) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  onReconnecting?: (attempt: number) => void;
  onActivity?: () => void;
  onRunReference?: (reference: ManagedCloudAgentRunReference) => void;
  onAttachmentsTruncated?: (fileNames: string[]) => void;
  onMemoryCitations?: (citations: ManagedMemoryCitations) => void;
  onProjectSources?: (citations: ProjectFileCitation[]) => void;
  onPastChatSources?: (citations: PastChatCitation[]) => void;
  onModelSubstitution?: (substitution: ModelSubstitution) => void;
  onTurnNotices?: (notices: TurnNoticeHeaders) => void;
}

export interface TurnNoticeHeaders {
  movedFromModel?: string;
  movedReason?: string;
  routeLane?: ChatRouteLane;
  secretRedactionCount?: number;
}

type HeaderReader = Pick<Headers, 'get'>;

export function readTurnNoticeHeaders(headers: HeaderReader): TurnNoticeHeaders {
  const movedFromModel = headers.get(MOVED_FROM_MODEL_HEADER)?.trim();
  const movedReason = headers.get(MOVED_REASON_HEADER)?.trim();
  const routeLane = readRouteLane(headers.get(ROUTE_LANE_HEADER));
  const redactions = Number(headers.get(SECRET_REDACTION_COUNT_HEADER)?.trim() || Number.NaN);
  return {
    ...(movedFromModel ? { movedFromModel } : {}),
    ...(movedFromModel && movedReason ? { movedReason } : {}),
    ...(routeLane ? { routeLane } : {}),
    ...(Number.isInteger(redactions) && redactions > 0 ? { secretRedactionCount: redactions } : {}),
  };
}

function accountStreamCallbacks(
  callbacks: StreamCallbacks,
  account: CloudAccountEpoch | null,
): StreamCallbacks {
  const guard =
    <Args extends unknown[]>(callback: ((...args: Args) => void) | undefined) =>
    (...args: Args): void => {
      if (isCloudAccountEpochCurrent(account)) callback?.(...args);
    };
  return {
    onDelta: guard(callbacks.onDelta),
    onDone: guard(callbacks.onDone),
    onError: guard(callbacks.onError),
    onReconnecting: guard(callbacks.onReconnecting),
    onActivity: guard(callbacks.onActivity),
    onRunReference: guard(callbacks.onRunReference),
    onAttachmentsTruncated: guard(callbacks.onAttachmentsTruncated),
    onMemoryCitations: guard(callbacks.onMemoryCitations),
    onProjectSources: guard(callbacks.onProjectSources),
    onPastChatSources: guard(callbacks.onPastChatSources),
    onModelSubstitution: guard(callbacks.onModelSubstitution),
    onTurnNotices: guard(callbacks.onTurnNotices),
  };
}

const STREAM_DELIVERY_INTERVAL_MS = 16;

// A burst of events is parsed in one run of microtasks, and React Native renders
// a store write from a microtask, so handing each event over as it is parsed
// re-renders the transcript once per event and holds every tap, Stop included,
// until the burst is drawn. Events are handed over at most once a frame instead,
// in their original order, ahead of any callback that follows them.
function frameStreamCallbacks(callbacks: StreamCallbacks, signal?: AbortSignal): StreamCallbacks {
  let queued: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failed = false;
  let deliveredRunId: string | null = null;

  const flush = (): boolean => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const due = queued;
    queued = [];
    if (failed || signal?.aborted) return false;
    for (const deliver of due) {
      try {
        deliver();
      } catch (error) {
        failed = true;
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        return false;
      }
    }
    return true;
  };

  const later =
    <Args extends unknown[]>(callback: ((...args: Args) => void) | undefined) =>
    (...args: Args): void => {
      if (!callback || failed) return;
      queued.push(() => callback(...args));
      timer ??= setTimeout(flush, STREAM_DELIVERY_INTERVAL_MS);
    };

  const inOrder =
    <Args extends unknown[]>(callback: ((...args: Args) => void) | undefined) =>
    (...args: Args): void => {
      if (flush()) callback?.(...args);
    };

  const laterRunReference = later(callbacks.onRunReference);
  const inOrderRunReference = inOrder(callbacks.onRunReference);

  return {
    onDelta: later(callbacks.onDelta),
    onDone: inOrder(callbacks.onDone),
    onError: inOrder(callbacks.onError),
    onReconnecting: inOrder(callbacks.onReconnecting),
    onActivity: callbacks.onActivity,
    onRunReference: (reference) => {
      if (reference.runId === deliveredRunId) {
        laterRunReference(reference);
        return;
      }
      deliveredRunId = reference.runId;
      inOrderRunReference(reference);
    },
    onAttachmentsTruncated: inOrder(callbacks.onAttachmentsTruncated),
    onMemoryCitations: inOrder(callbacks.onMemoryCitations),
    onProjectSources: inOrder(callbacks.onProjectSources),
    onPastChatSources: inOrder(callbacks.onPastChatSources),
    onModelSubstitution: inOrder(callbacks.onModelSubstitution),
    onTurnNotices: inOrder(callbacks.onTurnNotices),
  };
}

const MAX_RECONNECT_ATTEMPTS = 3;

const RECONNECT_DELAYS = [1_000, 2_500, 5_000];

function sanitizeToolEventFields(delta: StreamDelta): void {
  if (delta.x_tool_status !== undefined) {
    delta.x_tool_status = parseToolStatusDelta(delta.x_tool_status) ?? delta.x_tool_status;
  }
  if (delta.x_tool_result !== undefined) {
    delta.x_tool_result = parseToolResultDelta(delta.x_tool_result) ?? delta.x_tool_result;
  }
  if (delta.x_tool_approval_request !== undefined) {
    const raw = delta.x_tool_approval_request;
    const request = parseToolApprovalRequestDelta(raw);
    const review = ToolApprovalReviewWireSchema.safeParse(raw);
    delta.x_tool_approval_request = request
      ? {
          tool_call_id: request.tool_call_id,
          name: request.name,
          args: request.args,
          ...(review.success ? review.data : {}),
        }
      : raw;
  }
  if (delta.x_tool_input_request !== undefined) {
    const inputRequest = parseToolInputRequestDelta(delta.x_tool_input_request);
    if (inputRequest) {
      delta.x_tool_input_request = inputRequest;
    } else {
      delete delta.x_tool_input_request;
    }
  }
  if (delta[WEB_SEARCH_CITATION_DELTA_KEY] !== undefined) {
    const citation = nativeCitationFromDelta(delta[WEB_SEARCH_CITATION_DELTA_KEY]);
    if (citation) {
      delta[WEB_SEARCH_CITATION_DELTA_KEY] = { url: citation.url, title: citation.title };
    } else {
      delete delta[WEB_SEARCH_CITATION_DELTA_KEY];
    }
  }
  if (delta.x_agent_event !== undefined) {
    const agentEvent = parseAgentEventDelta(delta.x_agent_event);
    if (agentEvent) {
      delta.x_agent_event = agentEvent;
    } else {
      delete delta.x_agent_event;
    }
  }
}

type SseOutcome = 'done' | 'detached' | null;

function processSseData(data: string, callbacks: StreamCallbacks): SseOutcome {
  for (const payload of splitJoinedServerSentEventData(data)) {
    const trimmed = payload.trim();
    if (!trimmed) continue;
    if (trimmed === SSE_DONE_DATA) return 'done';

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const choice = parsed?.choices?.[0];
    // The function budget ended this connection, not the run: the [DONE]
    // that follows is not the end of the answer.
    if (choice?.delta?.x_run_detached) return 'detached';
    if (choice?.delta) {
      sanitizeToolEventFields(choice.delta);
      callbacks.onDelta(choice.delta);
    }
    if (choice?.finish_reason) {
      callbacks.onDelta({ finish_reason: choice.finish_reason });
    }
  }
  return null;
}

const COMPLETIONS_PATH = '/api/llm/v1/chat/completions';
const STREAM_ENDED_EARLY_MESSAGE = 'The response ended before completion. Please retry.';

export function createMobileCloudAgentRunClient(
  account: CloudAccountEpoch | null = captureCloudAccountEpoch(),
  control: { withdrawalControl?: boolean } = {},
): ManagedCloudAgentRunClient {
  const assertCurrent = () => assertCloudAccountEpochCurrent(account);
  const complete = async <T>(operation: () => Promise<T>): Promise<T> => {
    assertCurrent();
    try {
      return await operation();
    } finally {
      assertCurrent();
    }
  };
  const client = createManagedCloudAgentRunClient({
    baseUrl: API_URL,
    getAuthToken: () =>
      complete(async () => {
        const token = await getAuthToken();
        assertCurrent();
        if (!token) throw httpErrorFrom(401, '');
        return token;
      }),
    decorateMutationHeaders: (headers) => {
      assertCurrent();
      return {
        ...headers,
        'Content-Type': 'application/json',
        ...platformRequestHeaders(),
      };
    },
    fetchImpl: async (input, init) => {
      assertCurrent();
      const response = isDetachedResume(input)
        ? await guardedFetch(input, init, { stream: true })
        : control.withdrawalControl
          ? await guardedFetch(input, init, { withdrawalControl: true })
          : await guardedFetch(input, init);
      assertCurrent();
      if (response.status === 403) await noticeRunRefusal(response, account);
      assertCurrent();
      return response;
    },
    wait: (ms, signal) =>
      complete(
        () =>
          new Promise<void>((resolve, reject) => {
            if (signal?.aborted) {
              reject(new AbortError('Run follow cancelled'));
              return;
            }
            const onAbort = () => {
              clearTimeout(timer);
              signal?.removeEventListener('abort', onAbort);
              reject(new AbortError('Run follow cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', onAbort);
              resolve();
            }, ms);
            signal?.addEventListener('abort', onAbort, { once: true });
          }),
      ),
  });
  return {
    listRuns: (...args) => complete(() => client.listRuns(...args)),
    getRun: (...args) => complete(() => client.getRun(...args)),
    cancelRun: (...args) => complete(() => client.cancelRun(...args)),
    resumeRun: (...args) => complete(() => client.resumeRun(...args)),
    answerRunInput: (...args) => complete(() => client.answerRunInput(...args)),
    pauseRun: (...args) => complete(() => client.pauseRun(...args)),
    resumePausedRun: (...args) => complete(() => client.resumePausedRun(...args)),
    steerRun: (...args) => complete(() => client.steerRun(...args)),
    withdrawSteer: (...args) => complete(() => client.withdrawSteer(...args)),
    followRun: (runId, options = {}) =>
      complete(() =>
        client.followRun(runId, {
          ...options,
          onEvent: (event) =>
            complete(async () => {
              await options.onEvent?.(event);
            }),
          onSnapshot: (snapshot) =>
            complete(async () => {
              await options.onSnapshot?.(snapshot);
            }),
        }),
      ),
  };
}

/**
 * A run's approve, resume, follow and cancel calls pass the same gate as a chat
 * turn, so a passkey step-up, an unavailable account or new terms can refuse
 * them too. The caller still sees the refusal; this makes the app act on it as
 * it does for a turn, instead of showing a bare 403.
 */
async function noticeRunRefusal(
  response: Response,
  account: CloudAccountEpoch | null,
): Promise<void> {
  const text = await response
    .clone()
    .text()
    .catch(() => '');
  assertCloudAccountEpochCurrent(account);
  streamAuthRefusal(403, text);
  if (isCloudAccountEpochCurrent(account) && isTermsRefusal(text)) {
    const terms = useTermsAcceptanceStore.getState();
    if (terms.userId && terms.status !== 'checking') void terms.recheck(terms.userId);
  }
}

function isDetachedResume(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/, 1)[0];
  return path === TOOL_APPROVAL_RESUME_PATH || path === TOOL_INPUT_RESUME_PATH;
}

const TERMS_REVIEW_MESSAGE =
  'The Terms of Service need your agreement before AGI Cloud can answer. Review them in the app, then send again.';

function isTermsRefusal(text: string): boolean {
  const body = parseJsonBody(text) as { error?: { code?: unknown } } | null;
  return String(body?.error?.code ?? '').toLowerCase() === 'terms_acceptance_required';
}

export async function cancelMobileCloudAgentRun(runId: string) {
  return createMobileCloudAgentRunClient().cancelRun(runId);
}

interface InitialStreamRequest {
  model: string;
  messages: ChatWireMessage[];
  stream: true;
  operationId: string;
  conversation_id?: string;
  thinking?: boolean;
  effort?: Effort | 'none' | 'minimal';
  web_search?: boolean;
  web_fetch?: boolean;
  research?: boolean;
  research_resume?: {
    sources?: Array<Omit<AgentEventSource, 'title'> & { title?: string }>;
    steps?: ResearchStep[];
    approved_steps?: ResearchStep[];
    deliverable?: ResearchDeliverableSpec;
    guidance?: string;
  };
  research_sources?: {
    files?: true;
    allow_domains?: string[];
    deny_domains?: string[];
    connectors?: string[];
  };
  code_execution?: boolean;
  office_creation?: boolean;
  work_mode?: CloudWorkMode;
  agi_work_goal?: { goal: string; constraints?: string; deliverable?: string };
  agi_work_plan?: { steps: string[] };
  agi_work_plan_approval?: boolean;
  skill_name?: string;
  personalization?: false;
  routing_profile?: RoutingProfileChoice;
  speed?: 'fast';
  tool_choice?: 'auto' | 'none' | 'required';
  memory_enabled?: boolean;
  connector_tools_enabled?: boolean;
  disabled_connector_ids?: string[];
  x_interactive_cards?: { supported: string[]; canRespond: boolean };
  client_timezone?: string;
}

interface ApprovalResumeRequest {
  run_id: string;
  operationId: string;
  tool_approvals: Array<{ tool_call_id: string; decision: ToolApprovalDecisionValue }>;
  guidance?: string;
}

interface ToolInputResumeRequest {
  run_id: string;
  operationId: string;
  tool_inputs: Array<{ tool_call_id: string; input_responses: Record<string, unknown> }>;
}

interface DeviceStepResumeRequest {
  run_id: string;
  operationId: string;
  device_id: string;
  device_results: DeviceStepResultWire[];
}

export interface FreeQuotaStreamRequest {
  model: string;
  conversation_id: string;
  assistant_message_id: string;
  operationId: string;
  user_message?: {
    id: string;
    metadata?: Record<string, unknown>;
    parent_id?: string | null;
  };
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: FreeQuotaMessageContent;
  }>;
}

type CompletionPurpose = Extract<ManagedChatPurpose, 'send' | 'continue'>;

async function attemptStream(
  body:
    | InitialStreamRequest
    | ApprovalResumeRequest
    | ToolInputResumeRequest
    | DeviceStepResumeRequest
    | FreeQuotaStreamRequest,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
  account: CloudAccountEpoch,
  path: string = COMPLETIONS_PATH,
  sessionRecovered = false,
  purpose: CompletionPurpose = 'send',
): Promise<boolean | 'detached'> {
  assertCloudAccountEpochCurrent(account);
  const token = await getAuthToken();
  assertCloudAccountEpochCurrent(account);
  if (signal.aborted) throw new AbortError('Stream cancelled before network egress');
  if (!token) throw httpErrorFrom(401, '');

  const { operationId, ...requestBody } = body;
  const payload =
    'thinking' in requestBody
      ? (() => {
          const { thinking, ...restBody } = requestBody;
          return {
            ...restBody,
            ...(typeof thinking === 'boolean' ? { thinking_mode: thinking } : {}),
          };
        })()
      : requestBody;
  const deviceHostHeaders =
    path === FREE_QUOTA_COMPLETIONS_PATH ? {} : await phoneDeviceHostHeaders();

  assertCloudAccountEpochCurrent(account);
  if (signal.aborted) throw new AbortError('Stream cancelled before network egress');
  const response = await guardedFetch(
    `${API_URL}${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...platformRequestHeaders(),
        ...deviceHostHeaders,
        'Idempotency-Key': createManagedChatIdempotencyKey({
          surface: 'mobile',
          purpose:
            path === TOOL_APPROVAL_RESUME_PATH ||
            path === TOOL_INPUT_RESUME_PATH ||
            path === DEVICE_STEP_RESUME_PATH
              ? 'tool-resume'
              : purpose,
          operationId,
        }),
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal,
    },
    { stream: true },
  );

  assertCloudAccountEpochCurrent(account);
  if (!response.ok) {
    const text = await response.text();
    assertCloudAccountEpochCurrent(account);

    if (response.status === 401 && !sessionRecovered && !signal.aborted) {
      const recovered = await recoverStreamSession(account);
      assertCloudAccountEpochCurrent(account);
      if (recovered) {
        return attemptStream(body, callbacks, signal, account, path, true, purpose);
      }
    }

    const authRefusal = streamAuthRefusal(response.status, text);
    if (authRefusal) {
      callbacks.onError(authRefusal);
      return false;
    }

    if (response.status === 429) {
      const rateLimitError = rateLimitErrorFrom(parseJsonBody(text));
      if (rateLimitError) throw rateLimitError;
    }

    // The gateway refuses a turn from an account with no terms acceptance on
    // record, or one past a material revision's deadline. Re-checking the
    // account's standing sends the app to the in-app terms review.
    if (response.status === 403 && isTermsRefusal(text)) {
      const terms = useTermsAcceptanceStore.getState();
      if (terms.userId && terms.status !== 'checking') void terms.recheck(terms.userId);
      callbacks.onError(new ApiHttpError(TERMS_REVIEW_MESSAGE, 403, 'terms_acceptance_required'));
      return false;
    }

    if (response.status === 403) {
      try {
        const parsed = JSON.parse(text) as { error?: Record<string, unknown> };
        if (parsed?.error?.code === 'model_not_available') {
          throw new ApiPaywallError(
            'model_access',
            typeof parsed.error.requiredTier === 'string' ? parsed.error.requiredTier : 'pro',
            typeof parsed.error.message === 'string' ? parsed.error.message : '',
          );
        }
      } catch (jsonErr) {
        if (jsonErr instanceof ApiPaywallError) throw jsonErr;
      }
    }

    callbacks.onError(httpErrorFrom(response.status, text));
    return false;
  }

  if (response.headers) {
    const runHandle = readManagedCloudAgentRunHandle(response);
    if (runHandle) {
      callbacks.onRunReference?.({ ...runHandle, lastSequence: -1 });
    }
    const truncated = readAttachmentTruncationHeader(
      response.headers.get(ATTACHMENTS_TRUNCATED_HEADER),
    );
    if (truncated.length > 0) callbacks.onAttachmentsTruncated?.(truncated);
    const memoryCitations = readMemoryCitationsHeader(response.headers);
    if (memoryCitations) callbacks.onMemoryCitations?.(memoryCitations);
    const projectSources = readProjectFileCitationsHeader(response.headers);
    if (projectSources.length > 0) callbacks.onProjectSources?.(projectSources);
    const pastChatSources = readPastChatCitationsHeader(response.headers);
    if (pastChatSources.length > 0) callbacks.onPastChatSources?.(pastChatSources);
    const substitution = readModelSubstitution(response.headers);
    if (substitution) callbacks.onModelSubstitution?.(substitution);
    const turnNotices = readTurnNoticeHeaders(response.headers);
    if (Object.keys(turnNotices).length > 0) callbacks.onTurnNotices?.(turnNotices);
    assertCloudAccountEpochCurrent(account);
    surfaceTermsNotice(response.headers);
  }

  let outcome: SseOutcome = null;
  try {
    for await (const event of readServerSentEvents(response, {
      acceptUnterminatedFinalFrame: true,
      signal,
      onChunk: () => {
        assertCloudAccountEpochCurrent(account);
        callbacks.onActivity?.();
      },
    })) {
      assertCloudAccountEpochCurrent(account);
      outcome = processSseData(event.data, callbacks);
      if (outcome !== null) break;
    }
  } catch (error) {
    throw asBodyTransportFailure(error, signal, account);
  }
  if (outcome === 'detached') return 'detached';
  if (outcome === 'done') {
    callbacks.onDone();
    return true;
  }
  throw new Error(STREAM_ENDED_EARLY_MESSAGE);
}

class StreamTransportError extends Error {
  constructor(cause: Error) {
    super(cause.message);
    this.name = 'StreamTransportError';
  }
}

// The streaming fetch reports a dropped connection while reading the body as a
// plain Error carrying the platform's sentence, so a read failure is told
// apart by where it happened rather than by its type or wording.
function asBodyTransportFailure(
  error: unknown,
  signal: AbortSignal,
  account: CloudAccountEpoch,
): unknown {
  if (
    !(error instanceof Error) ||
    signal.aborted ||
    !isCloudAccountEpochCurrent(account) ||
    error.name === 'AbortError' ||
    error instanceof ServerSentEventFrameLimitError
  ) {
    return error;
  }
  return new StreamTransportError(error);
}

export async function streamFreeQuotaChat(
  body: FreeQuotaStreamRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const account = captureCloudAccountEpoch();
  if (!account) {
    callbacks.onError(new CloudCredentialUnavailableError());
    return;
  }
  callbacks = frameStreamCallbacks(accountStreamCallbacks(callbacks, account), signal);
  try {
    assertCloudAccountEpochCurrent(account);
    if (!isFreeQuotaTurnModelId(body.model)) {
      callbacks.onError(new Error('This model is not a provider-funded Free offering.'));
      return;
    }
    assertRemoteChatAllowed(undefined, {
      cloudUnlocked: useWaitlistStore.getState().cloudUnlocked,
    });
    await ensureCloudSendConsent();
    assertCloudAccountEpochCurrent(account);
    const timeoutController = new AbortController();
    let timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
    const combinedSignal = signal
      ? combineAbortSignals([signal, timeoutController.signal])
      : timeoutController.signal;
    const timedCallbacks: StreamCallbacks = {
      ...callbacks,
      onActivity: () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAM_STALL);
        callbacks.onActivity?.();
      },
    };
    try {
      const outcome = await attemptStream(
        body,
        timedCallbacks,
        combinedSignal,
        account,
        FREE_QUOTA_COMPLETIONS_PATH,
      );
      if (outcome === 'detached') callbacks.onError(new Error(STREAM_ENDED_EARLY_MESSAGE));
    } catch (error) {
      if (signal?.aborted) return;
      callbacks.onError(
        timeoutController.signal.aborted
          ? new Error('The request timed out. Please check your connection and try again.')
          : error instanceof Error
            ? error
            : new Error(String(error)),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (!signal?.aborted)
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

function resolveProviderFromModel(modelId: string | undefined): Provider {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) {
    throw new Error(`Unsupported model: ${modelId ?? 'missing model'}`);
  }
  return metadata.provider;
}

// expo/fetch does not export the FetchError it throws when a request cannot be
// started, so its fixed message prefix is the only mark it carries.
const EXPO_FETCH_START_FAILURE_PREFIX = 'fetch failed: ';

function isNetworkError(err: unknown): boolean {
  if (err instanceof StreamTransportError) return true;
  if (err instanceof Error && err.message.startsWith(EXPO_FETCH_START_FAILURE_PREFIX)) return true;
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('load failed') ||
      msg.includes('cancelled')
    );
  }
  if (
    err instanceof AbortError ||
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError')
  ) {
    return false;
  }
  return false;
}

function withPickerSpeed(body: InitialStreamRequest): InitialStreamRequest {
  if (body.speed || body.model !== useModelStore.getState().selectedModel) return body;
  const speed = fastSpeedForModel(body.model);
  return speed ? { ...body, speed } : body;
}

function withDeviceTimeZone(body: InitialStreamRequest): InitialStreamRequest {
  if (body.client_timezone) return body;
  const clientTimeZone = getDeviceTimeZone();
  return clientTimeZone ? { ...body, client_timezone: clientTimeZone } : body;
}

function finishReasonFromStop(
  envelope: AgentEventEnvelope,
): StreamDelta['finish_reason'] | undefined {
  if (envelope.event.type !== 'stop') return undefined;
  if (envelope.event.reason === 'max-tokens') return 'length';
  if (envelope.event.reason === 'cancelled') return 'stopped';
  if (envelope.event.reason === 'error') return 'error';
  return 'stop';
}

interface FollowWindow {
  restartForFollow: () => AbortSignal;
  clear: () => void;
}

interface DurableRunFollower {
  callbacks: StreamCallbacks;
  recover: (reconnectAttempt: number | null) => Promise<boolean>;
}

// `recover` is false only when the response never named a run to follow.
function createDurableRunFollower(
  account: CloudAccountEpoch,
  callbacks: StreamCallbacks,
  signal: AbortSignal | undefined,
  rearmStallWatchdog: () => void,
  followWindow: FollowWindow,
  afterSequence = -1,
): DurableRunFollower {
  let currentRunReference: ManagedCloudAgentRunReference | undefined;
  const dedupe = createChatStreamDedupe();
  const trackedCallbacks: StreamCallbacks = {
    ...callbacks,
    onActivity: rearmStallWatchdog,
    onRunReference: (reference) => {
      currentRunReference = {
        ...reference,
        lastSequence: Math.max(reference.lastSequence, afterSequence),
      };
      callbacks.onRunReference?.({ ...currentRunReference });
    },
    onDelta: (delta) => {
      rearmStallWatchdog();
      if (delta.x_agent_event && !dedupe.admit(delta.x_agent_event)) return;
      if (delta.x_agent_event && currentRunReference) {
        currentRunReference = {
          ...currentRunReference,
          lastSequence: Math.max(currentRunReference.lastSequence, delta.x_agent_event.sequence),
        };
        callbacks.onRunReference?.({ ...currentRunReference });
      }
      callbacks.onDelta(delta);
    },
  };

  const publishRunReference = (patch: Partial<ManagedCloudAgentRunReference>): void => {
    if (!currentRunReference) return;
    currentRunReference = {
      ...currentRunReference,
      ...patch,
      lastSequence: Math.max(currentRunReference.lastSequence, patch.lastSequence ?? -1),
    };
    callbacks.onRunReference?.({ ...currentRunReference });
  };

  const follow = async (followSignal: AbortSignal): Promise<void> => {
    if (!currentRunReference) throw new Error('Managed Cloud run handle is unavailable');
    const client = createMobileCloudAgentRunClient(account);
    const followed = await client.followRun(currentRunReference.runId, {
      afterSequence: currentRunReference.lastSequence,
      signal: followSignal,
      onEvent: (envelope) => {
        const finishReason = finishReasonFromStop(envelope);
        trackedCallbacks.onDelta({
          x_agent_event: envelope,
          ...(messageKindForAgentEvent(envelope.event.type) === 'text' &&
          envelope.event.type === 'text-delta'
            ? { content: envelope.event.delta }
            : {}),
          ...(finishReason ? { finish_reason: finishReason } : {}),
          durableReplay: true,
        });
      },
      onSnapshot: (snapshot) => {
        rearmStallWatchdog();
        publishRunReference({
          lastSequence: snapshot.nextAfterSequence,
          state: snapshot.run.state,
          cancellationRequestedAt: snapshot.run.cancellationRequestedAt,
        });
      },
    });
    publishRunReference({
      lastSequence: followed.lastSequence,
      state: followed.run.state,
      cancellationRequestedAt: followed.run.cancellationRequestedAt,
    });
    callbacks.onDone();
  };

  const recover = async (reconnectAttempt: number | null): Promise<boolean> => {
    if (!isCloudAccountEpochCurrent(account) || signal?.aborted) return true;
    if (!currentRunReference) return false;
    if (reconnectAttempt !== null) callbacks.onReconnecting?.(reconnectAttempt);
    const followSignal = followWindow.restartForFollow();
    try {
      await follow(followSignal);
    } catch (followError) {
      if (!signal?.aborted) {
        callbacks.onError(
          followError instanceof Error ? followError : new Error(String(followError)),
        );
      }
    } finally {
      followWindow.clear();
    }
    return true;
  };

  return { callbacks: trackedCallbacks, recover };
}

export interface StreamChatOptions {
  ignorePickerSpeed?: boolean;
  /**
   * The gateway keeps its adaptive response budget off for a `continue`, so a
   * turn cut off by that budget is not cut off again at the same point.
   */
  purpose?: CompletionPurpose;
}

export async function streamChat(
  body: InitialStreamRequest | FreeQuotaStreamRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options: StreamChatOptions = {},
): Promise<void> {
  if ('assistant_message_id' in body) return streamFreeQuotaChat(body, callbacks, signal);
  const account = captureCloudAccountEpoch();
  if (!account) {
    callbacks.onError(new CloudCredentialUnavailableError());
    return;
  }
  callbacks = frameStreamCallbacks(accountStreamCallbacks(callbacks, account), signal);
  if (getProviderOffering(body.model)) {
    callbacks.onError(new Error('Provider-funded Free models require the Free chat route.'));
    return;
  }
  try {
    assertCloudAccountEpochCurrent(account);
    assertRemoteChatAllowed(undefined, {
      cloudUnlocked: useWaitlistStore.getState().cloudUnlocked,
    });
    await ensureCloudSendConsent();
    assertCloudAccountEpochCurrent(account);
    ensureLlmGateOpen(resolveProviderFromModel(body.model));
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  const request = withDeviceTimeZone(options.ignorePickerSpeed ? body : withPickerSpeed(body));
  let timeoutController = new AbortController();
  let timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
  let combinedSignal = signal
    ? combineAbortSignals([signal, timeoutController.signal])
    : timeoutController.signal;

  const rearmStallWatchdog = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAM_STALL);
  };
  const run = createDurableRunFollower(account, callbacks, signal, rearmStallWatchdog, {
    restartForFollow: () => {
      clearTimeout(timeoutId);
      timeoutController = new AbortController();
      timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAM_STALL);
      combinedSignal = signal
        ? combineAbortSignals([signal, timeoutController.signal])
        : timeoutController.signal;
      return combinedSignal;
    },
    clear: () => clearTimeout(timeoutId),
  });
  let answerStarted = false;
  const timedCallbacks: StreamCallbacks = {
    ...run.callbacks,
    onDelta: (delta) => {
      answerStarted = true;
      run.callbacks.onDelta(delta);
    },
  };
  const reconnectCallbacks: StreamCallbacks = {
    ...timedCallbacks,
    onError: (error) =>
      timedCallbacks.onError(
        isIdempotencyReplayRefusal(error) ? new StreamConnectionLostError() : error,
      ),
  };
  const recoverFromDurableRun = run.recover;

  let lastNetworkError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    if (!isCloudAccountEpochCurrent(account)) {
      clearTimeout(timeoutId);
      return;
    }
    if (combinedSignal.aborted) {
      clearTimeout(timeoutId);
      if (!signal?.aborted) {
        callbacks.onError(
          new Error('The request timed out. Please check your connection and try again.'),
        );
      }
      return;
    }

    if (attempt > 0) {
      const delay = RECONNECT_DELAYS[attempt - 1] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
      callbacks.onReconnecting?.(attempt);

      await new Promise<void>((resolve, reject) => {
        if (combinedSignal.aborted) {
          reject(new AbortError('Aborted during reconnect backoff'));
          return;
        }
        const tid = setTimeout(resolve, delay);
        combinedSignal.addEventListener(
          'abort',
          () => {
            clearTimeout(tid);
            reject(new AbortError('Aborted during reconnect backoff'));
          },
          { once: true },
        );
      }).catch(() => {
        clearTimeout(timeoutId);
      });

      if (!isCloudAccountEpochCurrent(account) || combinedSignal.aborted) {
        clearTimeout(timeoutId);
        if (!signal?.aborted) {
          callbacks.onError(
            new Error('The request timed out. Please check your connection and try again.'),
          );
        }
        return;
      }

      clearTimeout(timeoutId);
      timeoutController = new AbortController();
      timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
      combinedSignal = signal
        ? combineAbortSignals([signal, timeoutController.signal])
        : timeoutController.signal;
    }

    try {
      const completed = await attemptStream(
        request,
        attempt === 0 ? timedCallbacks : reconnectCallbacks,
        combinedSignal,
        account,
        COMPLETIONS_PATH,
        false,
        options.purpose,
      );
      if (completed === 'detached') {
        if (await recoverFromDurableRun(null)) return;
        clearTimeout(timeoutId);
        callbacks.onError(new Error(STREAM_ENDED_EARLY_MESSAGE));
        return;
      }
      clearTimeout(timeoutId);
      return;
    } catch (err) {
      if (!isCloudAccountEpochCurrent(account) || signal?.aborted) {
        clearTimeout(timeoutId);
        return;
      }
      if (timeoutController.signal.aborted) {
        if (await recoverFromDurableRun(attempt + 1)) return;
        clearTimeout(timeoutId);
        callbacks.onError(
          new Error('The request timed out. Please check your connection and try again.'),
        );
        return;
      }

      if (isNetworkError(err)) {
        lastNetworkError = err instanceof Error ? err : new Error(String(err));
        if (await recoverFromDurableRun(attempt + 1)) return;
        if (answerStarted) {
          clearTimeout(timeoutId);
          callbacks.onError(new StreamConnectionLostError());
          return;
        }
        continue;
      }

      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      clearTimeout(timeoutId);
      return;
    }
  }

  clearTimeout(timeoutId);
  callbacks.onError(
    lastNetworkError ?? new Error('Stream failed after maximum reconnect attempts'),
  );
}

export interface CheckpointResumeOptions {
  afterSequence?: number;
}

export function streamToolApprovalResume(
  body: ApprovalResumeRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options: CheckpointResumeOptions = {},
): Promise<void> {
  return streamCheckpointResume(body, callbacks, TOOL_APPROVAL_RESUME_PATH, signal, options);
}

export function streamToolInputResume(
  body: ToolInputResumeRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options: CheckpointResumeOptions = {},
): Promise<void> {
  return streamCheckpointResume(body, callbacks, TOOL_INPUT_RESUME_PATH, signal, options);
}

export function streamDeviceStepResume(
  body: DeviceStepResumeRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options: CheckpointResumeOptions = {},
): Promise<void> {
  return streamCheckpointResume(body, callbacks, DEVICE_STEP_RESUME_PATH, signal, options);
}

async function streamCheckpointResume(
  body: ApprovalResumeRequest | ToolInputResumeRequest | DeviceStepResumeRequest,
  callbacks: StreamCallbacks,
  path: string,
  signal: AbortSignal | undefined,
  options: CheckpointResumeOptions,
): Promise<void> {
  const account = captureCloudAccountEpoch();
  if (!account) {
    callbacks.onError(new CloudCredentialUnavailableError());
    return;
  }
  callbacks = frameStreamCallbacks(accountStreamCallbacks(callbacks, account), signal);
  try {
    assertCloudAccountEpochCurrent(account);
    assertRemoteChatAllowed(undefined, {
      cloudUnlocked: useWaitlistStore.getState().cloudUnlocked,
    });
    // Provider/model policy is revalidated against the server-owned checkpoint
    // before any tool executes. Mobile deliberately cannot supply or override
    // that model on an approval resume.
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  let timeoutController = new AbortController();
  let timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
  let combinedSignal = signal
    ? combineAbortSignals([signal, timeoutController.signal])
    : timeoutController.signal;

  const rearmStallWatchdog = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAM_STALL);
  };
  const run = createDurableRunFollower(
    account,
    callbacks,
    signal,
    rearmStallWatchdog,
    {
      restartForFollow: () => {
        clearTimeout(timeoutId);
        timeoutController = new AbortController();
        timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAM_STALL);
        combinedSignal = signal
          ? combineAbortSignals([signal, timeoutController.signal])
          : timeoutController.signal;
        return combinedSignal;
      },
      clear: () => clearTimeout(timeoutId),
    },
    options.afterSequence,
  );

  try {
    const outcome = await attemptStream(body, run.callbacks, combinedSignal, account, path);
    clearTimeout(timeoutId);
    if (outcome === 'detached' && !(await run.recover(null))) {
      callbacks.onError(new Error(STREAM_ENDED_EARLY_MESSAGE));
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (signal?.aborted) {
      return;
    }
    if (timeoutController.signal.aborted) {
      if (await run.recover(1)) return;
      callbacks.onError(
        new Error('The request timed out. Please check your connection and try again.'),
      );
      return;
    }
    if (isNetworkError(err) && (await run.recover(1))) return;
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
