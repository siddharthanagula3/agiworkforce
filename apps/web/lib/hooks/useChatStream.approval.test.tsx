import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { useChatStream, __resetPendingTurnsForTests, isApprovalTurnLive } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: authMocks.getToken }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const TEMP_CONVERSATION = {
  id: 'conv-temp',
  title: 'Temporary chat',
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
  isTemporary: true,
};

const TOOL = 'mcp__github__get_pull_request_diff';
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const RUN_PATH = `/api/llm/v1/chat/completions/runs/${RUN_ID}`;
const PERSISTED_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const PERSISTED_ASSISTANT_ID = '33333333-3333-4333-8333-333333333333';

function mockSseStream(events: unknown[]) {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const body = lines + 'data: [DONE]\n\n';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(stream, {
      status: 200,
      headers: new Headers({
        'X-AGI-Agent-Run-Id': RUN_ID,
        'X-AGI-Agent-Run-URL': RUN_PATH,
      }),
    }),
  );
}

const approvalEvent = {
  choices: [
    {
      delta: {
        x_tool_approval_request: {
          tool_call_id: 'call_1',
          name: TOOL,
          args: { owner: 'acme', repo: 'app', pull_number: 7 },
        },
      },
    },
  ],
};

function assistantMessage() {
  return useChatStore.getState().messages.find((m) => m.role === 'assistant');
}

