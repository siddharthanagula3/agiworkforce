import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { AbortError } from '@agiworkforce/utils/async';
import {
  SSE_DONE_DATA,
  readServerSentEvents,
  splitJoinedServerSentEventData,
} from '@agiworkforce/client-runtime';
import {
  getModelMetadataById,
  getProviderOffering,
  messageKindForAgentEvent,
  type CloudWorkMode,
  type Effort,
  type Provider,
  type ResearchStep,
  type RoutingProfileChoice,
} from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { getAuthToken } from './authSession';
import { guardedFetch } from '@/lib/egressGuard';
import { ApiPaywallError, recoverStreamSession, streamAuthRefusal } from './api';
import { ApiHttpError, httpErrorFrom, parseJsonBody, rateLimitErrorFrom } from './apiErrors';
import { ensureLlmGateOpen } from './llmGate';
import { surfaceTermsNotice } from './termsNotice';
import { assertRemoteChatAllowed } from './remoteChatGate';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTermsAcceptanceStore } from '@/src/features/auth/store/termsAcceptanceStore';
import { createChatStreamDedupe } from '@/src/lib/chat-stream-dedupe';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import {
  createManagedCloudAgentRunClient,
  parseToolStatusDelta,
  parseToolResultDelta,
  parseToolApprovalRequestDelta,
  parseToolInputRequestDelta,
  parseAgentEventDelta,
  readManagedCloudAgentRunHandle,
  readAttachmentTruncationHeader,
  ATTACHMENTS_TRUNCATED_HEADER,
  TOOL_APPROVAL_RESUME_PATH,
  TOOL_INPUT_RESUME_PATH,
  DEVICE_STEP_RESUME_PATH,
  FREE_QUOTA_COMPLETIONS_PATH,
  type DeviceStepResultWire,
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunReference,
  type FreeQuotaMessageContent,
} from '@agiworkforce/cloud-contracts';
import { platformRequestHeaders } from '../lib/platformHeaders';
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
export interface StreamToolApprovalRequest {
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
    delta.x_tool_approval_request =
      parseToolApprovalRequestDelta(delta.x_tool_approval_request) ?? delta.x_tool_approval_request;
  }
  if (delta.x_tool_input_request !== undefined) {
    const inputRequest = parseToolInputRequestDelta(delta.x_tool_input_request);
    if (inputRequest) {
      delta.x_tool_input_request = inputRequest;
    } else {
      delete delta.x_tool_input_request;
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

function processSseData(data: string, callbacks: StreamCallbacks): boolean {
  for (const payload of splitJoinedServerSentEventData(data)) {
    const trimmed = payload.trim();
    if (!trimmed) continue;
    if (trimmed === SSE_DONE_DATA) return true;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const choice = parsed?.choices?.[0];
    if (choice?.delta) {
      sanitizeToolEventFields(choice.delta);
      callbacks.onDelta(choice.delta);
    }
    if (choice?.finish_reason) {
      callbacks.onDelta({ finish_reason: choice.finish_reason });
    }
  }
  return false;
}

const COMPLETIONS_PATH = '/api/llm/v1/chat/completions';

export function createMobileCloudAgentRunClient(): ManagedCloudAgentRunClient {
  return createManagedCloudAgentRunClient({
    baseUrl: API_URL,
    getAuthToken,
    decorateMutationHeaders: (headers) => ({
      ...headers,
      'Content-Type': 'application/json',
      ...platformRequestHeaders(),
    }),
    fetchImpl: async (input, init) => {
      const response = isDetachedResume(input)
        ? await guardedFetch(input, init, { stream: true })
        : await guardedFetch(input, init);
      if (response.status === 403) await noticeRunRefusal(response);
      return response;
    },
  });
}

/**
 * A run's approve, resume, follow and cancel calls pass the same gate as a chat
 * turn, so a passkey step-up, an unavailable account or new terms can refuse
 * them too. The caller still sees the refusal; this makes the app act on it as
 * it does for a turn, instead of showing a bare 403.
 */
async function noticeRunRefusal(response: Response): Promise<void> {
  const text = await response
    .clone()
    .text()
    .catch(() => '');
  streamAuthRefusal(403, text);
  if (isTermsRefusal(text)) {
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
    sources?: Array<{ url: string; title?: string; snippet?: string }>;
    steps?: ResearchStep[];
    approved_steps?: ResearchStep[];
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
  tool_choice?: 'auto' | 'none' | 'required';
  memory_enabled?: boolean;
  connector_tools_enabled?: boolean;
  x_interactive_cards?: { supported: string[]; canRespond: boolean };
}

interface ApprovalResumeRequest {
  run_id: string;
  operationId: string;
  tool_approvals: Array<{ tool_call_id: string; decision: 'approved' | 'rejected' }>;
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

async function attemptStream(
  body:
    | InitialStreamRequest
    | ApprovalResumeRequest
    | ToolInputResumeRequest
    | DeviceStepResumeRequest
    | FreeQuotaStreamRequest,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
  path: string = COMPLETIONS_PATH,
  sessionRecovered = false,
): Promise<boolean> {
  const token = await getAuthToken();
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
            path === TOOL_APPROVAL_RESUME_PATH || path === DEVICE_STEP_RESUME_PATH
              ? 'tool-resume'
              : 'send',
          operationId,
        }),
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal,
    },
    { stream: true },
  );

  if (!response.ok) {
    const text = await response.text();

    if (response.status === 401 && !sessionRecovered && !signal.aborted) {
      if (await recoverStreamSession()) {
        return attemptStream(body, callbacks, signal, path, true);
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
    surfaceTermsNotice(response.headers);
  }

  for await (const event of readServerSentEvents(response, {
    acceptUnterminatedFinalFrame: true,
    onChunk: () => callbacks.onActivity?.(),
  })) {
    if (processSseData(event.data, callbacks)) {
      callbacks.onDone();
      return true;
    }
  }
  throw new Error('The response ended before completion. Please retry.');
}

export async function streamFreeQuotaChat(
  body: FreeQuotaStreamRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const offering = getProviderOffering(body.model);
    if (offering?.category !== 'chat' || offering.quotaProbeProtocol !== 'chat') {
      callbacks.onError(new Error('This model is not a provider-funded Free chat offering.'));
      return;
    }
    assertRemoteChatAllowed(undefined, {
      cloudUnlocked: useWaitlistStore.getState().cloudUnlocked,
    });
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
      await attemptStream(body, timedCallbacks, combinedSignal, FREE_QUOTA_COMPLETIONS_PATH);
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

function isNetworkError(err: unknown): boolean {
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

export async function streamChat(
  body: InitialStreamRequest | FreeQuotaStreamRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  if ('assistant_message_id' in body) return streamFreeQuotaChat(body, callbacks, signal);
  if (getProviderOffering(body.model)) {
    callbacks.onError(new Error('Provider-funded Free models require the Free chat route.'));
    return;
  }
  try {
    assertRemoteChatAllowed(undefined, {
      cloudUnlocked: useWaitlistStore.getState().cloudUnlocked,
    });
    ensureLlmGateOpen(resolveProviderFromModel(body.model));
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
  let currentRunReference: ManagedCloudAgentRunReference | undefined;
  const dedupe = createChatStreamDedupe();
  const timedCallbacks: StreamCallbacks = {
    ...callbacks,
    onActivity: rearmStallWatchdog,
    onRunReference: (reference) => {
      currentRunReference = { ...reference };
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

  let lastNetworkError: Error | null = null;

  const publishRunReference = (patch: Partial<ManagedCloudAgentRunReference>): void => {
    if (!currentRunReference) return;
    currentRunReference = {
      ...currentRunReference,
      ...patch,
      lastSequence: Math.max(currentRunReference.lastSequence, patch.lastSequence ?? -1),
    };
    callbacks.onRunReference?.({ ...currentRunReference });
  };

  const finishReasonFromStop = (
    envelope: AgentEventEnvelope,
  ): StreamDelta['finish_reason'] | undefined => {
    if (envelope.event.type !== 'stop') return undefined;
    if (envelope.event.reason === 'max-tokens') return 'length';
    if (envelope.event.reason === 'cancelled') return 'stopped';
    if (envelope.event.reason === 'error') return 'error';
    return 'stop';
  };

  const followDurableRun = async (): Promise<void> => {
    if (!currentRunReference) throw new Error('Managed Cloud run handle is unavailable');
    const client = createMobileCloudAgentRunClient();
    const followed = await client.followRun(currentRunReference.runId, {
      afterSequence: currentRunReference.lastSequence,
      signal: combinedSignal,
      onEvent: (envelope) => {
        rearmStallWatchdog();
        const finishReason = finishReasonFromStop(envelope);
        timedCallbacks.onDelta({
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

  const resetTimeoutForDurableFollow = (): void => {
    clearTimeout(timeoutId);
    timeoutController = new AbortController();
    timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAM_STALL);
    combinedSignal = signal
      ? combineAbortSignals([signal, timeoutController.signal])
      : timeoutController.signal;
  };

  const recoverFromDurableRun = async (reconnectAttempt: number): Promise<boolean> => {
    if (!currentRunReference) return false;
    callbacks.onReconnecting?.(reconnectAttempt);
    resetTimeoutForDurableFollow();
    try {
      await followDurableRun();
      clearTimeout(timeoutId);
      return true;
    } catch (followError) {
      clearTimeout(timeoutId);
      if (signal?.aborted) return true;
      callbacks.onError(
        followError instanceof Error ? followError : new Error(String(followError)),
      );
      return true;
    }
  };

  for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
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

      if (combinedSignal.aborted) {
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
      const completed = await attemptStream(body, timedCallbacks, combinedSignal);
      if (completed) {
        clearTimeout(timeoutId);
        return;
      }
      clearTimeout(timeoutId);
      return;
    } catch (err) {
      if (signal?.aborted) {
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

export function streamToolApprovalResume(
  body: ApprovalResumeRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return streamCheckpointResume(body, callbacks, TOOL_APPROVAL_RESUME_PATH, signal);
}

export function streamToolInputResume(
  body: ToolInputResumeRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return streamCheckpointResume(body, callbacks, TOOL_INPUT_RESUME_PATH, signal);
}

export function streamDeviceStepResume(
  body: DeviceStepResumeRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  return streamCheckpointResume(body, callbacks, DEVICE_STEP_RESUME_PATH, signal);
}

async function streamCheckpointResume(
  body: ApprovalResumeRequest | ToolInputResumeRequest | DeviceStepResumeRequest,
  callbacks: StreamCallbacks,
  path: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
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

  const timeoutController = new AbortController();
  let timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
  const combinedSignal = signal
    ? combineAbortSignals([signal, timeoutController.signal])
    : timeoutController.signal;

  const rearmStallWatchdog = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAM_STALL);
  };
  const timedCallbacks: StreamCallbacks = {
    ...callbacks,
    onActivity: rearmStallWatchdog,
    onDelta: (delta) => {
      rearmStallWatchdog();
      callbacks.onDelta(delta);
    },
  };

  try {
    await attemptStream(body, timedCallbacks, combinedSignal, path);
    clearTimeout(timeoutId);
  } catch (err) {
    clearTimeout(timeoutId);
    if (signal?.aborted) {
      return;
    }
    if (timeoutController.signal.aborted) {
      callbacks.onError(
        new Error('The request timed out. Please check your connection and try again.'),
      );
      return;
    }
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
