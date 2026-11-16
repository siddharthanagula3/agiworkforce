jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => {
  function MockApiPaywallError(this: { name: string; message: string }, feat: string) {
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);
  return {
    api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
  streamToolApprovalResume: jest.fn(),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => null),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...actual,
    localGenerate: jest.fn(),
    getCapabilities: jest.fn().mockResolvedValue({ tier2Available: true, tier3Available: true }),
  };
});

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { streamChat, streamToolApprovalResume, type StreamCallbacks } from '../services/streaming';
import {
  useChatExecutionStore,
  __resetPendingApprovalTurnsForTests,
  isApprovalTurnLive,
} from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { hasUndecidedApproval } from '../src/features/chat/utils/agentActivity';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockStreamResume = streamToolApprovalResume as jest.MockedFunction<
  typeof streamToolApprovalResume
>;

const CONV_ID = '0190a000-0000-7000-8000-000000000004';
const RUN_ID = '0190a000-0000-7000-8000-000000000014';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('approval-resume-test-user');
  __resetPendingApprovalTurnsForTests();
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatAppModeStore.getState().setAppMode('local');
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Cloud Chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
  });
});

function lastAssistantMessage() {
  const msgs = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
  return msgs.find((m) => m.role === 'assistant');
}

const ACTIVITY = {
  schemaVersion: AGENT_EVENT_SCHEMA_VERSION as const,
  sessionId: 'session-decline-1',
  turnId: 'turn-decline-1',
};
const CODE_ARGS = { language: 'python', code: 'print(37 * 91)' };
const DENIAL =
  'The user denied permission to run this tool. It did not run and is closed for the rest of this turn.';
const CODE_REVIEW = {
  risk_tier: 'high' as const,
  destructive: true,
  approval_scopes: ['once' as const],
};

function pausedForApproval(firstSequence: number) {
  return [
    {
      x_agent_event: {
        ...ACTIVITY,
        sequence: firstSequence,
        emittedAtMs: 1_000 + firstSequence * 50,
        event: {
          type: 'task-state-changed' as const,
          taskId: 'task-decline-1',
          state: 'awaiting_input' as const,
        },
      },
    },
    {
      x_agent_event: {
        ...ACTIVITY,
        sequence: firstSequence + 1,
        emittedAtMs: 1_000 + (firstSequence + 1) * 50,
        event: { type: 'lifecycle' as const, phase: 'paused' as const },
      },
    },
  ];
}

async function pauseOnCodeApproval(timesAsked = 1): Promise<string> {
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onRunReference?.({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      lastSequence: -1,
    });
    callbacks.onDelta({
      x_agent_event: {
        ...ACTIVITY,
        sequence: 0,
        emittedAtMs: 1_000,
        event: { type: 'lifecycle', phase: 'started' },
      },
    });
    for (let asked = 0; asked < timesAsked; asked += 1) {
      callbacks.onDelta({
        x_tool_approval_request: {
          tool_call_id: 'call_0',
          name: 'execute_code',
          args: CODE_ARGS,
          ...CODE_REVIEW,
        },
      });
    }
    callbacks.onDelta({
      x_agent_event: {
        ...ACTIVITY,
        sequence: 1,
        emittedAtMs: 1_100,
        event: {
          type: 'approval-requested',
          approvalId: 'call_0',
          toolCallId: 'call_0',
          name: 'execute_code',
          category: 'code-execution',
          summary: 'Run code',
          input: CODE_ARGS,
        },
      },
    });
    for (const delta of pausedForApproval(2)) callbacks.onDelta(delta);
    callbacks.onDone();
  });
  await useChatExecutionStore
    .getState()
    .sendMessage(CONV_ID, 'Use code to compute 37*91.', CLOUD_MODEL);
  return lastAssistantMessage()!.id;
}

function declineEvents(isError: boolean) {
  return [
    {
      x_agent_event: {
        ...ACTIVITY,
        sequence: 4,
        emittedAtMs: 1_200,
        event: { type: 'lifecycle' as const, phase: 'resumed' as const },
      },
    },
    {
      x_agent_event: {
        ...ACTIVITY,
        sequence: 5,
        emittedAtMs: 1_220,
        event: {
          type: 'approval-resolved' as const,
          approvalId: 'call_0',
          decision: 'denied' as const,
        },
      },
    },
    {
      x_tool_result: {
        tool_call_id: 'call_0',
        name: 'execute_code',
        content: DENIAL,
        is_error: isError,
      },
      x_agent_event: {
        ...ACTIVITY,
        sequence: 6,
        emittedAtMs: 1_250,
        event: {
          type: 'tool-execution-end' as const,
          toolCallId: 'call_0',
          name: 'execute_code',
          output: DENIAL,
          isError,
          elapsedMs: 0,
        },
      },
    },
  ];
}

