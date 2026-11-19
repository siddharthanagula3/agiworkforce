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

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));
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

import { CONTINUE_GENERATION_INSTRUCTION } from '@agiworkforce/unified-chat/continue-generation';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_ID = '0190a000-0000-7000-8000-000000000032';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const SEED = 'The migration needs three steps. First export the schema, then run the';
const REST = ' import script, and finally check the row counts in every table you moved.';

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('cloud-continue-test-user');
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

function answers() {
  return (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).filter(
    (message) => message.role === 'assistant',
  );
}

async function sendCutOffAnswer(): Promise<string> {
  mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ content: SEED });
    callbacks.onDelta({ finish_reason: 'length' });
    callbacks.onDone();
  });
  await useChatExecutionStore.getState().sendMessage(CONV_ID, 'How do I migrate?', CLOUD_MODEL);
  const [answer] = answers();
  expect(answer?.metadata?.finishReason).toBe('length');
  return answer!.id;
}

function continueAnswer(answerId: string) {
  return useChatExecutionStore.getState().continueCloudAnswer(CONV_ID, answerId);
}

describe('continuing a cut-off cloud answer', () => {
  it('appends the rest to the same answer and asks for a continuation, not a new turn', async () => {
    const answerId = await sendCutOffAnswer();
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: REST });
      callbacks.onDelta({ finish_reason: 'stop' });
      callbacks.onDone();
    });

    await expect(continueAnswer(answerId)).resolves.toBe(true);

    expect(answers()).toHaveLength(1);
    expect(answers()[0]).toMatchObject({ id: answerId, content: SEED + REST, isStreaming: false });
    expect(answers()[0]?.metadata?.finishReason).toBe('stop');
    const [body, , , options] = mockStreamChat.mock.calls[1]!;
    expect(options).toEqual({ ignorePickerSpeed: true, purpose: 'continue' });
    expect(body.messages.slice(-2)).toEqual([
      { role: 'assistant', content: SEED },
      { role: 'user', content: CONTINUE_GENERATION_INSTRUCTION },
    ]);
    expect(useChatExecutionStore.getState().streamingConversationIds).toEqual([]);
  });

  it('queues the merged answer for sync so other devices get all of it', async () => {
    const answerId = await sendCutOffAnswer();
    useCloudSyncStateStore.getState().reset();
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: REST });
      callbacks.onDone();
    });

    await continueAnswer(answerId);

    expect(useCloudSyncStateStore.getState().dirtyMessages).toContainEqual({
      conversationId: CONV_ID,
      messageId: answerId,
    });
  });

  it('drops the tail the model repeats before resuming', async () => {
    const answerId = await sendCutOffAnswer();
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: `then run the${REST}` });
      callbacks.onDone();
    });

    await continueAnswer(answerId);

    expect(answers()[0]?.content).toBe(SEED + REST);
  });

  it('keeps what arrived and offers Continue again when the continuation fails', async () => {
    const answerId = await sendCutOffAnswer();
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: ' import script, and' });
      callbacks.onError(new Error('Network request failed'));
    });

    await continueAnswer(answerId);

    expect(answers()[0]).toMatchObject({
      content: `${SEED} import script, and`,
      isStreaming: false,
    });
    expect(answers()[0]?.metadata?.finishReason).toBe('length');
    expect(useChatExecutionStore.getState()).toMatchObject({
      error: 'This answer could not be continued. Try again.',
      streamingConversationIds: [],
    });
  });

  it('leaves the answer as it was when the continuation brings nothing', async () => {
    const answerId = await sendCutOffAnswer();
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });

    await continueAnswer(answerId);

    expect(answers()[0]).toMatchObject({ content: SEED, isStreaming: false });
    expect(answers()[0]?.metadata?.finishReason).toBe('length');
    expect(useChatExecutionStore.getState().error).toBe(
      'This answer could not be continued. Try again.',
    );
  });

  it('keeps the continued text and marks the answer stopped when the user taps Stop', async () => {
    const answerId = await sendCutOffAnswer();
    useChatMessageStore.getState().setCurrentConversationId(CONV_ID);
    let streaming!: () => void;
    const started = new Promise<void>((resolve) => {
      streaming = resolve;
    });
    const longRest = `${REST} Then compare checksums for the largest tables before you switch traffic.`;
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks, signal) => {
      callbacks.onDelta({ content: longRest });
      streaming();
      await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve()));
    });

    const run = continueAnswer(answerId);
    await started;
    useChatExecutionStore.getState().stopStreaming();
    await run;

    expect(answers()[0]).toMatchObject({ content: SEED + longRest, isStreaming: false });
    expect(answers()[0]?.metadata?.finishReason).toBe('stopped');
  });

  it('only continues the last answer in the thread', async () => {
    const answerId = await sendCutOffAnswer();
    mockStreamChat.mockImplementationOnce(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDelta({ content: 'Roll back by restoring the snapshot.' });
      callbacks.onDone();
    });
    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'And rollback?', CLOUD_MODEL);
    mockStreamChat.mockClear();

    await expect(continueAnswer(answerId)).resolves.toBe(false);
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  it('asks the reader to sign in instead of continuing without an account', async () => {
    const answerId = await sendCutOffAnswer();
    invalidateCloudAccount();
    mockStreamChat.mockClear();

    await expect(continueAnswer(answerId)).resolves.toBe(false);
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(useChatExecutionStore.getState().error).toBe('Sign in to use AGI Cloud.');
  });
});
