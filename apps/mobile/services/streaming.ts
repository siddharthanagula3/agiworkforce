import { API_URL, TIMEOUTS } from '@/lib/constants';
import { combineAbortSignals } from '@/lib/abortSignal';
import { AbortError } from '@agiworkforce/utils/async';
import {
  getModelMetadataById,
  type CloudWorkMode,
  type Effort,
  type Provider,
} from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { getAuthToken } from './authSession';
import { guardedFetch } from '@/lib/egressGuard';
import { ApiPaywallError } from './api';
import { parseJsonBody, rateLimitErrorFrom } from './apiErrors';
import { ensureLlmGateOpen } from './llmGate';
import { assertRemoteChatAllowed } from './remoteChatGate';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import {
  createManagedCloudAgentRunClient,
  parseToolStatusDelta,
  parseToolResultDelta,
  parseToolApprovalRequestDelta,
  parseAgentEventDelta,
  readManagedCloudAgentRunHandle,
  TOOL_APPROVAL_RESUME_PATH,
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';

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
  x_agent_event?: AgentEventEnvelope;
  x_code_result?: unknown;
  x_search_results?: unknown;
  x_generated_files?: { files?: StreamGeneratedFile[] };
  x_interactive_card?: unknown;
  x_stream_error?: { message: string; code?: string; retryable?: boolean };
  durableReplay?: true;
}

export interface StreamCallbacks {
  onDelta: (delta: StreamDelta) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  onReconnecting?: (attempt: number) => void;
  onActivity?: () => void;
  onRunReference?: (reference: ManagedCloudAgentRunReference) => void;
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
  if (delta.x_agent_event !== undefined) {
    const agentEvent = parseAgentEventDelta(delta.x_agent_event);
    if (agentEvent) {
      delta.x_agent_event = agentEvent;
    } else {
      delete delta.x_agent_event;
    }
  }
}

function processSseLine(line: string, callbacks: StreamCallbacks): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data: ')) return false;

  const payload = trimmed.slice(6);
  if (payload === '[DONE]') return true;

  try {
    const parsed = JSON.parse(payload);
    const choice = parsed.choices?.[0];
    if (choice?.delta) {
      sanitizeToolEventFields(choice.delta);
      callbacks.onDelta(choice.delta);
    }
    if (choice?.finish_reason) {
      callbacks.onDelta({ finish_reason: choice.finish_reason });
    }
  } catch {
    // Skip malformed JSON lines
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
      'X-AGI-Surface': 'mobile',
    }),
    fetchImpl: (input, init) => guardedFetch(input, init),
  });
}

export async function cancelMobileCloudAgentRun(runId: string) {
  return createMobileCloudAgentRunClient().cancelRun(runId);
}

interface InitialStreamRequest {
  model: string;
  messages: ChatWireMessage[];
  stream: true;
  operationId: string;
  thinking?: boolean;
  effort?: Effort | 'none' | 'minimal';
  web_search?: boolean;
  research?: boolean;
  code_execution?: boolean;
  office_creation?: boolean;
  work_mode?: CloudWorkMode;
  skill_name?: string;
  x_interactive_cards?: { supported: string[]; canRespond: boolean };
}

interface ApprovalResumeRequest {
  run_id: string;
  operationId: string;
  tool_approvals: Array<{ tool_call_id: string; decision: 'approved' | 'rejected' }>;
}

async function attemptStream(
  body: InitialStreamRequest | ApprovalResumeRequest,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
  path: string = COMPLETIONS_PATH,
): Promise<boolean> {
  const token = await getAuthToken();

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

  const response = await guardedFetch(
    `${API_URL}${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-AGI-Surface': 'mobile',
        'Idempotency-Key': createManagedChatIdempotencyKey({
          surface: 'mobile',
          purpose: path === TOOL_APPROVAL_RESUME_PATH ? 'tool-resume' : 'send',
          operationId,
        }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    },
    { stream: true },
  );

  if (!response.ok) {
    const text = await response.text();

    if (response.status === 429) {
      const rateLimitError = rateLimitErrorFrom(parseJsonBody(text));
      if (rateLimitError) throw rateLimitError;
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

    callbacks.onError(new Error(`HTTP ${response.status}: ${text}`));
    return false;
  }

  if (response.headers) {
    const runHandle = readManagedCloudAgentRunHandle(response);
    if (runHandle) {
      callbacks.onRunReference?.({ ...runHandle, lastSequence: -1 });
    }
  }

  const reader = response.body?.getReader();

  if (!reader) {
    const full = await response.text();
    for (const line of full.split('\n')) {
      if (processSseLine(line, callbacks)) break;
    }
    callbacks.onDone();
    return true;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let doneCalled = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      callbacks.onActivity?.();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (processSseLine(line, callbacks)) {
          if (!doneCalled) {
            doneCalled = true;
            callbacks.onDone();
          }
          return true;
        }
      }
    }

    if (!doneCalled) {
      doneCalled = true;
      callbacks.onDone();
    }
    return true;
  } finally {
    reader.releaseLock();
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
  body: InitialStreamRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
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
  let lastCanonicalEvent: { sessionId: string; turnId: string; sequence: number } | undefined;
  const timedCallbacks: StreamCallbacks = {
    ...callbacks,
    onActivity: rearmStallWatchdog,
    onRunReference: (reference) => {
      currentRunReference = { ...reference };
      callbacks.onRunReference?.({ ...currentRunReference });
    },
    onDelta: (delta) => {
      rearmStallWatchdog();
      if (
        delta.x_agent_event &&
        lastCanonicalEvent?.sessionId === delta.x_agent_event.sessionId &&
        lastCanonicalEvent.turnId === delta.x_agent_event.turnId &&
        delta.x_agent_event.sequence <= lastCanonicalEvent.sequence
      ) {
        return;
      }
      if (delta.x_agent_event) {
        lastCanonicalEvent = {
          sessionId: delta.x_agent_event.sessionId,
          turnId: delta.x_agent_event.turnId,
          sequence: delta.x_agent_event.sequence,
        };
      }
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
          ...(envelope.event.type === 'text-delta' ? { content: envelope.event.delta } : {}),
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

export async function streamToolApprovalResume(
  body: ApprovalResumeRequest,
  callbacks: StreamCallbacks,
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
    await attemptStream(body, timedCallbacks, combinedSignal, TOOL_APPROVAL_RESUME_PATH);
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
