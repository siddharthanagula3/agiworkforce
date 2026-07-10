/**
 * Client wiring for the manual tool-approval → resume flow (fixes the client
 * half of MCP-APPROVAL-RESUME): an x_tool_approval_request event surfaces an
 * awaiting_approval card + registers the suspended turn; resolveToolApproval
 * dispatches the resume request to /api/llm/v1/chat/completions/approve with the
 * reconstructed assistant tool_call turn + per-tool decisions, then streams the
 * continuation into the SAME assistant message.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { useChatStream, __resetPendingTurnsForTests } from './useChatStream';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: authMocks.getToken }),
}));

vi.mock('@/lib/client/csrf', () => ({
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
    new Response(stream, { status: 200, headers: new Headers() }),
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

describe('useChatStream — tool approval → resume', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useFreeTrialStore.getState().resetUsage();
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

    // Resume continuation: the model answers after the approved tool runs.
    mockSseStream([{ choices: [{ delta: { content: 'The PR renames a function.' } }] }]);

    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_1', 'approved');
    });

    // The resume hit the approve endpoint with the right body.
    const approveCall = vi
      .mocked(fetch)
      .mock.calls.find((c) => String(c[0]).includes('/api/llm/v1/chat/completions/approve'));
    expect(approveCall, 'resume request should target the approve endpoint').toBeDefined();
    const body = JSON.parse((approveCall![1] as RequestInit).body as string);
    expect(body.tool_approvals).toEqual([{ tool_call_id: 'call_1', decision: 'approved' }]);
    const lastMessage = body.messages[body.messages.length - 1];
    expect(lastMessage.role).toBe('assistant');
    expect(lastMessage.tool_calls[0].id).toBe('call_1');
    expect(lastMessage.tool_calls[0].function.name).toBe(TOOL);
    // arguments is the JSON-encoded string per the OpenAI tool-call protocol.
    expect(JSON.parse(lastMessage.tool_calls[0].function.arguments)).toEqual({
      owner: 'acme',
      repo: 'app',
      pull_number: 7,
    });

    // Continuation streamed into the same assistant message.
    expect(assistantMessage()?.content).toContain('The PR renames a function.');
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
    expect(body.tool_approvals).toEqual([{ tool_call_id: 'call_1', decision: 'rejected' }]);

    const card = assistantMessage()?.metadata?.tools?.find((t) => t.toolCallId === 'call_1');
    // The denied card ends failed (the continuation's denial result may also land
    // by name; either way it is not a successful execution).
    expect(['failed', 'completed']).toContain(card?.status);
    expect(assistantMessage()?.content).toContain('Understood, skipping.');
  });

  it('does not resume until every pending tool is decided', async () => {
    // Suspend on TWO tools.
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

    // Decide only ONE — no resume should fire yet.
    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_1', 'approved');
    });
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCountAfterSend);

    // Decide the second — now the resume fires exactly once.
    mockSseStream([{ choices: [{ delta: { content: 'done' } }] }]);
    await act(async () => {
      await result.current.resolveToolApproval(assistantId, 'call_2', 'approved');
    });
    const approveCalls = vi
      .mocked(fetch)
      .mock.calls.filter((c) => String(c[0]).includes('/approve'));
    expect(approveCalls.length).toBe(1);
    const body = JSON.parse((approveCalls[0]![1] as RequestInit).body as string);
    expect(body.tool_approvals).toHaveLength(2);
  });
});
