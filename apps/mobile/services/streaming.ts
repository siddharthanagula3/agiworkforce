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
// Zero-leak chokepoint: the SSE call below targets OUR managed cloud
// (`${API_URL}/api/llm/...`). Route it through guardedFetch so that, in Local
// mode, the request is refused BEFORE any network I/O (fail-closed). guardedFetch
// delegates to secureFetch (TLS pinning) for allowed requests, so pin coverage
// is preserved.
import { guardedFetch } from '@/lib/egressGuard';
import { ApiPaywallError } from './api';
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
  type ManagedCloudAgentRunClient,
  type ManagedCloudAgentRunReference,
} from '@agiworkforce/cloud-contracts';

/**
 * One chat-completions wire message. Normal user/assistant/system turns use
 * this shape. Durable approval resumes never accept client-replayed messages;
 * the server restores the trusted checkpoint identified by `run_id`.
 */
export interface ChatWireMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

/** OpenAI-style tool_call fragment streamed by the server-tool path (Anthropic
 *  cloud chat auto-tools: web_search, code execution). Fragments accumulate by
 *  `index`; `function.arguments` arrives in pieces and must be concatenated. */
export interface StreamToolCallFragment {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

/**
 * Tool lifecycle status event (`x_tool_status`). `type` distinguishes the
 * server-tool family ('server_tool_use') from MCP ('mcp_tool_use').
 * `processSseLine` validates the raw wire payload against the shared
 * `ToolStatusPayloadSchema` cloud contract before it reaches `onDelta`; the
 * fields stay optional here because a payload that fails validation is passed
 * through UNCHANGED (defensive fallback) rather than dropped.
 */
export interface StreamToolStatus {
  type?: string;
  name?: string;
  status?: string;
  status_phrase?: string;
  args?: unknown;
}

/** MCP tool result (`x_tool_result`) — validated the same way as {@link StreamToolStatus}. */
export interface StreamToolResult {
  tool_call_id: string;
  name?: string;
  content?: unknown;
  is_error?: boolean;
}

/**
 * MCP/connector approval request (`x_tool_approval_request`) — emitted in
 * manual mode when a tool call is suspended awaiting the user's decision.
 * Validated the same way as {@link StreamToolStatus}.
 */
export interface StreamToolApprovalRequest {
  tool_call_id: string;
  name: string;
  args?: unknown;
}

/**
 * One durable file the model generated in the E2B sandbox this turn
 * (`x_generated_files`, emitted once by the server tool loop before [DONE]).
 * `uri` is the RELATIVE authed route `/api/files/{id}` on the cloud origin —
 * consumers resolve it against API_URL and attach the Bearer token when
 * fetching. Wire shape is validated by the shared cloud contract
 * (`GeneratedFileWireSchema` in `@agiworkforce/cloud-contracts`) at the point of
 * consumption (chatExecutionStore).
 */
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
  reasoning?: string;
  role?: string;
  finish_reason?: string | null;
  // Tool-calling wire fields (server already emits these; see tool-loop.ts /
  // stream-transform.ts). The mobile store accumulates them into
  // message.toolCalls so ToolCallTimeline renders the agentic steps.
  tool_calls?: StreamToolCallFragment[];
  x_tool_status?: StreamToolStatus;
  x_tool_result?: StreamToolResult;
  x_tool_approval_request?: StreamToolApprovalRequest;
  /** Runtime-validated, durable Cloud agent activity envelope. */
  x_agent_event?: AgentEventEnvelope;
  /** Whole content_block object for a finished server code-execution tool. */
  x_code_result?: unknown;
  /** Whole content_block object for a finished server web-search tool. */
  x_search_results?: unknown;
  /** Durable descriptors for files generated in the E2B sandbox this turn. */
  x_generated_files?: { files?: StreamGeneratedFile[] };
  /**
   * Additive marker for a mid-stream provider failure (after the response
   * had already committed a 200) — the classified error payload. The
   * server still ends the stream cleanly with [DONE], so finish_reason
   * alone cannot reliably signal this (see packages/ai/provider-protocol's
   * openai-wire-compat.ts and packages/ui/unified-chat's hasStreamError doc
   * comments for why). `code`/`retryable` are present when the provider
   * adapter supplied them. Consumed by chatExecutionStore to persist
   * metadata.streamError and drive the incomplete-response notice.
   */
  x_stream_error?: { message: string; code?: string; retryable?: boolean };
  /** Internal marker: content/event came from the durable run journal. */
  durableReplay?: true;
}

