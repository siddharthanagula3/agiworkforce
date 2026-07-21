/**
 * chatExecutionStore cloud tool-approval resume — server-owned checkpoint.
 *
 * Mobile sends only the durable run id and decisions. The server restores the
 * trusted transcript/tool results and may suspend the same run again.
 */
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
} from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { LOCKED_CLOUD_MODELS } from '../src/features/model-picker/service';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockStreamResume = streamToolApprovalResume as jest.MockedFunction<
  typeof streamToolApprovalResume
>;

const CONV_ID = '0190a000-0000-7000-8000-000000000004'; // a valid UUIDv7 conversation id
const RUN_ID = '0190a000-0000-7000-8000-000000000014';
const CLOUD_MODEL = LOCKED_CLOUD_MODELS[0]?.id ?? 'gpt-5.6-sol';

beforeEach(() => {
  jest.clearAllMocks();
  __resetPendingApprovalTurnsForTests();
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatAppModeStore.getState().setAppMode('local'); // onDone's auto-sync no-ops while asserting
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

describe('resolveToolApproval — durable server-owned checkpoint', () => {
  it('resumes a recursive approval with the same run id and no transcript replay', async () => {
    const activityBase = {
      schemaVersion: 3 as const,
      sessionId: 'session-approval-1',
      turnId: 'turn-approval-1',
    };
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onRunReference?.({
        runId: RUN_ID,
        runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
        lastSequence: -1,
      });
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 0,
          emittedAtMs: 1_000,
          event: { type: 'lifecycle', phase: 'started' },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 1,
          emittedAtMs: 1_100,
          event: {
            type: 'approval-requested',
            approvalId: 'approval-1',
            toolCallId: 'call_1',
            name: 'mcp__github__get_pull_request_diff',
            category: 'mcp',
            summary: 'Read pull request diff',
            input: { owner: 'acme', repo: 'app', pull_number: 7 },
            riskLevel: 'low',
          },
        },
      });
      callbacks.onDelta({
        x_tool_approval_request: {
          tool_call_id: 'call_1',
          name: 'mcp__github__get_pull_request_diff',
          args: { owner: 'acme', repo: 'app', pull_number: 7 },
        },
      });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'summarize PR 7', CLOUD_MODEL);
    const assistantId = lastAssistantMessage()!.id;

    const REAL_RESULT = '# My Project\n\nThis project does X, Y, and Z.';

    // First resume (approving call_1): the tool actually runs and reports
    // its real output via x_tool_result, then the turn suspends AGAIN on a
    // second tool.
    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 2,
          emittedAtMs: 1_200,
          event: { type: 'approval-resolved', approvalId: 'approval-1', decision: 'approved' },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 3,
          emittedAtMs: 1_250,
          event: { type: 'lifecycle', phase: 'resumed' },
        },
      });
      callbacks.onDelta({
        x_tool_result: {
          tool_call_id: 'call_1',
          name: 'mcp__github__get_pull_request_diff',
          content: REAL_RESULT,
          is_error: false,
        },
        x_agent_event: {
          ...activityBase,
          sequence: 4,
          emittedAtMs: 1_400,
          event: {
            type: 'tool-execution-end',
            toolCallId: 'call_1',
            name: 'mcp__github__get_pull_request_diff',
            output: REAL_RESULT,
            isError: false,
            elapsedMs: 300,
          },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 5,
          emittedAtMs: 1_500,
          event: {
            type: 'approval-requested',
            approvalId: 'approval-2',
            toolCallId: 'call_2',
            name: 'mcp__github__create_comment',
            category: 'mcp',
            summary: 'Create pull request comment',
            input: { body: 'nice PR' },
            riskLevel: 'medium',
          },
        },
      });
      callbacks.onDelta({
        x_tool_approval_request: {
          tool_call_id: 'call_2',
          name: 'mcp__github__create_comment',
          args: { body: 'nice PR' },
        },
      });
      callbacks.onDone();
    });

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_1', 'approved');

    expect(mockStreamResume.mock.calls[0]?.[0]).toEqual({
      run_id: RUN_ID,
      operationId: expect.any(String),
      tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
    });
    expect(mockStreamResume.mock.calls[0]?.[0]).not.toHaveProperty('model');
    expect(mockStreamResume.mock.calls[0]?.[0]).not.toHaveProperty('messages');

    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 6,
          emittedAtMs: 1_600,
          event: { type: 'approval-resolved', approvalId: 'approval-2', decision: 'approved' },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 7,
          emittedAtMs: 1_650,
          event: { type: 'lifecycle', phase: 'resumed' },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 8,
          emittedAtMs: 1_800,
          event: {
            type: 'tool-execution-end',
            toolCallId: 'call_2',
            name: 'mcp__github__create_comment',
            output: { created: true },
            isError: false,
            elapsedMs: 200,
          },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...activityBase,
          sequence: 9,
          emittedAtMs: 1_900,
          event: { type: 'stop', reason: 'end-turn' },
        },
      });
      callbacks.onDone();
    });

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_2', 'approved');

    expect(mockStreamResume.mock.calls[1]?.[0]).toEqual({
      run_id: RUN_ID,
      operationId: expect.any(String),
      tool_approvals: [{ tool_call_id: 'call_2', decision: 'approved' }],
    });
    expect(lastAssistantMessage()?.metadata?.agentActivity).toMatchObject({
      status: 'completed',
      lastSequence: 9,
      entries: [
        expect.objectContaining({ toolCallId: 'call_1', status: 'completed' }),
        expect.objectContaining({ toolCallId: 'call_2', status: 'completed' }),
      ],
    });
  });
});
