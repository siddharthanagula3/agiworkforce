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
const CLOUD_MODEL = LOCKED_CLOUD_MODELS[0]?.id ?? 'gpt-5.6-sol';

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

describe('cloud send: canonical agent activity', () => {
  it('projects the validated event stream into durable message metadata', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      const base = {
        schemaVersion: 3 as const,
        sessionId: 'session-mobile-activity',
        turnId: 'turn-mobile-activity',
      };
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 0,
          emittedAtMs: 1_000,
          event: { type: 'lifecycle', phase: 'started' },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 1,
          emittedAtMs: 1_100,
          event: {
            type: 'tool-execution-start',
            toolCallId: 'search-1',
            name: 'web_search',
            category: 'web-search',
            summary: 'Searching official sources',
            input: { query: 'official agent docs' },
          },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 2,
          emittedAtMs: 1_200,
          event: {
            type: 'source-list',
            toolCallId: 'search-1',
            query: 'official agent docs',
            sources: [{ url: 'https://example.com/docs', title: 'Official docs' }],
          },
        },
      });
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 3,
          emittedAtMs: 1_400,
          event: {
            type: 'tool-execution-end',
            toolCallId: 'search-1',
            name: 'web_search',
            output: { resultCount: 1 },
            isError: false,
            elapsedMs: 300,
          },
        },
      });
      callbacks.onDelta({ content: 'Verified answer.' });
      callbacks.onDelta({
        x_agent_event: {
          ...base,
          sequence: 4,
          emittedAtMs: 1_500,
          event: { type: 'stop', reason: 'end-turn' },
        },
      });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'research this', CLOUD_MODEL);

    expect(lastAssistantMessage()?.metadata?.agentActivity).toMatchObject({
      schemaVersion: 1,
      status: 'completed',
      sessionId: 'session-mobile-activity',
      turnId: 'turn-mobile-activity',
      lastSequence: 4,
      entries: [
        expect.objectContaining({
          kind: 'tool',
          toolCallId: 'search-1',
          status: 'completed',
          sources: [{ url: 'https://example.com/docs', title: 'Official docs' }],
        }),
      ],
    });
  });

  it('settles a started activity as failed with safe UI copy on transport error', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_agent_event: {
          schemaVersion: 3,
          sessionId: 'session-mobile-failure',
          turnId: 'turn-mobile-failure',
          sequence: 0,
          emittedAtMs: 2_000,
          event: { type: 'lifecycle', phase: 'started' },
        },
      });
      callbacks.onError(new Error('provider-secret-diagnostic'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'research this', CLOUD_MODEL);

    const activity = lastAssistantMessage()?.metadata?.agentActivity;
    expect(activity).toMatchObject({ status: 'failed', stopReason: 'error' });
    expect(JSON.stringify(activity)).toContain('Something went wrong. Please try again.');
    expect(JSON.stringify(activity)).not.toContain('provider-secret-diagnostic');
  });

  it('settles and persists the current Cloud activity when the user taps Stop', async () => {
    let activityStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      activityStarted = resolve;
    });
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks, signal) => {
      callbacks.onDelta({
        x_agent_event: {
          schemaVersion: 3,
          sessionId: 'session-mobile-cancel',
          turnId: 'turn-mobile-cancel',
          sequence: 0,
          emittedAtMs: 3_000,
          event: { type: 'lifecycle', phase: 'started' },
        },
      });
      activityStarted();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    });
    useChatMessageStore.getState().setCurrentConversationId(CONV_ID);

    const send = useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'research until stopped', CLOUD_MODEL);
    await started;
    useChatExecutionStore.getState().stopStreaming();
    await send;

    expect(lastAssistantMessage()).toMatchObject({
      isStreaming: false,
      metadata: {
        agentActivity: expect.objectContaining({
          status: 'cancelled',
          stopReason: 'cancelled',
        }),
      },
    });
  });
});
