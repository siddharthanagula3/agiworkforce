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
    apiFetch: jest.fn(),
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

jest.mock('../lib/mmkv', () => {
  const values = new Map<string, string>();
  return {
    whenMmkvReady: jest.fn((cb: () => void) => cb()),
    rehydrateWhenMmkvReady: jest.fn(),
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
      clearAll: () => values.clear(),
    },
    mmkvStorage: {
      getItem: jest.fn().mockReturnValue(null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
  };
});

import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import { storage } from '../lib/mmkv';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { StreamConnectionLostError } from '../services/streamConnectionLost';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { inFlightTurnFor } from '../src/features/chat/inFlightTurnRun';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import {
  __resetPendingApprovalTurnsForTests,
  useChatExecutionStore,
} from '../stores/chat/chatExecutionStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-000000000082';
const RUN_ID = '0190a000-0000-7000-8000-000000000083';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;

beforeEach(() => {
  jest.clearAllMocks();
  mockStreamChat.mockReset();
  storage.clearAll();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('in-flight-turn-run-user');
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

function rows() {
  return useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
}

describe('a Cloud question whose run the server has started', () => {
  it('keeps the request id before the request leaves, for an app ended before any reply', async () => {
    let seenBeforeEgress: ReturnType<typeof inFlightTurnFor> = null;
    let finish: () => void = () => undefined;
    let requested: () => void = () => undefined;
    const sentToServer = new Promise<void>((resolve) => {
      requested = resolve;
    });
    mockStreamChat.mockImplementationOnce(
      (_body, callbacks: StreamCallbacks) =>
        new Promise<void>((resolve) => {
          const question = rows().find((row) => row.role === 'user');
          seenBeforeEgress = question ? inFlightTurnFor(CONV_ID, question.id) : null;
          requested();
          finish = () => {
            callbacks.onDone();
            resolve();
          };
        }),
    );

    const sent = useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Why is the sky blue?', CLOUD_MODEL);
    await sentToServer;

    const question = rows().find((row) => row.role === 'user');
    const answer = rows().find((row) => row.role === 'assistant');
    expect(seenBeforeEgress).toEqual({
      conversationId: CONV_ID,
      questionId: question!.id,
      operationId: answer!.id,
    });

    finish();
    await sent;
    expect(inFlightTurnFor(CONV_ID, question!.id)).toBeNull();
  });

  it('keeps a queued operation recoverable if the connection drops before the answer', async () => {
    const identity = {
      questionId: '0190a000-0000-7000-8000-000000000084',
      assistantMessageId: '0190a000-0000-7000-8000-000000000085',
    };
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new StreamConnectionLostError());
    });

    await expect(
      useChatExecutionStore
        .getState()
        .sendMessage(CONV_ID, 'saved question', CLOUD_MODEL, undefined, {
          offlineReplayIdentity: identity,
        }),
    ).resolves.toBe(true);

    expect(rows().map((row) => row.id)).toEqual([identity.questionId]);
    expect(inFlightTurnFor(CONV_ID, identity.questionId)).toEqual({
      conversationId: CONV_ID,
      questionId: identity.questionId,
      operationId: identity.assistantMessageId,
    });
    expect(useChatExecutionStore.getState().error).toBeNull();
  });

  it('leaves a visible partial reply in the conversation after a queued connection loss', async () => {
    const identity = {
      questionId: '0190a000-0000-7000-8000-000000000086',
      assistantMessageId: '0190a000-0000-7000-8000-000000000087',
    };
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'The visible beginning of an answer.' });
      callbacks.onError(new StreamConnectionLostError());
    });

    await expect(
      useChatExecutionStore
        .getState()
        .sendMessage(CONV_ID, 'saved question', CLOUD_MODEL, undefined, {
          offlineReplayIdentity: identity,
        }),
    ).resolves.toBe(true);

    expect(rows().find((row) => row.id === identity.assistantMessageId)).toMatchObject({
      content: 'The visible beginning of an answer.',
      isStreaming: false,
    });
  });

  it('keeps the run on the phone while the answer is still streaming', async () => {
    let finish: () => void = () => undefined;
    let runReferenced: () => void = () => undefined;
    const referenced = new Promise<void>((resolve) => {
      runReferenced = resolve;
    });
    mockStreamChat.mockImplementationOnce(
      (_body, callbacks: StreamCallbacks) =>
        new Promise<void>((resolve) => {
          callbacks.onRunReference?.({
            runId: RUN_ID,
            runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
            lastSequence: -1,
          });
          callbacks.onDelta({ content: 'Half an answer' });
          runReferenced();
          finish = () => {
            callbacks.onDone();
            resolve();
          };
        }),
    );

    const sent = useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Why is the sky blue?', CLOUD_MODEL);
    await referenced;

    const question = rows().find((row) => row.role === 'user');
    const answer = rows().find((row) => row.role === 'assistant');
    expect(question).toBeDefined();
    expect(answer?.isStreaming).toBe(true);
    expect(inFlightTurnFor(CONV_ID, question!.id)).toEqual({
      conversationId: CONV_ID,
      questionId: question!.id,
      operationId: answer!.id,
      runId: RUN_ID,
    });

    const body = mockStreamChat.mock.calls[0]![0] as { operationId: string };
    expect(body.operationId).toBe(answer!.id);
    expect(
      createManagedChatIdempotencyKey({
        surface: 'mobile',
        purpose: 'send',
        operationId: body.operationId,
      }).endsWith(`.${answer!.id}`),
    ).toBe(true);

    finish();
    await sent;

    expect(rows().find((row) => row.id === answer!.id)?.isStreaming).toBe(false);
    expect(inFlightTurnFor(CONV_ID, question!.id)).toBeNull();
  });
});
