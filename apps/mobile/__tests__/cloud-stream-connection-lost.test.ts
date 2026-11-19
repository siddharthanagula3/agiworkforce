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
    api: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      uploadFile: jest.fn(),
    },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({
  streamChat: jest.fn(),
  streamToolApprovalResume: jest.fn(),
}));
jest.mock('../services/replyReadyNotice', () => ({
  announceReplyReadyInBackground: jest.fn(),
}));
jest.mock('../services/llmGate', () => ({
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
  CloudProviderConsentRequiredError: class CloudProviderConsentRequiredError extends Error {},
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

import { AGENT_EVENT_SCHEMA_VERSION, WEB_SEARCH_CITATION_DELTA_KEY } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { streamChat, streamToolApprovalResume, type StreamCallbacks } from '../services/streaming';
import { StreamConnectionLostError } from '../services/streamConnectionLost';
import {
  __resetPendingApprovalTurnsForTests,
  useChatExecutionStore,
} from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import { continuableCloudModel } from '../src/features/chat/utils/continuableAnswer';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockStreamResume = streamToolApprovalResume as jest.MockedFunction<
  typeof streamToolApprovalResume
>;

const CONV_ID = '0190a000-0000-7000-8000-000000000072';
const RUN_ID = '0190a000-0000-7000-8000-000000000073';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const CONNECTION_LOST = {
  message: 'Connection lost.',
  code: 'stream_interrupted',
  retryable: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStreamChat.mockReset();
  mockStreamResume.mockReset();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('cloud-connection-lost-user');
  __resetPendingApprovalTurnsForTests();
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

function answer() {
  return (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).find(
    (message) => message.role === 'assistant',
  );
}

function agentEvent(sequence: number, event: AgentEventEnvelope['event']): AgentEventEnvelope {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session-research',
    turnId: 'turn-research',
    sequence,
    emittedAtMs: 1_000 + sequence,
    event,
  } as AgentEventEnvelope;
}

const AGENT_PAGES = [
  { url: 'https://tides.example.org/moon', title: 'The moon and the tides' },
  { url: 'https://tides.example.org/sun', title: 'The sun and the tides' },
];

function send(prompt = 'Why are there two tides a day?') {
  return useChatExecutionStore.getState().sendMessage(CONV_ID, prompt, CLOUD_MODEL);
}

describe('a Cloud answer whose connection drops part way', () => {
  it('keeps the text that arrived once and names the lost connection on the answer', async () => {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'The moon pulls the near side of the ocean. ' });
      callbacks.onDelta({ content: 'The far side bulges as' });
      callbacks.onError(new StreamConnectionLostError());
    });

    await send();

    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    expect(answer()).toMatchObject({
      content: 'The moon pulls the near side of the ocean. The far side bulges as',
      isStreaming: false,
    });
    expect(answer()?.metadata?.streamError).toEqual(CONNECTION_LOST);
    expect(useChatExecutionStore.getState()).toMatchObject({
      error: 'Connection lost.',
      streamingConversationIds: [],
    });
  });

  it('names the lost connection when a continuation drops too', async () => {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'The migration needs three steps. First export the' });
      callbacks.onDelta({ finish_reason: 'length' });
      callbacks.onDone();
    });
    await send('How do I migrate?');
    const answerId = answer()!.id;
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: ' schema, then run the import' });
      callbacks.onError(new StreamConnectionLostError());
    });

    await useChatExecutionStore.getState().continueCloudAnswer(CONV_ID, answerId);

    expect(answer()).toMatchObject({
      content: 'The migration needs three steps. First export the schema, then run the import',
      isStreaming: false,
    });
    expect(answer()?.metadata?.streamError).toEqual(CONNECTION_LOST);
    expect(answer()?.metadata?.finishReason).toBe('length');
    expect(useChatExecutionStore.getState().error).toBe('Connection lost.');
  });
});

describe('continuing an answer that lost its connection', () => {
  async function loseConnectionAfter(text: string): Promise<string> {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: text });
      callbacks.onError(new StreamConnectionLostError());
    });
    await send();
    return answer()!.id;
  }

  function conversation() {
    return useChatCloudMessageStore.getState().conversations.find((c) => c.id === CONV_ID)!;
  }

  it('is offered even when the text that arrived ends on a full sentence', async () => {
    await loseConnectionAfter('The moon pulls the near side of the ocean.');

    expect(continuableCloudModel(conversation(), answer()!)).toBe(CLOUD_MODEL);
  });

  it('appends to the same answer and clears the lost connection once text arrives', async () => {
    const answerId = await loseConnectionAfter('The moon pulls the near side of the ocean.');
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: ' The far side bulges as the Earth is pulled away from it.' });
      callbacks.onDelta({ finish_reason: 'stop' });
      callbacks.onDone();
    });

    await expect(
      useChatExecutionStore.getState().continueCloudAnswer(CONV_ID, answerId),
    ).resolves.toBe(true);

    expect(mockStreamChat).toHaveBeenCalledTimes(2);
    expect(mockStreamChat.mock.calls[1]?.[3]).toMatchObject({ purpose: 'continue' });
    expect(answer()).toMatchObject({
      id: answerId,
      content:
        'The moon pulls the near side of the ocean. The far side bulges as the Earth is pulled away from it.',
      isStreaming: false,
    });
    expect(answer()?.metadata?.streamError).toBeUndefined();
    expect(answer()?.metadata?.finishReason).toBe('stop');
    expect(useChatExecutionStore.getState().error).toBeNull();
    expect(continuableCloudModel(conversation(), answer()!)).toBeNull();
  });

  it('keeps the lost connection when the continuation adds nothing', async () => {
    const answerId = await loseConnectionAfter('The moon pulls the near side of the ocean.');
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().continueCloudAnswer(CONV_ID, answerId);

    expect(answer()).toMatchObject({
      content: 'The moon pulls the near side of the ocean.',
      isStreaming: false,
    });
    expect(answer()?.metadata?.streamError).toEqual(CONNECTION_LOST);
    expect(useChatExecutionStore.getState().error).toBe(
      'This answer could not be continued. Try again.',
    );
    expect(continuableCloudModel(conversation(), answer()!)).toBe(CLOUD_MODEL);
  });
});

