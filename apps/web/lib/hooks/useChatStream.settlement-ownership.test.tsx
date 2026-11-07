import { useRef } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultModelFor } from '@agiworkforce/types';
import { selectIsConversationStreaming, useChatStore } from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { ASSISTANT_CONTENT_CHANGED_REASON } from '@/features/chat/lib/assistant-content-edit-contract';
import { isMessageContinuable } from '@/features/chat/lib/continue-generation';
import { isStoppedTurn } from '@/features/chat/lib/turn-error-notice';
import { __resetPendingTurnsForTests, useChatStream, useResolveToolApproval } from './useChatStream';

const auth = vi.hoisted(() => ({
  getToken: vi.fn(),
  userId: 'settlement-user',
  sessionId: 'settlement-session',
  isSignedIn: true,
}));

vi.mock('@clerk/nextjs', async () => {
  const { createClerkSessionFixture } = await import('../identity/__tests__/clerk-session-fixture');
  return createClerkSessionFixture(() => ({
    getToken: auth.getToken,
    userId: auth.userId,
    sessionId: auth.sessionId,
    isSignedIn: auth.isSignedIn,
    isLoaded: true,
  }));
});

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'fixture-csrf',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'fixture-csrf',
  }),
}));

const MODEL = getDefaultModelFor('free', 'chat');
const CONVERSATION = {
  id: 'a1111111-1111-4111-8111-111111111111',
  title: 'Settlement ownership',
  createdAt: '2026-11-04T00:00:00.000Z',
  updatedAt: '2026-11-04T00:00:00.000Z',
  isTemporary: false,
};
const USER_ID = 'a2222222-2222-4222-8222-222222222222';
const ASSISTANT_ID = 'a3333333-3333-4333-8333-333333333333';
const OLD_RUN_ID = 'a4444444-4444-4444-8444-444444444444';
const NEXT_RUN_ID = 'a5555555-5555-4555-8555-555555555555';
const RENAMED_ID = 'a6666666-6666-4666-8666-666666666666';
const STEER_ID = 'a7777777-7777-4777-8777-777777777777';
const COMPLETIONS_PATH = '/api/llm/v1/chat/completions';
const PARTIAL = 'The answer begins';
const CONTINUATION = ' and continues with the remaining detail.';

const pendingOperations: Promise<unknown>[] = [];
const releaseGates = new Set<() => void>();
const streams: Array<{ close: () => void }> = [];

function deferred<T>(fallback: T) {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  const release = () => resolve(fallback);
  const resolve = (value: T) => {
    releaseGates.delete(release);
    resolvePromise(value);
  };
  releaseGates.add(release);
  return { promise, resolve };
}