export interface StreamCallbacks {
  onDelta: (delta: StreamDelta) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  /** Optional: called when a reconnect attempt is starting (attempt number, 1-based) */
  onReconnecting?: (attempt: number) => void;
  /**
   * Optional: called whenever ANY bytes arrive on the wire — including SSE
   * keepalive comments and long server-tool gaps that never produce a parsed
   * delta. Drives the stall watchdog so it only fires on true silence.
   */
  onActivity?: () => void;
  /** Stable, serializable cursor for reconnecting to the server-owned run. */
  onRunReference?: (reference: ManagedCloudAgentRunReference) => void;
}

/** Maximum number of reconnect attempts on a network interruption */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Exponential backoff delays (ms) for reconnect attempts */
const RECONNECT_DELAYS = [1_000, 2_500, 5_000];

/**
 * Attempt a single streaming fetch and consume the SSE stream.
 * Returns true when the stream ends cleanly (onDone was called),
 * or throws on network-level errors so the caller can retry.
 */
/**
 * Parse one raw SSE line (`data: {...}` / `data: [DONE]`) and fire onDelta for
 * any choice delta or finish_reason. Returns true when the line is the `[DONE]`
 * sentinel so the caller can finalize. Shared by the streaming reader and the
 * non-streaming `response.text()` fallback so both parse identically.
 */
/**
 * Validate the known tool-event fields of a raw delta against the shared
 * cloud contracts (packages/contracts/cloud-contracts/src/tool-events.ts)
 * before it reaches the accumulator. A field that fails validation is left
 * UNCHANGED (never dropped) — defensive fallback in case a future emitter
 * drifts from the contract in a way this parser doesn't yet model; today
 * every known emitter conforms (see the contract's own doc comment).
 */
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
      // Canonical activity drives durable UI state, so an invalid envelope is
      // never retained as a permissive fallback. Answer content in the same
      // delta remains intact.
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

/** Chat-completions endpoint paths this client posts to. */
const COMPLETIONS_PATH = '/api/llm/v1/chat/completions';
const TOOL_APPROVAL_RESUME_PATH = '/api/llm/v1/chat/completions/approve';