const EMPTY_RESPONSE = {
  code: 'empty_response',
  message: 'The model finished without returning a response.',
  retryable: false,
};

function emptyResponseEnding(firstSequence: number) {
  return [
    {
      x_agent_event: {
        ...ACTIVITY,
        sequence: firstSequence,
        emittedAtMs: 1_400,
        event: { type: 'error' as const, ...EMPTY_RESPONSE },
      },
    },
    { x_stream_error: EMPTY_RESPONSE },
    {
      x_agent_event: {
        ...ACTIVITY,
        sequence: firstSequence + 1,
        emittedAtMs: 1_450,
        event: { type: 'stop' as const, reason: 'error' as const },
      },
    },
  ];
}

describe('a declined tool request whose resumed turn ends without text', () => {
  it.each([
    ['ends with nothing after the decided state', declineEvents(false)],
    [
      'ends in an empty response after the decided state',
      [...declineEvents(false), ...emptyResponseEnding(7)],
    ],
    [
      'ends in an empty response after the older error shape',
      [...declineEvents(true), ...emptyResponseEnding(7)],
    ],
  ])('%s and is stored as declined, not waiting or failed', async (_shape, deltas) => {
    const assistantId = await pauseOnCodeApproval();
    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      for (const delta of deltas) callbacks.onDelta(delta);
      callbacks.onDone();
    });

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_0', 'rejected');

    const message = lastAssistantMessage()!;
    expect(message.isStreaming).toBe(false);
    const activity = message.metadata?.agentActivity as {
      status: string;
      entries: { kind: string; status: string; approval?: { decision?: string } }[];
    };
    expect(activity.status).toBe('completed');
    expect(activity.entries.filter((entry) => entry.kind === 'error')).toEqual([]);
    expect(activity.entries.find((entry) => entry.kind === 'tool')).toMatchObject({
      status: 'failed',
      approval: { decision: 'denied' },
    });
    expect(isApprovalTurnLive(assistantId)).toBe(false);
  });
});

describe('a request the server asks again under an id already decided', () => {
  it('opens the request again with its own tool, arguments and review', async () => {
    const assistantId = await pauseOnCodeApproval();
    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      for (const delta of declineEvents(false)) callbacks.onDelta(delta);
      callbacks.onDelta({
        x_tool_approval_request: {
          tool_call_id: 'call_0',
          name: 'web_search',
          args: { query: '37 * 91' },
          risk_tier: 'low',
          destructive: false,
          approval_scopes: ['once'],
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...ACTIVITY,
          sequence: 7,
          emittedAtMs: 1_500,
          event: {
            type: 'approval-requested',
            approvalId: 'call_0',
            toolCallId: 'call_0',
            name: 'web_search',
            category: 'web-search',
            summary: 'Search the web',
            input: { query: '37 * 91' },
          },
        },
      });
      for (const delta of pausedForApproval(8)) callbacks.onDelta(delta);
      callbacks.onDone();
    });

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_0', 'rejected');

    const tool = lastAssistantMessage()!.toolCalls?.find((call) => call.toolCallId === 'call_0');
    expect(tool).toMatchObject({
      name: 'web_search',
      status: 'awaiting-approval',
      requiresApproval: true,
      approvalReview: { riskTier: 'low', destructive: false, scopes: ['once'] },
    });
    expect(tool?.approvalDecision).toBeUndefined();
    expect(tool?.output).toBeUndefined();
    expect(JSON.parse(tool?.input ?? '{}')).toEqual({ query: '37 * 91' });
    expect(isApprovalTurnLive(assistantId)).toBe(true);
    const activity = lastAssistantMessage()!.metadata?.agentActivity as AgentActivityState;
    expect(hasUndecidedApproval(activity)).toBe(true);
  });

  it('holds one pending request that can be approved and resumes the run', async () => {
    const assistantId = await pauseOnCodeApproval();
    const reask = {
      tool_call_id: 'call_0',
      name: 'web_search',
      args: { query: '37 * 91' },
      risk_tier: 'low' as const,
      destructive: false,
      approval_scopes: ['once' as const],
    };
    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      for (const delta of declineEvents(false)) callbacks.onDelta(delta);
      callbacks.onDelta({ x_tool_approval_request: reask });
      callbacks.onDelta({ x_tool_approval_request: reask });
      for (const delta of pausedForApproval(8)) callbacks.onDelta(delta);
      callbacks.onDone();
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_0', 'rejected');

    const pending = lastAssistantMessage()!.toolCalls?.filter(
      (call) => call.requiresApproval === true,
    );
    expect(pending?.map((call) => call.toolCallId)).toEqual(['call_0']);

    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_tool_result: { tool_call_id: 'call_0', name: 'web_search', content: '3367' },
      });
      callbacks.onDelta({ content: '37 times 91 is 3367.' });
      callbacks.onDone();
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_0', 'approved');

    expect(mockStreamResume).toHaveBeenCalledTimes(2);
    expect(mockStreamResume.mock.calls[1]![0]).toMatchObject({
      run_id: RUN_ID,
      tool_approvals: [{ tool_call_id: 'call_0', decision: 'approved' }],
    });
    const message = lastAssistantMessage()!;
    expect(message.content).toBe('37 times 91 is 3367.');
    expect(message.isStreaming).toBe(false);
    expect(message.toolCalls?.find((call) => call.toolCallId === 'call_0')).toMatchObject({
      name: 'web_search',
      status: 'succeeded',
      requiresApproval: false,
    });
    expect(isApprovalTurnLive(assistantId)).toBe(false);
  });
});

