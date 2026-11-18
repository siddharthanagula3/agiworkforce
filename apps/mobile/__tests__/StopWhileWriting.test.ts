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
  cancelMobileCloudAgentRun: jest.fn(),
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

import { cancelMobileCloudAgentRun, streamChat, type StreamCallbacks } from '../services/streaming';
import {
  clearCloudExecutionState,
  stopEveryCloudStream,
  useChatExecutionStore,
} from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockCancelRun = cancelMobileCloudAgentRun as jest.MockedFunction<
  typeof cancelMobileCloudAgentRun
>;

const CONV_ID = '0190a000-0000-7000-8000-000000000071';
const RUN_ID = '0190a000-0000-7000-8000-000000000072';
const CLOUD_MODEL = requireFreeMobileCloudModel().id;
const WRITTEN = 'Canals began as irrigation ditches and grew into';
const LATE = ' the arteries of the industrial age.';

interface WritingTurn {
  callbacks: StreamCallbacks;
  signal: AbortSignal;
  sent: Promise<boolean>;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearCloudExecutionState();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('stop-while-writing-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({ error: null, paywallError: null });
  useChatAppModeStore.getState().setAppMode('local');
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV_ID,
    title: 'Canals',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: CLOUD_MODEL,
    executionMode: 'cloud',
  });
  useChatMessageStore.getState().setCurrentConversationId(CONV_ID);
  mockCancelRun.mockReturnValue(new Promise(() => undefined));
});

function answer() {
  return (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).find(
    (message) => message.role === 'assistant',
  );
}

async function startWriting(): Promise<WritingTurn> {
  let turn!: Omit<WritingTurn, 'sent'>;
  const writing = new Promise<void>((resolve) => {
    mockStreamChat.mockImplementationOnce(async (_body, callbacks, signal) => {
      turn = { callbacks, signal: signal! };
      callbacks.onRunReference?.({
        runId: RUN_ID,
        runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
        lastSequence: -1,
      });
      callbacks.onDelta({ content: WRITTEN });
      resolve();
      await new Promise<void>((settle) =>
        signal?.addEventListener('abort', () => settle(), { once: true }),
      );
    });
  });
  const sent = useChatExecutionStore
    .getState()
    .sendMessage(CONV_ID, 'Write a long essay about canals.', CLOUD_MODEL);
  await writing;
  expect(answer()).toMatchObject({ content: WRITTEN, isStreaming: true });
  return { ...turn, sent };
}

describe('tapping Stop while the answer is being written', () => {
  it('ends the live read at once and settles the answer as stopped', async () => {
    const turn = await startWriting();

    useChatExecutionStore.getState().stopStreaming();

    expect(turn.signal.aborted).toBe(true);
    expect(answer()).toMatchObject({ content: WRITTEN, isStreaming: false });
    expect(answer()?.metadata?.finishReason).toBe('stopped');
    expect(useChatExecutionStore.getState().streamingConversationIds).toEqual([]);

    await turn.sent;
    expect(answer()).toMatchObject({ content: WRITTEN, isStreaming: false });
    expect(answer()?.metadata?.finishReason).toBe('stopped');
  });

  it('asks the server to cancel the run straight away, without waiting for the stream', async () => {
    await startWriting();

    useChatExecutionStore.getState().stopStreaming();

    expect(mockCancelRun).toHaveBeenCalledTimes(1);
    expect(mockCancelRun).toHaveBeenCalledWith(RUN_ID);
  });

  it('ignores text and endings that arrive after the tap', async () => {
    const turn = await startWriting();
    useChatExecutionStore.getState().stopStreaming();

    turn.callbacks.onDelta({ content: LATE });
    turn.callbacks.onDelta({ finish_reason: 'stop' });
    turn.callbacks.onDone();

    expect(answer()).toMatchObject({ content: WRITTEN, isStreaming: false });
    expect(answer()?.metadata?.finishReason).toBe('stopped');
  });

  it('never picks the run up again after the stop', async () => {
    const turn = await startWriting();
    useChatExecutionStore.getState().stopStreaming();

    turn.callbacks.onRunReference?.({
      runId: RUN_ID,
      runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
      lastSequence: 4,
    });
    useChatExecutionStore.getState().stopStreaming();

    expect(mockCancelRun).toHaveBeenCalledTimes(1);
    expect(answer()?.metadata?.finishReason).toBe('stopped');
  });

  it('stays stopped and shows the error when the server cannot cancel the run', async () => {
    mockCancelRun.mockReset().mockRejectedValue(new Error('offline'));
    const turn = await startWriting();

    useChatExecutionStore.getState().stopStreaming();
    await Promise.resolve();
    await Promise.resolve();

    expect(turn.signal.aborted).toBe(true);
    expect(answer()?.metadata?.finishReason).toBe('stopped');
    expect(useChatExecutionStore.getState().error).toBe(
      'Could not stop the Cloud task. Check its activity before retrying.',
    );
  });
});

