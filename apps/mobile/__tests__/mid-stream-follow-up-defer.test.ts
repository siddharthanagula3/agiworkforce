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
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { LOCKED_CLOUD_MODELS } from '../src/features/model-picker/service';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000f4';
const CLOUD_MODEL = LOCKED_CLOUD_MODELS[0]?.id ?? requireMobileCloudModel().id;

function send(content: string): Promise<boolean> {
  return useChatExecutionStore.getState().sendMessage(CONV_ID, content, CLOUD_MODEL);
}

async function waitForStreamCalls(count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (mockStreamChat.mock.calls.length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function outgoingPromptAt(callIndex: number): string {
  const body = mockStreamChat.mock.calls[callIndex]?.[0] as
    | { messages?: Array<{ role: string; content: unknown }> }
    | undefined;
  return JSON.stringify(body?.messages?.at(-1) ?? null);
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('mid-stream-follow-up-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({ error: null, paywallError: null });
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

describe('sending while a turn is still streaming', () => {
  it('defers the follow-up instead of aborting the running turn, then sends it when the turn ends', async () => {
    let firstSignal: AbortSignal | undefined;
    let releaseFirstStream!: () => void;
    let firstStreamStarted!: () => void;
    const firstStreamRunning = new Promise<void>((resolve) => {
      firstStreamStarted = resolve;
    });

    mockStreamChat.mockImplementation(
      async (_body, callbacks: StreamCallbacks, signal: AbortSignal) => {
        if (!firstSignal) {
          firstSignal = signal;
          firstStreamStarted();
          await new Promise<void>((resolve) => {
            releaseFirstStream = resolve;
          });
          callbacks.onDelta({ content: 'first answer' });
          callbacks.onDone();
          return;
        }
        callbacks.onDelta({ content: 'second answer' });
        callbacks.onDone();
      },
    );

    const firstTurn = send('first question');
    await firstStreamRunning;

    const accepted = await send('follow-up typed mid-response');

    expect(accepted).toBe(true);
    expect(firstSignal?.aborted).toBe(false);
    expect(mockStreamChat).toHaveBeenCalledTimes(1);

    releaseFirstStream();
    await firstTurn;
    await waitForStreamCalls(2);

    expect(mockStreamChat).toHaveBeenCalledTimes(2);
    expect(outgoingPromptAt(1)).toContain('follow-up typed mid-response');

    const messages = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
    expect(messages.filter((message) => message.role === 'user').map((m) => m.content)).toEqual([
      'first question',
      'follow-up typed mid-response',
    ]);
    expect(messages.some((message) => message.content === 'first answer')).toBe(true);
  });

  it('refuses a sixth waiting follow-up rather than growing the queue without bound', async () => {
    let releaseFirstStream!: () => void;
    let firstStreamStarted!: () => void;
    let started = false;
    const firstStreamRunning = new Promise<void>((resolve) => {
      firstStreamStarted = resolve;
    });

    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      if (!started) {
        started = true;
        firstStreamStarted();
        await new Promise<void>((resolve) => {
          releaseFirstStream = resolve;
        });
      }
      callbacks.onDone();
    });

    const firstTurn = send('first question');
    await firstStreamRunning;

    for (let index = 0; index < 5; index += 1) {
      expect(await send(`follow-up ${index}`)).toBe(true);
    }

    expect(await send('one too many')).toBe(false);
    expect(useChatExecutionStore.getState().error).toContain('Only 5 follow-ups');

    releaseFirstStream();
    await firstTurn;
    await waitForStreamCalls(6);
  });
});
