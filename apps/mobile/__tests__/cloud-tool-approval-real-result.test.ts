/**
 * chatExecutionStore cloud tool-approval resume — real tool output on a
 * recursive suspend (streaming/approval cluster Finding 2: a turn suspending
 * AGAIN on a further approval request used to rebuild the prior round's tool
 * result as a hardcoded '(executed)' placeholder instead of the real
 * accumulator content that already streamed -- discarding file contents /
 * command output / search results the model needs to reason about the next
 * call). Mirrors cloud-tool-approval-expired.test.ts's mock scaffolding.
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
const CLOUD_MODEL = LOCKED_CLOUD_MODELS[0]?.id ?? 'gpt-5.5';

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

describe('resolveToolApproval — recursive resume carries the REAL tool result', () => {
  it('replays the actual x_tool_result content (not a placeholder) when a resume suspends again on a further tool', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
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
        x_tool_result: {
          tool_call_id: 'call_1',
          name: 'mcp__github__get_pull_request_diff',
          content: REAL_RESULT,
          is_error: false,
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

    // Second resume (approving call_2): capture what thread this call
    // received -- it must carry call_1's REAL result, not '(executed)'.
    let capturedMessages: Array<{ role: string; tool_call_id?: string; content?: string }> = [];
    mockStreamResume.mockImplementationOnce(async (body, callbacks: StreamCallbacks) => {
      capturedMessages = body.messages as typeof capturedMessages;
      callbacks.onDone();
    });

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, assistantId, 'call_2', 'approved');

    const call1ToolMessage = capturedMessages.find(
      (m) => m.role === 'tool' && m.tool_call_id === 'call_1',
    );
    expect(call1ToolMessage?.content).toBe(REAL_RESULT);
    expect(call1ToolMessage?.content).not.toBe('(executed)');
  });
});