function searchRequest(toolCallId: string) {
  return {
    x_tool_approval_request: {
      tool_call_id: toolCallId,
      name: 'web_search',
      args: { query: toolCallId },
      risk_tier: 'low' as const,
      destructive: false,
      approval_scopes: ['once' as const],
    },
  };
}

const CODE_RESULT = {
  x_tool_result: { tool_call_id: 'call_0', name: 'execute_code', content: '3367' },
};

function storedTool(toolCallId: string) {
  return lastAssistantMessage()!.toolCalls?.find((call) => call.toolCallId === toolCallId);
}

describe('a paused turn rebuilt from the stored message', () => {
  it('waits for every request of this pause and leaves a call finished earlier alone', async () => {
    const assistantId = await pauseOnCodeApproval();
    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta(CODE_RESULT);
      callbacks.onDelta(searchRequest('call_1'));
      callbacks.onDelta(searchRequest('call_2'));
      for (const delta of pausedForApproval(8)) callbacks.onDelta(delta);
      callbacks.onDone();
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_0', 'approved');
    __resetPendingApprovalTurnsForTests();

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_1', 'approved');

    expect(mockStreamResume).toHaveBeenCalledTimes(1);
    expect(storedTool('call_0')).toMatchObject({ status: 'succeeded', output: '3367' });
    expect(storedTool('call_2')).toMatchObject({
      status: 'awaiting-approval',
      requiresApproval: true,
    });

    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_2', 'rejected');

    expect(mockStreamResume).toHaveBeenCalledTimes(2);
    expect(mockStreamResume.mock.calls[1]![0].tool_approvals).toEqual([
      { tool_call_id: 'call_1', decision: 'approved' },
      { tool_call_id: 'call_2', decision: 'rejected' },
    ]);
    expect(storedTool('call_0')).toMatchObject({ status: 'succeeded', output: '3367' });
  });
});

describe('a resumed stream that asks for a new request and then breaks', () => {
  it('lets the person answer the new request and keeps the finished call', async () => {
    const assistantId = await pauseOnCodeApproval();
    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta(CODE_RESULT);
      callbacks.onDelta(searchRequest('call_1'));
      callbacks.onError(new Error('The network connection was lost.'));
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_0', 'approved');

    expect(storedTool('call_0')).toMatchObject({
      status: 'succeeded',
      approvalDecision: 'approved',
      output: '3367',
    });
    expect(storedTool('call_1')).toMatchObject({
      status: 'awaiting-approval',
      requiresApproval: true,
    });

    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_1', 'approved');

    expect(mockStreamResume).toHaveBeenCalledTimes(2);
    expect(mockStreamResume.mock.calls[1]![0]).toMatchObject({
      run_id: RUN_ID,
      tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
    });
  });

  it('lets the person answer the new request after an unexpected throw', async () => {
    const assistantId = await pauseOnCodeApproval();
    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta(CODE_RESULT);
      callbacks.onDelta(searchRequest('call_1'));
      throw new Error('The network connection was lost.');
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_0', 'approved');

    expect(storedTool('call_0')).toMatchObject({ status: 'succeeded', output: '3367' });

    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_1', 'approved');

    expect(mockStreamResume).toHaveBeenCalledTimes(2);
    expect(mockStreamResume.mock.calls[1]![0].tool_approvals).toEqual([
      { tool_call_id: 'call_1', decision: 'approved' },
    ]);
  });
});

describe('a request the server sends twice before anyone decides it', () => {
  it('is held once and answered once', async () => {
    const assistantId = await pauseOnCodeApproval(2);
    const pending = lastAssistantMessage()!.toolCalls?.filter(
      (call) => call.requiresApproval === true,
    );
    expect(pending?.map((call) => call.toolCallId)).toEqual(['call_0']);

    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });
    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_0', 'approved');

    expect(mockStreamResume).toHaveBeenCalledTimes(1);
    expect(mockStreamResume.mock.calls[0]![0].tool_approvals).toEqual([
      { tool_call_id: 'call_0', decision: 'approved' },
    ]);
  });
});