/**
 * Authenticated, trust-boundary-aware Mobile client for the durable managed
 * run journal. `guardedFetch` keeps Local mode fail-closed, while Cloud mode
 * uses the same Bearer token and surface label as the initial SSE request.
 */
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
  effort?: Effort;
  /** When true, the server injects its built-in web_search tool for this turn. */
  web_search?: boolean;
  /** When true, the server injects its built-in E2B code-execution tool for this turn. */
  code_execution?: boolean;
  /** Paid Cloud product mode; independent from approval/permission policy. */
  work_mode?: CloudWorkMode;
  /** Exact Managed Cloud catalog name. Mobile never resolves or sends the body. */
  skill_name?: string;
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

  // The completions schema expects `thinking_mode` (a boolean), NOT `thinking` —
  // `thinking` is an OBJECT { type, budget_tokens }. Sending our boolean flag as
  // `thinking` fails Zod validation with HTTP 400 ("expected object, received
  // boolean"), which is the exact bug that made EVERY cloud chat reply silently
  // fail. Remap the boolean to thinking_mode; never send a bare boolean as thinking.
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
    // Stream via expo/fetch so `response.body` is a real ReadableStream and the
    // reply renders token-by-token (RN's global fetch exposes no readable body).
    { stream: true },
  );

  if (!response.ok) {
    const text = await response.text();

    // Detect structured paywall response: HTTP 429 + { kind: 'paywall', ... }.
    // Throw ApiPaywallError so the caller can distinguish paywall from other
    // stream errors and show the PaywallBottomSheet instead of a generic toast.
    if (response.status === 429) {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed && parsed.kind === 'paywall') {
          throw new ApiPaywallError(
            typeof parsed.feature === 'string' ? parsed.feature : 'token_cap',
            typeof parsed.requiredTier === 'string' ? parsed.requiredTier : 'hobby',
            typeof parsed.reason === 'string' ? parsed.reason : '',
          );
        }
      } catch (jsonErr) {
        // If jsonErr is our ApiPaywallError, re-throw it
        if (jsonErr instanceof ApiPaywallError) throw jsonErr;
        // Otherwise fall through to generic error below
      }
    }

    // Detect a model-tier-gate rejection: HTTP 403 + { error: { code:
    // 'model_not_available', requiredTier, message } } — thrown when the
    // selected model requires a higher subscription tier than the user has
    // (e.g. an Auto-mode routing slot resolving to a Pro-only model for a Free
    // account). Without this, the rejection fell through to the generic "HTTP
    // 403: ..." Error below, which chatExecutionStore intentionally renders as
    // a blank "Something went wrong" bubble — an actionable, user-fixable
    // condition (pick another model / upgrade) with zero actionable UI.
    // Reusing ApiPaywallError gets the existing PaywallBottomSheet upgrade
    // prompt for free, consistent with every other tier-gate in the app.
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

  // The response becomes a server-owned durable run as soon as these headers
  // are available. Publish the handle before consuming the body so a socket
  // drop after any tool side effect switches to journal replay instead of
  // re-posting the completion request.
  if (response.headers) {
    const runHandle = readManagedCloudAgentRunHandle(response);
    if (runHandle) {
      callbacks.onRunReference?.({ ...runHandle, lastSequence: -1 });
    }
  }

  const reader = response.body?.getReader();

  // The streaming request is dispatched through expo/fetch (see guardedFetch
  // `{ stream: true }` above), whose `response.body` IS a real ReadableStream —
  // so `getReader()` succeeds and the reply renders token-by-token below.
  // This fallback remains as defence-in-depth: if a runtime ever returns a null
  // body (RN's global whatwg-fetch, or a mocked Response in tests), read the
  // whole SSE buffer at once via `response.text()` through the same line parser.
  // Non-incremental but correct — a working reply beats a streamed nothing.
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
      // Keep the last incomplete line in the buffer
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

