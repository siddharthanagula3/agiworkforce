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

import { streamChat, type StreamCallbacks } from '../services/streaming';
import {
  useChatExecutionStore,
  __resetPendingApprovalTurnsForTests,
} from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import type { StreamDelta } from '../services/streaming';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-000000000005';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('reasoning-test-user');
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

function reasoningFrame(sequence: number, delta: string): StreamDelta {
  return {
    x_agent_event: {
      schemaVersion: 5,
      sessionId: '00000000-0000-4000-8000-000000000001',
      turnId: 'agi.mobile.send.fixture',
      sequence,
      emittedAtMs: 1792954871898 + sequence,
      event: { type: 'reasoning-delta', delta },
    },
  } as StreamDelta;
}

describe('managed reasoning-delta frames', () => {
  it('shows streamed reasoning while keeping it out of the answer', async () => {
    const midStream: Array<{ reasoning?: string; content: string }> = [];
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta(reasoningFrame(3, "I'm setting up the"));
      callbacks.onDelta(reasoningFrame(4, ' cryptarithm'));
      const live = lastAssistantMessage()!;
      midStream.push({ reasoning: live.reasoning, content: live.content });
      callbacks.onDelta({ content: 'The answer is 42.' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'solve it', CLOUD_MODEL);

    expect(midStream[0]).toEqual({ reasoning: "I'm setting up the cryptarithm", content: '' });
    const final = lastAssistantMessage()!;
    expect(final.reasoning).toBe("I'm setting up the cryptarithm");
    expect(final.content).toBe('The answer is 42.');
    expect(final.isStreaming).toBe(false);
    expect(final.metadata?.thinkingDurationSeconds).toEqual(expect.any(Number));
  });

  it('does not repeat reasoning that also arrives as thinking tags', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta(reasoningFrame(3, 'Weighing the options'));
      callbacks.onDelta({ content: '<thinking>Weighing the options</thinking>Go with B.' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'pick', CLOUD_MODEL);

    expect(lastAssistantMessage()?.reasoning).toBe('Weighing the options');
    expect(lastAssistantMessage()?.content).toBe('Go with B.');
  });

  it('settles the thinking when the stream fails', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta(reasoningFrame(3, 'Partial thought'));
      callbacks.onError(new Error('connection lost'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'solve it', CLOUD_MODEL);

    const message = lastAssistantMessage()!;
    expect(message.isStreaming).toBe(false);
    expect(message.reasoning).toBe('Partial thought');
    expect(message.content).not.toContain('Partial thought');
    expect(useChatExecutionStore.getState().streamingReasoning).toBe('');
  });

  it('settles the thinking when the user stops the reply', async () => {
    let streamReached: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      streamReached = resolve;
    });
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks, signal) => {
      callbacks.onDelta(reasoningFrame(3, 'Partial thought'));
      streamReached();
      await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve()));
    });

    useChatMessageStore.getState().setCurrentConversationId(CONV_ID);
    const sending = useChatExecutionStore.getState().sendMessage(CONV_ID, 'solve it', CLOUD_MODEL);
    await reached;
    useChatExecutionStore.getState().stopStreaming();
    await sending;

    const message = lastAssistantMessage()!;
    expect(message.isStreaming).toBe(false);
    expect(message.reasoning).toBe('Partial thought');
    expect(message.content).toBe('');
    expect(useChatExecutionStore.getState().streamingReasoning).toBe('');
  });
});
