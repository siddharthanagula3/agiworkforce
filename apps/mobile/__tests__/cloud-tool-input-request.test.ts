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
  streamToolInputResume: jest.fn(),
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

import { streamChat, streamToolInputResume, type StreamCallbacks } from '../services/streaming';
import {
  useChatExecutionStore,
  __resetPendingApprovalTurnsForTests,
} from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import { ApiHttpError } from '../services/apiErrors';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockInputResume = streamToolInputResume as jest.MockedFunction<typeof streamToolInputResume>;

const CONV_ID = '0190a000-0000-7000-8000-000000000004';
const RUN_ID = '0190a000-0000-7000-8000-000000000014';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('input-resume-test-user');
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

const INPUT_REQUESTS = {
  confirm_repo: {
    method: 'elicitation/create',
    params: {
      message: 'Which repository should I use?',
      requestedSchema: {
        type: 'object',
        properties: { repo: { type: 'string', title: 'Repository' } },
        required: ['repo'],
      },
    },
  },
};

async function pauseOnInput(toolCallId = 'call_input'): Promise<string> {
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onRunReference?.({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      lastSequence: -1,
    });
    callbacks.onDelta({
      x_tool_input_request: {
        tool_call_id: toolCallId,
        name: 'mcp__github__create_issue',
        connector_id: 'github',
        input_requests: INPUT_REQUESTS,
        round: 0,
      },
    });
    callbacks.onDone();
  });
  await useChatExecutionStore.getState().sendMessage(CONV_ID, 'file an issue', CLOUD_MODEL);
  return lastAssistantMessage()!.id;
}

const ANSWER = [
  {
    toolCallId: 'call_input',
    responses: { confirm_repo: { action: 'accept', content: { repo: 'acme/app' } } },
  },
];

describe('chat tool input requests (MCP input_required)', () => {
  it('keeps the paused input on the message with its run', async () => {
    await pauseOnInput();

    expect(lastAssistantMessage()?.pendingToolInput).toMatchObject({
      runId: RUN_ID,
      toolCalls: [
        {
          toolCallId: 'call_input',
          name: 'mcp__github__create_issue',
          connectorId: 'github',
          round: 0,
          inputRequests: INPUT_REQUESTS,
        },
      ],
    });
  });

  it('resumes the same run with the answers and continues the reply', async () => {
    const assistantId = await pauseOnInput();
    mockInputResume.mockImplementationOnce(async (body, callbacks: StreamCallbacks) => {
      expect(lastAssistantMessage()?.pendingToolInput).toBeUndefined();
      callbacks.onDelta({ content: 'Filed the issue in acme/app.' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().answerToolInput(CONV_ID, assistantId, ANSWER);

    expect(mockInputResume).toHaveBeenCalledTimes(1);
    expect(mockInputResume.mock.calls[0]![0]).toMatchObject({
      run_id: RUN_ID,
      tool_inputs: [
        {
          tool_call_id: 'call_input',
          input_responses: { confirm_repo: { action: 'accept', content: { repo: 'acme/app' } } },
        },
      ],
    });
    expect(lastAssistantMessage()?.content).toContain('Filed the issue in acme/app.');
    expect(lastAssistantMessage()?.pendingToolInput).toBeUndefined();
  });

  it('ignores answers for a tool call the run is not paused on', async () => {
    const assistantId = await pauseOnInput();

    await useChatExecutionStore
      .getState()
      .answerToolInput(CONV_ID, assistantId, [{ toolCallId: 'call_other', responses: {} }]);

    expect(mockInputResume).not.toHaveBeenCalled();
    expect(lastAssistantMessage()?.pendingToolInput).toBeDefined();
  });

  it.each([404, 410])('closes the request when the server says it is gone (%i)', async (status) => {
    const assistantId = await pauseOnInput();
    const reason = 'This input request expired and can no longer be resumed.';
    mockInputResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new ApiHttpError(reason, status));
    });

    await useChatExecutionStore.getState().answerToolInput(CONV_ID, assistantId, ANSWER);

    expect(lastAssistantMessage()?.pendingToolInput).toBeUndefined();
    expect(useChatExecutionStore.getState().error).toBe(reason);
  });

  it('offers the form again when the resume fails for a transient reason', async () => {
    const assistantId = await pauseOnInput();
    mockInputResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new ApiHttpError('Service unavailable', 503));
    });

    await useChatExecutionStore.getState().answerToolInput(CONV_ID, assistantId, ANSWER);

    expect(lastAssistantMessage()?.pendingToolInput?.runId).toBe(RUN_ID);
    expect(useChatExecutionStore.getState().error).toContain('Service unavailable');

    mockInputResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });
    await useChatExecutionStore.getState().answerToolInput(CONV_ID, assistantId, ANSWER);
    expect(mockInputResume).toHaveBeenCalledTimes(2);
  });
});