/**
 * Returns true if the error looks like a transient network interruption
 * (as opposed to a deliberate abort or an application-level HTTP error).
 *
 * NOTE: mobile intentionally does NOT use `@agiworkforce/provider-runtime`'s
 * `classifyError` here. That classifier is tuned for provider-SDK error objects
 * (Anthropic/OpenAI shapes) and marks a bare RN `fetch` `TypeError` as
 * non-retryable — but on mobile a fetch `TypeError` IS the common transient
 * failure (cellular drop / NAT timeout) and must be retried. The error shapes
 * differ by surface, so this local predicate is the correct fit, not a
 * duplication to consolidate.
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    // fetch throws TypeError on network failure, but also for malformed requests.
    // Only treat network-specific messages as transient (worth retrying).
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
    // AbortError from the user or timeout controller — not a network error
    return false;
  }
  return false;
}

/**
 * SSE streaming consumer for `/api/llm/v1/chat/completions`.
 * Uses fetch + ReadableStream (RN 0.76+ supports this natively).
 *
 * Network-level errors (TypeError from fetch/read) trigger automatic
 * reconnection with exponential backoff up to MAX_RECONNECT_ATTEMPTS times.
 * The caller can track reconnect attempts via the optional onReconnecting callback.
 */
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
    // Deliver fatal pre-flight errors through the callbacks contract (like every
    // other terminal failure in this function) rather than rejecting the promise —
    // callers such as the Compare screen only listen via onError and would
    // otherwise hang forever waiting for a result.
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  // Per-attempt timeout — each stream attempt gets a fresh timeout so backoff
  // waits don't eat into the next attempt's time budget.
  let timeoutController = new AbortController();
  let timeoutId = setTimeout(() => timeoutController.abort(), TIMEOUTS.STREAMING);
  let combinedSignal = signal
    ? combineAbortSignals([signal, timeoutController.signal])
    : timeoutController.signal;

  // Once the first token arrives the connection is proven alive, so the
  // per-attempt response timeout (time-to-first-token guard) is replaced by a
  // rolling stall watchdog: every delta re-arms a shorter TIMEOUTS.STREAM_STALL
  // timer on the SAME timeoutController. A healthy long generation keeps
  // re-arming it; a socket that dies silently mid-stream (iOS suspension,
  // cell handoff) stops delivering chunks, the watchdog fires, the pending
  // `reader.read()` aborts, and the turn finalizes through onError instead of
  // leaving the composer stuck in the streaming state forever.
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
    // Bail out immediately if the caller or timeout aborted. A timeout abort
    // must surface via onError so the store resets; only a user cancel is silent.
    if (combinedSignal.aborted) {
      clearTimeout(timeoutId);
      if (!signal?.aborted) {
        callbacks.onError(
          new Error('The request timed out. Please check your connection and try again.'),
        );
      }
      return;
    }

    // Backoff before retry attempts (not before the first attempt)
    if (attempt > 0) {
      const delay = RECONNECT_DELAYS[attempt - 1] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
      callbacks.onReconnecting?.(attempt);

      await new Promise<void>((resolve, reject) => {
        // If already aborted, skip the wait entirely
        if (combinedSignal.aborted) {
          reject(new AbortError('Aborted during reconnect backoff'));
          return;
        }
        const tid = setTimeout(resolve, delay);
        // Cancel the wait if the signal aborts during backoff
        combinedSignal.addEventListener(
          'abort',
          () => {
            clearTimeout(tid);
            reject(new AbortError('Aborted during reconnect backoff'));
          },
          { once: true },
        );
      }).catch(() => {
        // Aborted during backoff — the combinedSignal check below decides
        // whether to surface it (timeout) or exit silently (user cancel).
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

      // Reset timeout for this new attempt so backoff waits don't eat the budget
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
      // onError was already called inside attemptStream for non-network errors
      clearTimeout(timeoutId);
      return;
    } catch (err) {
      // A user-initiated cancel is silent (no error UI). A timeout is NOT: it must
      // surface an error, or the request hangs with the assistant message stuck
      // "streaming" forever and zero feedback — the exact silent failure this path
      // used to produce. Distinguish the two by which signal actually aborted.
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
        // Continue to next attempt
        continue;
      }

      // Non-network error — surface immediately, no retry. Preserve the original
      // error instance so callers can pattern-match (e.g. ApiPaywallError → the
      // execution store renders the PaywallBottomSheet).
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      clearTimeout(timeoutId);
      return;
    }
  }

  // All reconnect attempts exhausted
  clearTimeout(timeoutId);
  callbacks.onError(
    lastNetworkError ?? new Error('Stream failed after maximum reconnect attempts'),
  );
}

/**
 * Resume a suspended tool-approval turn by stable server-owned `run_id` plus
 * the user's decisions. The trusted transcript, tool arguments, policy and
 * event cursor are restored from the durable server checkpoint.
 *
 * DELIBERATELY SINGLE-ATTEMPT — unlike `streamChat`, this does NOT retry on a
 * network drop. The `/approve` endpoint EXECUTES the approved tool calls
 * (connector writes, MCP side effects); re-POSTing the same body after a mid-
 * execution disconnect would risk double-executing an already-approved,
 * side-effecting tool call. A dropped resume surfaces as an error so the user
 * can explicitly retry (a fresh decision, not an automatic replay).
 */
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

  // Same rolling stall watchdog as streamChat: a healthy continuation keeps
  // re-arming it; a socket that dies silently mid-stream aborts the pending read.
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
      // User-initiated cancel — silent by contract.
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