describe('sources an agent run reports as activity', () => {
  it('appear while the answer streams and stay, after the cited page, when it completes', async () => {
    let liveCitations: unknown;
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_agent_event: agentEvent(0, { type: 'lifecycle', phase: 'started' }) });
      callbacks.onDelta({
        x_agent_event: agentEvent(1, {
          type: 'source-list',
          query: 'two tides a day',
          sources: AGENT_PAGES,
        }),
      });
      liveCitations = answer()?.citations;
      callbacks.onDelta({ content: 'Two bulges pass each shore daily [1].' });
      callbacks.onDelta({
        [WEB_SEARCH_CITATION_DELTA_KEY]: {
          url: 'https://tides.example.org/sun',
          title: 'Solar tides',
        },
      });
      callbacks.onDelta({ finish_reason: 'stop' });
      callbacks.onDone();
    });

    await send();

    expect(liveCitations).toEqual(AGENT_PAGES);
    expect(answer()?.citations?.map((source) => source.url)).toEqual([
      'https://tides.example.org/sun',
      'https://tides.example.org/moon',
    ]);
    expect(answer()?.metadata?.streamError).toBeUndefined();
  });

  it('stay on an answer that ended early, beside the failure that marks them partial', async () => {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({
        x_agent_event: agentEvent(1, { type: 'source-list', sources: AGENT_PAGES }),
      });
      callbacks.onDelta({ content: 'The moon pulls the near side' });
      callbacks.onError(new StreamConnectionLostError());
    });

    await send();

    expect(answer()?.citations).toEqual(AGENT_PAGES);
    expect(answer()?.metadata?.streamError).toEqual(CONNECTION_LOST);
  });

  it('give no sources to an agent turn that read no pages', async () => {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_agent_event: agentEvent(0, { type: 'lifecycle', phase: 'started' }) });
      callbacks.onDelta({ content: 'Tides come from the moon and the sun.' });
      callbacks.onDelta({ finish_reason: 'stop' });
      callbacks.onDone();
    });

    await send();

    expect(answer()?.citations).toBeUndefined();
  });

  it('appear on a turn resumed after an approval, while it streams and when it completes', async () => {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onRunReference?.({
        runId: RUN_ID,
        runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
        lastSequence: -1,
      });
      callbacks.onDelta({ x_agent_event: agentEvent(0, { type: 'lifecycle', phase: 'started' }) });
      callbacks.onDelta({
        x_tool_approval_request: {
          tool_call_id: 'call_0',
          name: 'web_search',
          args: { query: 'two tides a day' },
          risk_tier: 'low',
          destructive: false,
          approval_scopes: ['once'],
        },
      });
      callbacks.onDelta({
        x_agent_event: agentEvent(1, {
          type: 'approval-requested',
          approvalId: 'call_0',
          toolCallId: 'call_0',
          name: 'web_search',
          category: 'web-search',
          summary: 'Search the web',
          input: { query: 'two tides a day' },
        }),
      });
      callbacks.onDelta({ x_agent_event: agentEvent(2, { type: 'lifecycle', phase: 'paused' }) });
      callbacks.onDone();
    });
    await send();
    const answerId = answer()!.id;
    expect(answer()?.citations).toBeUndefined();

    let liveCitations: unknown;
    mockStreamResume.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ x_agent_event: agentEvent(3, { type: 'lifecycle', phase: 'resumed' }) });
      callbacks.onDelta({
        x_agent_event: agentEvent(4, {
          type: 'source-list',
          query: 'two tides a day',
          sources: AGENT_PAGES,
        }),
      });
      liveCitations = answer()?.citations;
      callbacks.onDelta({ content: 'Two bulges pass each shore daily.' });
      callbacks.onDelta({ finish_reason: 'stop' });
      callbacks.onDone();
    });

    await useChatExecutionStore
      .getState()
      .resolveToolApproval(CONV_ID, answerId, 'call_0', 'approved');

    expect(mockStreamResume).toHaveBeenCalledTimes(1);
    expect(liveCitations).toEqual(AGENT_PAGES);
    expect(answer()).toMatchObject({
      content: 'Two bulges pass each shore daily.',
      isStreaming: false,
    });
    expect(answer()?.citations).toEqual(AGENT_PAGES);
  });
});
