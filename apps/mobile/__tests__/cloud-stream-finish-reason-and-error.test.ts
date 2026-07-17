/**
 * chatExecutionStore cloud send — finish_reason / x_stream_error capture.
 *
 * Regression: `services/streaming.ts` parsed `finish_reason` off the wire and
 * forwarded it via `onDelta`, but chatExecutionStore's onDelta never read it
 * at all — a mid-stream provider failure (server sends a clean [DONE] with no
 * other signal; see the additive `x_stream_error` delta) rendered as an
 * ordinary completion with zero indication, worse than web/desktop (which at
 * least persisted finishReason even before their own fix). This pins that
 * both fields land on the persisted message's metadata after a real
 * sendMessage() call, mirroring cloud-sync-wiring.test.ts's mock scaffolding.
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
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { LOCKED_CLOUD_MODELS } from '../src/features/model-picker/service';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-000000000002'; // a valid UUIDv7 conversation id
const CLOUD_MODEL = LOCKED_CLOUD_MODELS[0]?.id ?? 'gpt-5.5';

beforeEach(() => {
  jest.clearAllMocks();
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

describe('cloud send: finish_reason capture', () => {
  it('persists the LAST finish_reason seen (server tool loops emit intermediate values first)', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'partial' });
      callbacks.onDelta({ finish_reason: 'tool_calls' });
      callbacks.onDelta({ finish_reason: 'length' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.finishReason).toBe('length');
  });

  it('does NOT record finishReason when the wire never sends one (normal completion, no signal)', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'complete answer' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.finishReason).toBeUndefined();
  });
});

describe('cloud send: x_stream_error capture (mid-stream provider failure)', () => {
  it('persists metadata.streamError as {message,code,retryable} from an additive x_stream_error delta, keeping the partial content', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'partial answer before' });
      callbacks.onDelta({
        x_stream_error: { message: 'Anthropic API overloaded', code: '529', retryable: true },
        finish_reason: 'error',
      });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    const assistantMsg = lastAssistantMessage();
    expect(assistantMsg?.metadata?.streamError).toEqual({
      message: 'Anthropic API overloaded',
      code: '529',
      retryable: true,
    });
    expect(assistantMsg?.content).toBe('partial answer before');
  });

  it('accepts a bare-string x_stream_error defensively (wraps it as {message})', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_stream_error: 'rate limited' as never });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toEqual({ message: 'rate limited' });
  });

  it('keeps the FIRST error payload seen, not the last (it identifies the actual failure)', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_stream_error: { message: 'first failure' } });
      callbacks.onDelta({ x_stream_error: { message: 'second failure' } });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toEqual({ message: 'first failure' });
  });

  it('does NOT record streamError on a normal completion (no x_stream_error delta)', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'complete answer', finish_reason: 'stop' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.streamError).toBeUndefined();
  });
});