function track<T>(promise: Promise<T>): Promise<T> {
  pendingOperations.push(promise);
  return promise;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function frame(delta: Record<string, unknown>, finishReason?: string): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, ...(finishReason ? { finish_reason: finishReason } : {}) }],
  })}\n\n`;
}

function controlledStream(options: { runId?: string; cancelGate?: Promise<void> } = {}) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let cancelStarted = false;
  const body = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
    },
    cancel() {
      closed = true;
      cancelStarted = true;
      return options.cancelGate;
    },
  });
  const close = () => {
    if (closed) return;
    closed = true;
    controller.close();
  };
  streams.push({ close });
  return {
    response: new Response(body, {
      status: 200,
      headers: options.runId
        ? {
            'X-AGI-Agent-Run-Id': options.runId,
            'X-AGI-Agent-Run-URL': `${COMPLETIONS_PATH}/runs/${options.runId}`,
          }
        : {},
    }),
    bindSignal(signal: AbortSignal | null | undefined) {
      const abort = () => {
        if (closed) return;
        closed = true;
        controller.error(new DOMException('Fixture request aborted', 'AbortError'));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    },
    push(text: string) {
      controller.enqueue(encoder.encode(text));
    },
    finish(content = '', finishReason = 'stop') {
      controller.enqueue(encoder.encode(frame({ content }, finishReason) + 'data: [DONE]\n\n'));
    },
    cancelStarted: () => cancelStarted,
  };
}

interface RequestRecord {
  path: string;
  body: Record<string, unknown>;
  init: RequestInit | undefined;
}

function run(runId: string, state: 'running' | 'cancelled' = 'running') {
  return {
    id: runId,
    userId: auth.userId,
    requestId: 'settlement-request',
    conversationId: CONVERSATION.id,
    originSurface: 'web',
    workMode: 'chat',
    state,
    provider: 'fixture-provider',
    model: MODEL,
    lastEventSequence: -1,
    cancellationRequestedAt: state === 'cancelled' ? CONVERSATION.updatedAt : null,
    completedAt: state === 'cancelled' ? CONVERSATION.updatedAt : null,
    createdAt: CONVERSATION.createdAt,
    updatedAt: CONVERSATION.updatedAt,
  };
}

function routeRequests(options: {
  completions: ReturnType<typeof controlledStream>[];
  save?: (request: RequestRecord) => Response | Promise<Response>;
  resume?: (request: RequestRecord) => ReturnType<typeof controlledStream>;
}) {
  const requests: RequestRecord[] = [];
  let completionIndex = 0;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const request = {
      path,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      init,
    };
    requests.push(request);
    if (path === COMPLETIONS_PATH) {
      const stream = options.completions[completionIndex++];
      if (!stream) throw new Error('Unexpected completions dispatch');
      stream.bindSignal(init?.signal);
      return stream.response;
    }
    if (path.endsWith('/messages')) {
      return options.save?.(request) ?? jsonResponse({ message: { id: request.body['id'] } });
    }
    if (path === `${COMPLETIONS_PATH}/approve` || path === `${COMPLETIONS_PATH}/resume-input`) {
      const stream = options.resume?.(request);
      if (!stream) throw new Error('Unexpected pending-turn resume');
      stream.bindSignal(init?.signal);
      return stream.response;
    }
    if (path.endsWith('/steer')) {
      const runId = path.split('/').at(-2)!;
      return jsonResponse({
        run: run(runId),
        steer: { id: STEER_ID, text: request.body['message'], queuedAt: CONVERSATION.updatedAt },
      });
    }
    if (path.endsWith('/cancel')) {
      return jsonResponse({ run: run(path.split('/').at(-2)!, 'cancelled') });
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  return {
    requests,
    completions: () => requests.filter((request) => request.path === COMPLETIONS_PATH),
    saves: () => requests.filter((request) => request.path.endsWith('/messages')),
  };
}

function assistant(id?: string) {
  return useChatStore
    .getState()
    .messagesByConversation[CONVERSATION.id]?.find((message) =>
      id ? message.id === id : message.role === 'assistant',
    );
}

function stoppedReply(message: ReturnType<typeof assistant>): boolean {
  return isStoppedTurn(message ? {
    id: message.id,
    role: message.role,
    content: message.content,
    isStreaming: message.isStreaming,
    metadata: { finishReason: message.metadata?.finishReason },
  } : undefined);
}

function expectCurrentStream(id: string, content: string) {
  expect(assistant(id)).toMatchObject({ id, content, isStreaming: true });
  expect(assistant(id)?.metadata?.contentSaveConflict).toBeUndefined();
  expect(assistant(id)?.metadata?.metadataNotSaved).toBeUndefined();
  expect(assistant(id)?.error).not.toBe(true);
  expect(selectIsConversationStreaming(CONVERSATION.id)(useChatStore.getState())).toBe(true);
  expect(useChatStore.getState().isLoading).toBe(true);
  expect(useChatStore.getState().error).toBeNull();
}

function seedTruncatedReply() {
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION.id, [
    {
      id: USER_ID,
      role: 'user',
      content: 'Explain the whole answer',
      createdAt: CONVERSATION.createdAt,
    },
    {
      id: ASSISTANT_ID,
      role: 'assistant',
      content: PARTIAL,
      model: MODEL,
      createdAt: CONVERSATION.updatedAt,
      metadata: { finishReason: 'length' },
    },
  ]);
}

function renderStream() {
  return renderHook(() => useChatStream({ followActiveConversation: false }));
}

const pendingTurnCases = [
  {
    kind: 'approval',
    path: `${COMPLETIONS_PATH}/approve`,
    callId: 'approval-call',
    delta: {
      x_tool_approval_request: {
        tool_call_id: 'approval-call',
        name: 'mcp__github__get_pull_request_diff',
        args: { owner: 'fixture-owner', repo: 'fixture-repository', pull_number: 7 },
      },
    },
  },
  {
    kind: 'input',
    path: `${COMPLETIONS_PATH}/resume-input`,
    callId: 'input-call',
    delta: {
      x_tool_input_request: {
        tool_call_id: 'input-call',
        name: 'mcp__custom-fixture__create_task',
        connector_id: 'custom-fixture',
        round: 0,
        input_requests: {
          priority: {
            method: 'elicitation/create',
            params: {
              mode: 'form',
              message: 'Which priority?',
              requestedSchema: {
                type: 'object',
                properties: { priority: { type: 'string', enum: ['low', 'high'] } },
                required: ['priority'],
              },
            },
          },
        },
      },
    },
  },
];

const INPUT_ANSWERS = { priority: { action: 'accept', content: { priority: 'high' } } };

function resumePendingTurn(
  hook: ReturnType<typeof useChatStream>,
  kind: string,
  assistantId: string,
  callId: string,
): Promise<unknown> {
  return kind === 'approval'
    ? hook.resolveToolApproval(assistantId, callId, 'approved')
    : hook.resolveToolInput(assistantId, callId, INPUT_ANSWERS);
}

function seedRestoredPendingTurn(kind: 'approval' | 'input', count = 1) {
  const calls = Array.from({ length: count }, (_, index) => ({
    toolCallId: `restored-call-${index}`,
    name: 'mcp__custom-fixture__create_task',
  }));
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION.id, [{
    id: ASSISTANT_ID,
    role: 'assistant',
    content: 'Waiting for your response.',
    model: MODEL,
    createdAt: CONVERSATION.createdAt,
    metadata: {
      cloudAgentRun: {
        runId: OLD_RUN_ID,
        runPath: `${COMPLETIONS_PATH}/runs/${OLD_RUN_ID}`,
        lastSequence: 0,
        detachable: true,
        state: 'awaiting_input',
      },
      ...(kind === 'approval' ? {
        cloudApproval: { schemaVersion: 1, runId: OLD_RUN_ID, calls },
      } : {}),
      tools: calls.map((call) => kind === 'approval' ? {
        ...call,
        status: 'awaiting_approval' as const,
        requiresApproval: true,
      } : {
        ...call,
        status: 'awaiting_input' as const,
        connectorId: 'custom-fixture',
        inputRequests: { priority: { method: 'elicitation/create' } },
      }),
    },
  }]);
}

describe('useChatStream exact request settlement ownership', () => {
  beforeEach(() => {
    pendingOperations.length = 0;
    streams.length = 0;
    __resetPendingTurnsForTests();
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useFreeTrialStore.getState().clearLimitReached();
    useChatStore.setState({
      activeConversationId: CONVERSATION.id,
      conversations: [CONVERSATION],
      selectedModel: MODEL,
    });
    auth.userId = 'settlement-user';
    auth.sessionId = 'settlement-session';
    auth.isSignedIn = true;
    auth.getToken.mockReset().mockResolvedValue('fixture-account-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    cleanup();
    for (const release of [...releaseGates]) release();
    for (const stream of streams) stream.close();
    await act(async () => {
      await Promise.allSettled(pendingOperations);
    });
    __resetPendingTurnsForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps restored partial input bound to its first session across a remount', async () => {
    seedRestoredPendingTurn('input', 2);
    const resumed = controlledStream();
    resumed.finish('Resumed successfully.');
    const routed = routeRequests({ completions: [], resume: () => resumed });
    const first = renderStream();
    await act(async () => {
      expect(await first.result.current.resolveToolInput(ASSISTANT_ID, 'restored-call-0', INPUT_ANSWERS)).toBe(true);
    });
    expect(routed.requests).toHaveLength(0);
    first.unmount();
    const second = renderStream();
    await act(async () => {
      expect(await second.result.current.resolveToolInput(ASSISTANT_ID, 'restored-call-1', INPUT_ANSWERS)).toBe(true);
    });
    const request = routed.requests.find((entry) => entry.path.endsWith('/resume-input'));
    expect(request?.body).toEqual({
      run_id: OLD_RUN_ID,
      tool_inputs: [0, 1].map((index) => ({
        tool_call_id: `restored-call-${index}`,
        input_responses: INPUT_ANSWERS,
      })),
    });
    expect(new Headers(request?.init?.headers).get('Authorization')).toBe('Bearer fixture-account-token');
    expect(request?.init?.credentials).toBe('omit');
    expect(assistant(ASSISTANT_ID)?.content).toContain('Resumed successfully.');
  });

  it('rejects a second session before adding to restored partial input', async () => {
    seedRestoredPendingTurn('input', 2);
    const routed = routeRequests({ completions: [] });
    const first = renderStream();
    await act(async () => {
      expect(await first.result.current.resolveToolInput(ASSISTANT_ID, 'restored-call-0', INPUT_ANSWERS)).toBe(true);
    });
    first.unmount();
    auth.userId = 'replacement-user';
    auth.sessionId = 'replacement-session';
    const second = renderStream();
    const before = assistant(ASSISTANT_ID);
    await act(async () => {
      expect(await second.result.current.resolveToolInput(ASSISTANT_ID, 'restored-call-1', { replacement: true })).toBe(false);
    });
    expect(assistant(ASSISTANT_ID)).toBe(before);
    expect(auth.getToken).not.toHaveBeenCalled();
    expect(routed.requests).toHaveLength(0);
  });

  it.each(['approval', 'input'] as const)('leaves restored %s untouched without a canonical session', async (kind) => {
    seedRestoredPendingTurn(kind);
    auth.isSignedIn = false;
    const routed = routeRequests({ completions: [] });
    const { result } = renderStream();
    const before = assistant(ASSISTANT_ID);
    await act(async () => {
      await resumePendingTurn(result.current, kind, ASSISTANT_ID, 'restored-call-0');
    });
    expect(assistant(ASSISTANT_ID)).toBe(before);
    expect(auth.getToken).not.toHaveBeenCalled();
    expect(routed.requests).toHaveLength(0);
  });

  it.each(['approval', 'input'] as const)('fences restored %s when identity changes during token acquisition', async (kind) => {
    seedRestoredPendingTurn(kind);
    const token = deferred('fixture-account-token');
    auth.getToken.mockReturnValueOnce(token.promise);
    const routed = routeRequests({ completions: [] });
    const { result, rerender } = renderStream();
    let resuming!: Promise<unknown>;
    act(() => { resuming = track(resumePendingTurn(result.current, kind, ASSISTANT_ID, 'restored-call-0')); });
    await vi.waitFor(() => expect(auth.getToken).toHaveBeenCalledTimes(1));
    act(() => {
      auth.userId = 'replacement-user';
      auth.sessionId = 'replacement-session';
      rerender();
    });
    const before = assistant(ASSISTANT_ID);
    await act(async () => {
      token.resolve('fixture-account-token');
      await resuming;
    });
    expect(assistant(ASSISTANT_ID)).toBe(before);
    expect(routed.requests).toHaveLength(0);
  });

  it('resumes a restored approval through the standalone hook with a captured bearer', async () => {
    seedRestoredPendingTurn('approval');
    const resumed = controlledStream();
    resumed.finish('Approved continuation.');
    const routed = routeRequests({ completions: [], resume: () => resumed });
    const { result } = renderHook(() => useResolveToolApproval(useRef(new Map<string, AbortController>())));
    await act(async () => { await result.current(ASSISTANT_ID, 'restored-call-0', 'approved'); });
    const request = routed.requests.find((entry) => entry.path.endsWith('/approve'));
    expect(request?.body).toEqual({
      run_id: OLD_RUN_ID,
      tool_approvals: [{ tool_call_id: 'restored-call-0', decision: 'approved' }],
    });
    expect(new Headers(request?.init?.headers).get('Authorization')).toBe('Bearer fixture-account-token');
    expect(request?.init?.credentials).toBe('omit');
    expect(assistant(ASSISTANT_ID)?.content).toContain('Approved continuation.');
  });

  it.each(['renamed receipt', 'edit conflict', 'save failure'] as const)(
    'keeps a public length→Continue successor safe from old teardown and a stale %s',
    async (outcome) => {
      const oldCancel = deferred<void>(undefined);
      const oldSave = deferred(jsonResponse({}));
      const first = controlledStream({ runId: OLD_RUN_ID, cancelGate: oldCancel.promise });
      const next = controlledStream({ runId: NEXT_RUN_ID });
      const routed = routeRequests({
        completions: [first, next],
        save: (request) =>
          request.body['content'] === PARTIAL
            ? oldSave.promise
            : jsonResponse({ message: { id: request.body['id'] } }),
      });
      const { result } = renderStream();
      let firstSettled = false;
      let firstTurn!: Promise<boolean>;
      act(() => {
        firstTurn = track(
          result.current.sendMessage('Explain the whole answer', { conversationId: CONVERSATION.id }),
        );
        void firstTurn.then(() => { firstSettled = true; });
      });
      await vi.waitFor(() => expect(routed.completions()).toHaveLength(1));
      await act(async () => { first.finish(PARTIAL, 'length'); });
      await vi.waitFor(() => expect(first.cancelStarted()).toBe(true));
      await vi.waitFor(() => expect(routed.saves()).toHaveLength(1));
      const assistantId = assistant()!.id;
      expect(isMessageContinuable(assistant())).toBe(true);
      expect(stoppedReply(assistant())).toBe(false);
      expect(firstSettled).toBe(false);

      let continued!: Promise<void>;
      act(() => { continued = track(result.current.continueGeneration(assistantId)); });
      await vi.waitFor(() => expect(routed.completions()).toHaveLength(2));
      await act(async () => { next.push(frame({ content: CONTINUATION }, 'stop')); });
      await vi.waitFor(() => expect(assistant(assistantId)?.content).toBe(PARTIAL + CONTINUATION));
      expect(routed.completions()[1]?.body['assistant_message_id']).toBe(assistantId);
      expectCurrentStream(assistantId, PARTIAL + CONTINUATION);

      await act(async () => {
        oldCancel.resolve(undefined);
        await firstTurn;
      });
      expectCurrentStream(assistantId, PARTIAL + CONTINUATION);
      await act(async () => {
        oldSave.resolve(
          outcome === 'renamed receipt'
            ? jsonResponse({ message: { id: RENAMED_ID } })
            : outcome === 'edit conflict'
              ? jsonResponse({
                  error: {
                    message: 'Reopen the saved answer.',
                    code: 'CONFLICT',
                    details: { reason: ASSISTANT_CONTENT_CHANGED_REASON },
                  },
                }, 409)
              : jsonResponse({ error: 'Message not found' }, 404),
        );
      });
      expectCurrentStream(assistantId, PARTIAL + CONTINUATION);
      expect(assistant(RENAMED_ID)).toBeUndefined();
      expect(assistant(assistantId)?.metadata?.finishReason).toBeUndefined();

      await act(async () => {
        expect(await result.current.steerActiveTurn(CONVERSATION.id, 'Keep the remaining detail')).toBe(STEER_ID);
      });
      expect(routed.requests.filter((request) => request.path.endsWith('/steer')).map((request) => request.path))
        .toEqual([`${COMPLETIONS_PATH}/runs/${NEXT_RUN_ID}/steer`]);
      await act(async () => {
        next.finish();
        await continued;
      });
      await vi.waitFor(() => expect(routed.saves().at(-1)?.body).toMatchObject({
        id: assistantId,
        content: PARTIAL + CONTINUATION,
        metadata: { finishReason: 'stop' },
      }));
      expect(assistant(assistantId)?.isStreaming).toBe(false);
      expect(useChatStore.getState().messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
    },
  );

  it('refuses an old save retry and lets the serialized successor save keep the merged text', async () => {
    const oldCancel = deferred<void>(undefined);
    const oldSave = deferred(jsonResponse({}));
    const first = controlledStream({ cancelGate: oldCancel.promise });
    const next = controlledStream();
    const routed = routeRequests({
      completions: [first, next],
      save: (request) => request.body['content'] === PARTIAL
        ? oldSave.promise
        : jsonResponse({ message: { id: request.body['id'] } }),
    });
    const { result } = renderStream();
    let firstTurn!: Promise<boolean>;
    act(() => {
      firstTurn = track(result.current.sendMessage('Explain the whole answer', { conversationId: CONVERSATION.id }));
    });
    await vi.waitFor(() => expect(routed.completions()).toHaveLength(1));
    await act(async () => { first.finish(PARTIAL, 'length'); });
    await vi.waitFor(() => expect(routed.saves()).toHaveLength(1));
    const assistantId = assistant()!.id;
    let continued!: Promise<void>;
    act(() => { continued = track(result.current.continueGeneration(assistantId)); });
    await vi.waitFor(() => expect(routed.completions()).toHaveLength(2));
    await act(async () => {
      next.finish(CONTINUATION);
      await continued;
    });
    expect(assistant(assistantId)?.content).toBe(PARTIAL + CONTINUATION);
    expect(routed.saves()).toHaveLength(1);

    await act(async () => { oldSave.resolve(jsonResponse({ error: 'Rate limited' }, 429)); });
    await vi.waitFor(() => expect(routed.saves()).toHaveLength(2), { timeout: 3_000 });
    expect(routed.saves().map((request) => request.body['content'])).toEqual([
      PARTIAL,
      PARTIAL + CONTINUATION,
    ]);
    expect(routed.saves().map((request) => request.body['id'])).toEqual([assistantId, assistantId]);
    expect(assistant(assistantId)?.metadata?.metadataNotSaved).toBeUndefined();
    await act(async () => {
      oldCancel.resolve(undefined);
      await firstTurn;
    });
    expect(assistant(assistantId)?.metadata?.finishReason).toBe('stop');
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it('keeps a stopped partial receipt and the logical stopped state while its save settles', async () => {
    const saved = deferred(jsonResponse({}));
    const stream = controlledStream();
    let holdingFirstSave = true;
    const routed = routeRequests({
      completions: [stream],
      save: (request) => {
        if (holdingFirstSave) {
          holdingFirstSave = false;
          return saved.promise;
        }
        return jsonResponse({ message: { id: request.body['id'] } });
      },
    });
    const { result } = renderStream();
    let turn!: Promise<boolean>;
    act(() => {
      turn = track(result.current.sendMessage('Explain the whole answer', { conversationId: CONVERSATION.id }));
    });
    await vi.waitFor(() => expect(routed.completions()).toHaveLength(1));
    await act(async () => { stream.push(frame({ content: PARTIAL })); });
    await vi.waitFor(() => expect(assistant()?.content).toBe(PARTIAL));
    const assistantId = assistant()!.id;
    act(() => { result.current.stopGeneration(CONVERSATION.id); });
    await vi.waitFor(() => expect(routed.saves().length).toBeGreaterThan(0));
    expect(routed.completions()[0]?.init?.signal?.aborted).toBe(true);
    expect(routed.saves()[0]?.body).toMatchObject({
      id: assistantId,
      content: PARTIAL,
      metadata: { finishReason: 'stopped' },
    });
    expect(assistant(assistantId)).toMatchObject({ content: PARTIAL, isStreaming: false });
    expect(stoppedReply(assistant(assistantId))).toBe(true);
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().error).toBeNull();
    await act(async () => {
      saved.resolve(jsonResponse({ message: { id: assistantId } }));
      await turn;
    });
    expect(assistant(assistantId)?.metadata?.finishReason).toBe('stopped');
    expect(assistant(assistantId)?.metadata?.metadataNotSaved).toBeUndefined();
    expect(assistant(assistantId)?.error).not.toBe(true);
  });

  it('cancels Continue during its token await without dispatching or reviving loading', async () => {
    seedTruncatedReply();
    const token = deferred('fixture-account-token');
    auth.getToken.mockReturnValueOnce(token.promise);
    const routed = routeRequests({ completions: [] });
    const { result } = renderStream();
    let continued!: Promise<void>;
    act(() => { continued = track(result.current.continueGeneration(ASSISTANT_ID)); });
    await vi.waitFor(() => expect(auth.getToken).toHaveBeenCalledTimes(1));
    act(() => { result.current.stopGeneration(CONVERSATION.id); });
    await act(async () => {
      token.resolve('fixture-account-token');
      await continued;
    });
    expect(routed.completions()).toHaveLength(0);
    expect(assistant(ASSISTANT_ID)?.content).toBe(PARTIAL);
    expect(assistant(ASSISTANT_ID)?.isStreaming).not.toBe(true);
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().error).toBeNull();
  });

  it('does not let a superseded pre-auth Continue mutate the newer send', async () => {
    seedTruncatedReply();
    const token = deferred('fixture-account-token');
    auth.getToken.mockReturnValueOnce(token.promise);
    const next = controlledStream();
    const routed = routeRequests({ completions: [next] });
    const { result } = renderStream();
    let continued!: Promise<void>;
    act(() => { continued = track(result.current.continueGeneration(ASSISTANT_ID)); });
    await vi.waitFor(() => expect(auth.getToken).toHaveBeenCalledTimes(1));
    let sent!: Promise<boolean>;
    act(() => {
      sent = track(result.current.sendMessage('Answer this newer question', { conversationId: CONVERSATION.id }));
    });
    await vi.waitFor(() => expect(routed.completions()).toHaveLength(1));
    const successorId = String(routed.completions()[0]?.body['assistant_message_id']);
    await act(async () => { next.push(frame({ content: 'The newer answer is in progress.' })); });
    await vi.waitFor(() => expect(assistant(successorId)?.content).toBe('The newer answer is in progress.'));
    await act(async () => {
      token.resolve('fixture-account-token');
      await continued;
    });
    expect(routed.completions()).toHaveLength(1);
    expectCurrentStream(successorId, 'The newer answer is in progress.');
    expect(routed.completions()[0]?.init?.signal?.aborted).toBe(false);
    expect(assistant(ASSISTANT_ID)?.content).toBe(PARTIAL);
    await act(async () => {
      next.finish();
      await sent;
    });
  });

  it.each(pendingTurnCases)(
    'retains stable account authority for $kind resume after the initiating request settles',
    async ({ kind, path, callId, delta }) => {
      useChatStore.setState({ conversations: [{ ...CONVERSATION, isTemporary: true }] });
      const first = controlledStream({ runId: OLD_RUN_ID });
      const resumed = controlledStream({ runId: OLD_RUN_ID });
      const routed = routeRequests({ completions: [first], resume: () => resumed });
      const { result } = renderStream();
      let sent!: Promise<boolean>;
      act(() => {
        sent = track(result.current.sendMessage('Resolve the pending tool step', { conversationId: CONVERSATION.id }));
      });
      await vi.waitFor(() => expect(routed.completions()).toHaveLength(1));
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      await act(async () => {
        first.push(frame(delta) + 'data: [DONE]\n\n');
        await sent;
        await vi.runOnlyPendingTimersAsync();
      });
      vi.useRealTimers();
      const assistantId = assistant()!.id;
      expect(first.cancelStarted()).toBe(true);
      expect(assistant(assistantId)?.metadata?.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({ toolCallId: callId, status: kind === 'approval' ? 'awaiting_approval' : 'awaiting_input' }),
      ]));
      await act(async () => {
        resumed.finish('The resumed answer is complete.');
        await track(resumePendingTurn(result.current, kind, assistantId, callId));
      });
      const resumes = routed.requests.filter((request) => request.path === path);
      expect(resumes).toHaveLength(1);
      expect(resumes[0]?.body).toEqual(kind === 'approval'
        ? { run_id: OLD_RUN_ID, tool_approvals: [{ tool_call_id: callId, decision: 'approved' }] }
        : { run_id: OLD_RUN_ID, tool_inputs: [{ tool_call_id: callId, input_responses: INPUT_ANSWERS }] });
      expect(new Headers(resumes[0]?.init?.headers).get('Authorization')).toBe('Bearer fixture-account-token');
      expect(assistant(assistantId)?.content).toBe('The resumed answer is complete.');
      expect(assistant(assistantId)?.isStreaming).toBe(false);
      expect(useChatStore.getState().isLoading).toBe(false);
    },
  );

  it.each(pendingTurnCases)(
    'refuses a pending $kind resume after its account changes during token acquisition',
    async ({ kind, path, callId, delta }) => {
      useChatStore.setState({ conversations: [{ ...CONVERSATION, isTemporary: true }] });
      const first = controlledStream({ runId: OLD_RUN_ID });
      const routed = routeRequests({ completions: [first] });
      const { result, rerender } = renderStream();
      let sent!: Promise<boolean>;
      act(() => {
        sent = track(result.current.sendMessage('Resolve the pending tool step', { conversationId: CONVERSATION.id }));
      });
      await vi.waitFor(() => expect(routed.completions()).toHaveLength(1));
      await act(async () => {
        first.push(frame(delta) + 'data: [DONE]\n\n');
        await sent;
      });
      const assistantId = assistant()!.id;
      const token = deferred('fixture-account-token');
      auth.getToken.mockClear().mockReturnValueOnce(token.promise);
      let resuming!: Promise<unknown>;
      act(() => { resuming = track(resumePendingTurn(result.current, kind, assistantId, callId)); });
      await vi.waitFor(() => expect(auth.getToken).toHaveBeenCalledTimes(1));
      act(() => {
        auth.userId = 'replacement-user';
        auth.sessionId = 'replacement-session';
        auth.getToken.mockResolvedValue('replacement-account-token');
        rerender();
        useChatStore.getState().setActiveConversationWithMessages(CONVERSATION.id, [{
          id: assistantId,
          role: 'assistant',
          content: 'Replacement account transcript.',
          createdAt: CONVERSATION.createdAt,
          metadata: { finishReason: 'stop' },
        }]);
      });
      const replacement = assistant(assistantId);
      await act(async () => {
        token.resolve('fixture-account-token');
        await resuming;
      });
      expect(routed.requests.filter((request) => request.path === path)).toHaveLength(0);
      expect(routed.saves()).toHaveLength(0);
      expect(assistant(assistantId)).toBe(replacement);
      expect(useChatStore.getState().isLoading).toBe(false);
      expect(useChatStore.getState().error).toBeNull();
    },
  );
});