describe('useChatStream, tool approval → resume', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useFreeTrialStore.getState().clearLimitReached();
    __resetPendingTurnsForTests();
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('surfaces an awaiting_approval card when the turn suspends on a tool', async () => {
    mockSseStream([approvalEvent]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });

    const tools = assistantMessage()?.metadata?.tools ?? [];
    const awaiting = tools.find((t) => t.status === 'awaiting_approval');
    expect(awaiting, 'awaiting_approval card should exist').toBeDefined();
    expect(awaiting?.toolCallId).toBe('call_1');
    expect(awaiting?.requiresApproval).toBe(true);
    expect(awaiting?.name).toBe(TOOL);
  });

  it('dispatches the resume request on approve and streams the continuation', async () => {
    mockSseStream([approvalEvent]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });

    const assistantId = assistantMessage()!.id;

    mockSseStream([{ choices: [{ delta: { content: 'The PR renames a function.' } }] }]);

    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_1', 'approved');
    });

    const approveCall = vi
      .mocked(fetch)
      .mock.calls.find((c) => String(c[0]).includes('/api/llm/v1/chat/completions/approve'));
    expect(approveCall, 'resume request should target the approve endpoint').toBeDefined();
    const body = JSON.parse((approveCall![1] as RequestInit).body as string);
    expect(body.run_id).toBe(RUN_ID);
    expect(body.tool_approvals).toEqual([{ tool_call_id: 'call_1', decision: 'approved' }]);
    expect(body).not.toHaveProperty('messages');
    expect(body).not.toHaveProperty('model');

    expect(assistantMessage()?.content).toContain('The PR renames a function.');
  });

  it('sends typed guidance with the resume so the run can be redirected instead of stopped', async () => {
    mockSseStream([approvalEvent]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });

    const assistantId = assistantMessage()!.id;
    mockSseStream([{ choices: [{ delta: { content: 'ok' } }] }]);

    await act(async () => {
      await result.current.resolveToolApproval(
        assistantId,
        'call_1',
        'approved',
        '  Only touch the docs directory.  ',
      );
    });

    const approveCall = vi
      .mocked(fetch)
      .mock.calls.find((c) => String(c[0]).includes('/api/llm/v1/chat/completions/approve'));
    const body = JSON.parse((approveCall![1] as RequestInit).body as string);
    expect(body.guidance).toBe('Only touch the docs directory.');
  });

  it('keeps the same server-owned run across consecutive approval boundaries', async () => {
    mockSseStream([approvalEvent]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    const assistantId = assistantMessage()!.id;

    const REAL_RESULT = '# My Project\n\nThis project does X, Y, and Z.';

    mockSseStream([
      {
        choices: [
          {
            delta: {
              x_tool_result: {
                tool_call_id: 'call_1',
                name: TOOL,
                content: REAL_RESULT,
                is_error: false,
              },
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              x_tool_approval_request: { tool_call_id: 'call_2', name: TOOL, args: {} },
            },
          },
        ],
      },
    ]);
    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_1', 'approved');
    });

    mockSseStream([{ choices: [{ delta: { content: 'done' } }] }]);
    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_2', 'approved');
    });

    const approveCalls = vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]).includes('/approve'));
    expect(approveCalls).toHaveLength(2);
    const firstBody = JSON.parse((approveCalls[0]![1] as RequestInit).body as string);
    const secondBody = JSON.parse((approveCalls[1]![1] as RequestInit).body as string);
    expect(firstBody.run_id).toBe(RUN_ID);
    expect(secondBody.run_id).toBe(RUN_ID);
    expect(secondBody.tool_approvals).toEqual([{ tool_call_id: 'call_2', decision: 'approved' }]);
    expect(secondBody).not.toHaveProperty('messages');
  });

  it('sends decision "rejected" and marks the card failed without executing', async () => {
    mockSseStream([approvalEvent]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    const assistantId = assistantMessage()!.id;

    mockSseStream([{ choices: [{ delta: { content: 'Understood, skipping.' } }] }]);
    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_1', 'rejected');
    });

    const approveCall = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes('/approve'));
    const body = JSON.parse((approveCall![1] as RequestInit).body as string);
    expect(body.run_id).toBe(RUN_ID);
    expect(body.tool_approvals).toEqual([{ tool_call_id: 'call_1', decision: 'rejected' }]);

    const card = assistantMessage()?.metadata?.tools?.find((t) => t.toolCallId === 'call_1');
    expect(['failed', 'completed']).toContain(card?.status);
    expect(assistantMessage()?.content).toContain('Understood, skipping.');
  });

  it('stopGeneration aborts an in-flight tool-approval resume (Finding 4: resolveToolApproval used to keep its own private AbortController that stopGeneration never touched)', async () => {
    mockSseStream([approvalEvent]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    const assistantId = assistantMessage()!.id;

    let capturedSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      capturedSignal = (init as RequestInit | undefined)?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });

    await act(async () => {
      void result.current.resolveToolApproval(assistantId, 'call_1', 'approved');
      await vi.waitFor(() => expect(capturedSignal).toBeDefined());
    });
    expect(capturedSignal!.aborted).toBe(false);

    act(() => {
      result.current.stopGeneration();
    });

    expect(capturedSignal!.aborted).toBe(true);
  });

  it('does not resume until every pending tool is decided', async () => {
    mockSseStream([
      approvalEvent,
      {
        choices: [
          {
            delta: {
              x_tool_approval_request: { tool_call_id: 'call_2', name: TOOL, args: {} },
            },
          },
        ],
      },
    ]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('two tools', { conversationId: TEMP_CONVERSATION.id });
    });
    const assistantId = assistantMessage()!.id;
    const fetchCountAfterSend = vi.mocked(fetch).mock.calls.length;

    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_1', 'approved');
    });
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCountAfterSend);

    mockSseStream([{ choices: [{ delta: { content: 'done' } }] }]);
    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_2', 'approved');
    });
    const approveCalls = vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]).includes('/approve'));
    expect(approveCalls.length).toBe(1);
    const body = JSON.parse((approveCalls[0]![1] as RequestInit).body as string);
    expect(body.run_id).toBe(RUN_ID);
    expect(body.tool_approvals).toHaveLength(2);
  });

  it('persists a partial multi-tool decision before reload', async () => {
    useChatStore.setState({
      activeConversationId: PERSISTED_CONVERSATION_ID,
      conversations: [
        {
          id: PERSISTED_CONVERSATION_ID,
          title: 'Durable approvals',
          createdAt: '2026-07-17T12:00:00.000Z',
          updatedAt: '2026-07-17T12:00:00.000Z',
          isTemporary: false,
        },
      ],
      messages: [
        {
          id: PERSISTED_ASSISTANT_ID,
          role: 'assistant',
          content: 'I need permission to continue.',
          createdAt: '2026-07-17T12:00:01.000Z',
          model: 'auto',
          metadata: {
            cloudAgentRun: {
              runId: RUN_ID,
              runPath: RUN_PATH,
              lastSequence: 9,
              state: 'awaiting_input',
            },
            cloudApproval: {
              schemaVersion: 1,
              runId: RUN_ID,
              calls: [
                { toolCallId: 'call_1', name: TOOL, input: '{"owner":"acme"}' },
                { toolCallId: 'call_2', name: TOOL },
              ],
            },
            tools: [
              {
                name: TOOL,
                status: 'awaiting_approval',
                requiresApproval: true,
                toolCallId: 'call_1',
              },
              {
                name: TOOL,
                status: 'awaiting_approval',
                requiresApproval: true,
                toolCallId: 'call_2',
              },
            ],
          },
        },
      ],
    });
    __resetPendingTurnsForTests();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.resolveToolApproval(PERSISTED_ASSISTANT_ID, 'call_1', 'approved');
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain(`/api/chat/conversations/${PERSISTED_CONVERSATION_ID}/messages`);
    expect(String(url)).not.toContain('/approve');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.metadata.cloudApproval).toEqual({
      schemaVersion: 1,
      runId: RUN_ID,
      calls: [
        {
          toolCallId: 'call_1',
          name: TOOL,
          input: '{"owner":"acme"}',
          approvalDecision: 'approved',
        },
        { toolCallId: 'call_2', name: TOOL },
      ],
    });
  });

  it('fires exactly one resume when two decisions complete the batch concurrently', async () => {
    useChatStore.setState({
      activeConversationId: PERSISTED_CONVERSATION_ID,
      conversations: [
        {
          id: PERSISTED_CONVERSATION_ID,
          title: 'Durable approvals',
          createdAt: '2026-07-17T12:00:00.000Z',
          updatedAt: '2026-07-17T12:00:00.000Z',
          isTemporary: false,
        },
      ],
      messages: [
        {
          id: PERSISTED_ASSISTANT_ID,
          role: 'assistant',
          content: 'I need permission to continue.',
          createdAt: '2026-07-17T12:00:01.000Z',
          model: 'auto',
          metadata: {
            cloudAgentRun: {
              runId: RUN_ID,
              runPath: RUN_PATH,
              lastSequence: 9,
              state: 'awaiting_input',
            },
            cloudApproval: {
              schemaVersion: 1,
              runId: RUN_ID,
              calls: [
                { toolCallId: 'call_1', name: TOOL, input: '{"owner":"acme"}' },
                { toolCallId: 'call_2', name: TOOL },
              ],
            },
            tools: [
              {
                name: TOOL,
                status: 'awaiting_approval',
                requiresApproval: true,
                toolCallId: 'call_1',
              },
              {
                name: TOOL,
                status: 'awaiting_approval',
                requiresApproval: true,
                toolCallId: 'call_2',
              },
            ],
          },
        },
      ],
    });
    __resetPendingTurnsForTests();

    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes('/approve')) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: new Headers({ 'X-AGI-Agent-Run-Id': RUN_ID, 'X-AGI-Agent-Run-URL': RUN_PATH }),
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      const p1 = result.current.resolveToolApproval(PERSISTED_ASSISTANT_ID, 'call_1', 'approved');
      const p2 = result.current.resolveToolApproval(PERSISTED_ASSISTANT_ID, 'call_2', 'approved');
      await Promise.all([p1, p2]);
    });

    const approveCalls = vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]).includes('/approve'));
    expect(approveCalls.length, 'exactly one resume POST despite two concurrent decisions').toBe(1);
  });

  it('restores partial multi-tool decisions after reload and resumes once complete', async () => {
    mockSseStream([
      approvalEvent,
      {
        choices: [
          {
            delta: {
              x_tool_approval_request: { tool_call_id: 'call_2', name: TOOL, args: {} },
            },
          },
        ],
      },
    ]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('two tools', { conversationId: TEMP_CONVERSATION.id });
    });
    const assistantId = assistantMessage()!.id;

    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_1', 'approved');
    });
    __resetPendingTurnsForTests();
    expect(isApprovalTurnLive(assistantId)).toBe(true);

    mockSseStream([{ choices: [{ delta: { content: 'done' } }] }]);
    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_2', 'rejected');
    });

    const approveCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => String(call[0]).includes('/approve'));
    const body = JSON.parse((approveCall![1] as RequestInit).body as string);
    expect(body).toEqual({
      run_id: RUN_ID,
      tool_approvals: [
        { tool_call_id: 'call_1', decision: 'approved' },
        { tool_call_id: 'call_2', decision: 'rejected' },
      ],
    });
  });
});

