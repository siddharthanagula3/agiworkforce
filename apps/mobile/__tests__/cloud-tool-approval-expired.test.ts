/**
 * chatExecutionStore cloud send — tool-approval registry liveness
 * (streaming/approval cluster Finding 1: dead tool-approval buttons after
 * reload/restart).
 *
 * `pendingApprovalTurns` (the module-level registry `resolveToolApproval`
 * consults) is process-memory-only and doesn't survive a cold start, even
 * though a persisted `awaiting_approval` tool call on the message does.
 * `isApprovalTurnLive` is what ToolCallTimeline checks before rendering
 * live Allow/Deny buttons instead of an expired notice. Mirrors
 * cloud-stream-finish-reason-and-error.test.ts's mock scaffolding.
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

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

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

import { streamChat, type StreamCallbacks } from '../services/streaming';
import {
  useChatExecutionStore,
  isApprovalTurnLive,
  __resetPendingApprovalTurnsForTests,
} from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { LOCKED_CLOUD_MODELS } from '../src/features/model-picker/service';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-000000000003'; // a valid UUIDv7 conversation id
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

describe('isApprovalTurnLive', () => {
  it('is false for a message id that never suspended', () => {
    expect(isApprovalTurnLive('some-random-id')).toBe(false);
  });

  it('is true right after a turn suspends on an approval request', async () => {
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
    expect(isApprovalTurnLive(assistantId)).toBe(true);
    // Sanity: the card that's live is the exact requiresApproval one (mobile
    // models approval as an independent flag, not a 'status' literal --
    // status stays 'running' -- see ToolCall's doc comment in types/chat.ts).
    const awaiting = lastAssistantMessage()?.toolCalls?.find((t) => t.requiresApproval);
    expect(awaiting?.toolCallId).toBe('call_1');
  });

  it('is false after a simulated cold start even though the persisted card still shows awaiting_approval (the exact Finding 1 scenario)', async () => {
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
    expect(isApprovalTurnLive(assistantId)).toBe(true);

    // Simulate a cold start: the in-memory registry resets, but the message
    // store (standing in for a freshly-loaded conversation from the DB)
    // still shows the tool call as requiring approval -- exactly what
    // persistence does, since it's independent of the live registry.
    __resetPendingApprovalTurnsForTests();

    const stillAwaiting = lastAssistantMessage()?.toolCalls?.some((t) => t.requiresApproval);
    expect(stillAwaiting).toBe(true); // persisted card still shows requiresApproval
    expect(isApprovalTurnLive(assistantId)).toBe(false);
  });
});