describe('tapping Stop before the answer starts', () => {
  it('keeps the question, marked as stopped, and never asks for an answer', async () => {
    const sent = useChatExecutionStore
      .getState()
      .sendMessage(CONV_ID, 'Write a long essay about canals.', CLOUD_MODEL);
    useChatExecutionStore.getState().stopStreaming();
    await sent;

    const rows = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(rows.map((row) => row.role)).toEqual(['user']);
    expect(rows[0]?.content).toBe('Write a long essay about canals.');
    expect(rows[0]?.metadata?.finishReason).toBe('stopped');
  });
});

describe('turning off sharing with AI providers while answers are being written', () => {
  const OTHER_CONV_ID = '0190a000-0000-7000-8000-000000000073';
  const OTHER_RUN_ID = '0190a000-0000-7000-8000-000000000074';

  function otherAnswer() {
    return (useChatCloudMessageStore.getState().messages[OTHER_CONV_ID] ?? []).find(
      (message) => message.role === 'assistant',
    );
  }

  async function startWritingElsewhere(): Promise<WritingTurn> {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: OTHER_CONV_ID,
      title: 'Bridges',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      pinned: false,
      model: CLOUD_MODEL,
      executionMode: 'cloud',
    });
    let turn!: Omit<WritingTurn, 'sent'>;
    const writing = new Promise<void>((resolve) => {
      mockStreamChat.mockImplementationOnce(async (_body, callbacks, signal) => {
        turn = { callbacks, signal: signal! };
        callbacks.onRunReference?.({
          runId: OTHER_RUN_ID,
          runPath: `/api/llm/v1/chat/completions/runs/${OTHER_RUN_ID}`,
          lastSequence: -1,
        });
        callbacks.onDelta({ content: WRITTEN });
        resolve();
        await new Promise<void>((settle) =>
          signal?.addEventListener('abort', () => settle(), { once: true }),
        );
      });
    });
    const sent = useChatExecutionStore
      .getState()
      .sendMessage(OTHER_CONV_ID, 'Write about bridges.', CLOUD_MODEL);
    await writing;
    return { ...turn, sent };
  }

  it('returns the runs of the answers it stopped, once, so the caller can pause them', async () => {
    await startWriting();
    await startWritingElsewhere();

    expect(stopEveryCloudStream()).toEqual([RUN_ID, OTHER_RUN_ID]);
    expect(stopEveryCloudStream()).toEqual([]);
  });

  it('stops every Cloud answer, also outside the open conversation, and pauses rather than cancels', async () => {
    const open = await startWriting();
    const elsewhere = await startWritingElsewhere();
    expect(useChatExecutionStore.getState().streamingConversationIds).toEqual([
      CONV_ID,
      OTHER_CONV_ID,
    ]);

    stopEveryCloudStream();

    expect(open.signal.aborted).toBe(true);
    expect(elsewhere.signal.aborted).toBe(true);
    expect(useChatExecutionStore.getState().isStreaming).toBe(false);
    expect(useChatExecutionStore.getState().streamingConversationIds).toEqual([]);
    for (const stopped of [answer(), otherAnswer()]) {
      expect(stopped).toMatchObject({ content: WRITTEN, isStreaming: false });
      expect(stopped?.metadata?.finishReason).toBe('stopped');
    }
    expect(mockCancelRun).not.toHaveBeenCalled();

    open.callbacks.onDelta({ content: LATE });
    await open.sent;
    await elsewhere.sent;
    expect(answer()).toMatchObject({ content: WRITTEN, isStreaming: false });
    expect(otherAnswer()).toMatchObject({ content: WRITTEN, isStreaming: false });
  });
});