describe('isApprovalTurnLive', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useFreeTrialStore.getState().clearLimitReached();
    __resetPendingTurnsForTests();
    useChatStore.setState({
      activeConversationId: TEMP_CONVERSATION.id,
      conversations: [TEMP_CONVERSATION],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is false for a message id that never suspended', () => {
    expect(isApprovalTurnLive('some-random-id')).toBe(false);
  });

  it('is true right after a turn suspends on an approval request', async () => {
    mockSseStream([approvalEvent]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    const assistantId = assistantMessage()!.id;
    expect(isApprovalTurnLive(assistantId)).toBe(true);
  });

  it('is false again once the turn resolves (no longer pending)', async () => {
    mockSseStream([approvalEvent]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    const assistantId = assistantMessage()!.id;

    mockSseStream([{ choices: [{ delta: { content: 'Done.' } }] }]);
    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_1', 'approved');
    });

    expect(assistantMessage()?.metadata?.cloudApproval).toBeNull();
    expect(assistantMessage()?.metadata?.tools?.[0]?.requiresApproval).toBe(false);
    expect(isApprovalTurnLive(assistantId)).toBe(false);
  });

  it('remains live after reload when the persisted card has a durable run handle', async () => {
    mockSseStream([approvalEvent]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('summarize PR 7', {
        conversationId: TEMP_CONVERSATION.id,
      });
    });
    const assistantId = assistantMessage()!.id;
    expect(isApprovalTurnLive(assistantId)).toBe(true);

    __resetPendingTurnsForTests();

    const stillAwaiting = assistantMessage()?.metadata?.tools?.find(
      (t) => t.status === 'awaiting_approval',
    );
    expect(stillAwaiting, 'persisted card still shows awaiting_approval').toBeDefined();
    expect(assistantMessage()?.metadata?.cloudAgentRun?.runId).toBe(RUN_ID);
    expect(isApprovalTurnLive(assistantId)).toBe(true);
  });
});
